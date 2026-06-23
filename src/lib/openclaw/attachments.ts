import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { readBuffer } from "@/lib/storage";
import { previewRel } from "@/lib/image";
import { getOpenClawConfig } from "./config";
import type { ContentPart } from "./client";

// Construye las partes de IMAGEN (formato OpenAI `image_url` con data URL) a partir de los
// adjuntos que el usuario manda en el chat, para pasárselas al modelo VÍA OpenClaw. El modelo
// lo elige el usuario en OpenClaw y debe tener visión (p. ej. GPT-5.5). No usa la API de
// Anthropic. Best-effort: si un archivo no se puede leer, se omite.
//
// Nota: por ahora solo imágenes (PNG/JPG/GIF/WebP). PDF/Word/Excel no los procesa el chat
// completions estándar de OpenAI; se añadirán aparte (conversión o extracción de texto).

const SUPPORTED_IMG = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGES = 4;
const MAX_BYTES = 8 * 1024 * 1024; // ~8 MB por imagen ya enviada

type Att = { name: string; mime: string | null; path: string };

export function hasAnalyzableImages(attachments: Att[]): boolean {
  return attachments.some((a) => a.path && SUPPORTED_IMG.includes(a.mime ?? ""));
}

export async function buildImageParts(attachments: Att[]): Promise<ContentPart[]> {
  const imgs = attachments.filter((a) => a.path && SUPPORTED_IMG.includes(a.mime ?? "")).slice(0, MAX_IMAGES);
  const parts: ContentPart[] = [];
  for (const a of imgs) {
    // Preferir la previsualización optimizada (webp, mucho más liviana) si existe; si no, el original.
    let buf: Buffer | null = null;
    let mime = a.mime ?? "image/png";
    try {
      buf = await readBuffer(previewRel(a.path));
      mime = "image/webp";
    } catch {
      try {
        buf = await readBuffer(a.path);
      } catch {
        continue;
      }
    }
    if (!buf || buf.length > MAX_BYTES) continue;
    parts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${buf.toString("base64")}` } });
  }
  return parts;
}

const MAX_DOCS = 3;
const MAX_DOC_BYTES = 25 * 1024 * 1024;
const MAX_TEXT = 12000; // caracteres de texto extraído que se pasan al modelo (por archivo)

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIMES = new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"]);

type DocKind = "pdf" | "docx" | "xlsx";
function docKind(a: Att): DocKind | null {
  const n = a.name.toLowerCase();
  if (a.mime === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (a.mime === DOCX_MIME || n.endsWith(".docx")) return "docx";
  if (XLSX_MIMES.has(a.mime ?? "") || n.endsWith(".xlsx") || n.endsWith(".xls")) return "xlsx";
  return null;
}

// Extrae el TEXTO de los documentos que adjunta el usuario (PDF vía unpdf, Word vía mammoth,
// Excel vía SheetJS) para pasárselo al modelo por OpenClaw — el chat-completions de GPT no lee
// estos archivos nativo, así que le damos su texto. Devuelve un bloque por archivo, o null si
// no hay documentos. PDF escaneado (solo imagen) no da texto. Pure-JS. Best-effort.
export async function extractDocsText(attachments: Att[]): Promise<string | null> {
  const docs = attachments
    .map((a) => ({ a, kind: docKind(a) }))
    .filter((d): d is { a: Att; kind: DocKind } => d.kind !== null && !!d.a.path)
    .slice(0, MAX_DOCS);
  if (!docs.length) return null;

  const blocks: string[] = [];
  for (const { a, kind } of docs) {
    let buf: Buffer;
    try {
      buf = await readBuffer(a.path);
    } catch {
      continue;
    }
    if (buf.length > MAX_DOC_BYTES) { blocks.push(`«${a.name}»: (demasiado grande para leer)`); continue; }
    try {
      let txt = "";
      if (kind === "pdf") {
        const pdf = await getDocumentProxy(new Uint8Array(buf));
        const { text } = await extractText(pdf, { mergePages: true });
        txt = String(text ?? "");
      } else if (kind === "docx") {
        const { value } = await mammoth.extractRawText({ buffer: buf });
        txt = value ?? "";
      } else {
        const wb = XLSX.read(buf, { type: "buffer" });
        txt = wb.SheetNames.map((n) => `# ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n]!)}`).join("\n\n");
      }
      const clean = txt.replace(/[ \t]+\n/g, "\n").trim();
      if (clean) blocks.push(`«${a.name}»:\n${clean.slice(0, MAX_TEXT)}${clean.length > MAX_TEXT ? "\n…(texto truncado)" : ""}`);
      else blocks.push(`«${a.name}»: (sin texto extraíble${kind === "pdf" ? "; posiblemente PDF escaneado/solo imagen" : ""})`);
    } catch {
      blocks.push(`«${a.name}»: (no se pudo leer)`);
    }
  }
  return blocks.length ? blocks.join("\n\n") : null;
}

