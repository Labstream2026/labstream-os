import { extractText, getDocumentProxy } from "unpdf";
import { readBuffer } from "@/lib/storage";
import { previewRel } from "@/lib/image";
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

const MAX_PDFS = 3;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_TEXT = 12000; // caracteres de texto extraído que se pasan al modelo

// Extrae el TEXTO de los PDF que adjunta el usuario (vía unpdf/pdfjs, pure-JS) para pasárselo
// al modelo por OpenClaw — GPT no lee PDFs nativo en chat-completions, así que le damos el
// texto. Devuelve un bloque por archivo, o null si no hay PDFs. No sirve para PDF escaneados
// (solo imagen): ahí no hay texto que extraer. Best-effort.
export async function extractDocsText(attachments: Att[]): Promise<string | null> {
  const pdfs = attachments.filter((a) => a.path && a.mime === "application/pdf").slice(0, MAX_PDFS);
  if (!pdfs.length) return null;
  const blocks: string[] = [];
  for (const a of pdfs) {
    let buf: Buffer;
    try {
      buf = await readBuffer(a.path);
    } catch {
      continue;
    }
    if (buf.length > MAX_PDF_BYTES) { blocks.push(`«${a.name}»: (demasiado grande para leer)`); continue; }
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const { text } = await extractText(pdf, { mergePages: true });
      const clean = String(text ?? "").replace(/[ \t]+\n/g, "\n").trim();
      if (clean) blocks.push(`«${a.name}»:\n${clean.slice(0, MAX_TEXT)}${clean.length > MAX_TEXT ? "\n…(texto truncado)" : ""}`);
      else blocks.push(`«${a.name}»: (sin texto extraíble; posiblemente es un PDF escaneado/solo imagen)`);
    } catch {
      blocks.push(`«${a.name}»: (no se pudo leer el PDF)`);
    }
  }
  return blocks.length ? blocks.join("\n\n") : null;
}
