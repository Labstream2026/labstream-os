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