// ── Notas de voz → texto (speech-to-text) ──
// Transcribe los audios adjuntos usando el endpoint compatible con OpenAI del MISMO OpenClaw
// del chat (`{baseUrl}/v1/audio/transcriptions`, tipo Whisper), con su mismo token. El nombre
// del modelo de transcripción es configurable por env (OPENCLAW_TRANSCRIBE_MODEL, def. whisper-1)
// por si tu gateway lo enruta con otro nombre. Best-effort: si algo falla, devuelve una nota.
const AUDIO_EXT = /\.(weba|webm|ogg|oga|m4a|mp4|mp3|mpga|mpeg|wav|aac|flac)$/i;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB (límite típico de Whisper)

function isAudio(a: Att): boolean {
  return !!a.path && ((a.mime ?? "").startsWith("audio/") || AUDIO_EXT.test(a.name));
}

export function hasAudio(attachments: Att[]): boolean {
  return attachments.some(isAudio);
}

export async function transcribeAudio(attachments: Att[]): Promise<string | null> {
  const auds = attachments.filter(isAudio).slice(0, 3);
  if (!auds.length) return null;
  const cfg = await getOpenClawConfig();
  if (!cfg) return null;
  const model = process.env.OPENCLAW_TRANSCRIBE_MODEL || "whisper-1";
  const lang = process.env.OPENCLAW_TRANSCRIBE_LANG || "es";
  const blocks: string[] = [];
  for (const a of auds) {
    let buf: Buffer;
    try { buf = await readBuffer(a.path); } catch { continue; }
    if (buf.length > MAX_AUDIO_BYTES) { blocks.push("(nota de voz demasiado larga para transcribir)"); continue; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const fd = new FormData();
      fd.append("file", new Blob([new Uint8Array(buf)], { type: a.mime ?? "audio/webm" }), a.name || "voz.webm");
      fd.append("model", model);
      if (lang) fd.append("language", lang);
      const res = await fetch(`${cfg.baseUrl}/v1/audio/transcriptions`, {
        method: "POST",
        headers: { ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}) },
        body: fd,
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        blocks.push(`(no se pudo transcribir la nota de voz — OpenClaw ${res.status}: ${detail || res.statusText})`);
        continue;
      }
      // El endpoint tipo Whisper devuelve { text: "..." } (o texto plano si response_format=text).
      const ct = res.headers.get("content-type") ?? "";
      let txt = "";
      if (ct.includes("application/json")) {
        const data = (await res.json().catch(() => null)) as { text?: string } | null;
        txt = (data?.text ?? "").trim();
      } else {
        txt = (await res.text().catch(() => "")).trim();
      }
      blocks.push(txt || "(nota de voz sin texto reconocible)");
    } catch (e) {
      blocks.push(e instanceof Error && e.name === "AbortError" ? "(la transcripción de la nota de voz tardó demasiado)" : "(no se pudo transcribir la nota de voz)");
    } finally {
      clearTimeout(timer);
    }
  }
  return blocks.length ? blocks.join("\n\n") : null;
}
