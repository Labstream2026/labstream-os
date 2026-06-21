import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, AI_MODEL, aiEnabled } from "@/lib/ai";
import { readBuffer } from "@/lib/storage";

// Análisis de los archivos que el USUARIO adjunta en el chat de Marcebot, para que el bot
// los "entienda". Usa Claude directo (visión + lectura nativa de PDF), no OpenClaw: así no
// dependemos de si el gateway soporta multimodal, y cubre imágenes y PDF sin librerías extra.
// El texto resultante se inyecta como contexto al agente (que sigue corriendo por OpenClaw).

const SUPPORTED_IMG = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_FILES = 5;
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB por archivo (límite holgado para visión/PDF)

type Att = { name: string; mime: string | null; path: string };

function analyzable(a: Att): boolean {
  return !!a.path && (SUPPORTED_IMG.includes(a.mime ?? "") || a.mime === "application/pdf");
}

// Devuelve un resumen en español del contenido de los adjuntos legibles (imágenes/PDF), o
// null si no hay nada que analizar. Best-effort: nunca lanza.
export async function analyzeUserAttachments(attachments: Att[]): Promise<string | null> {
  const usable = attachments.filter(analyzable).slice(0, MAX_FILES);
  if (!usable.length) return null;
  if (!aiEnabled) {
    return `El usuario adjuntó ${usable.map((a) => a.name).join(", ")}, pero no puedo analizar imágenes/PDF: falta configurar la clave de IA (ANTHROPIC_API_KEY) en el servidor.`;
  }

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: "El usuario te envió estos archivos en el chat del equipo. Describe su contenido y extrae lo relevante (texto, datos, lo que se ve) de forma concisa y en español. Si es una cotización, factura o documento, resume sus puntos clave (montos, fechas, cliente, alcance).",
    },
  ];
  for (const a of usable) {
    let buf: Buffer;
    try {
      buf = await readBuffer(a.path);
    } catch {
      continue; // archivo no disponible: se omite
    }
    if (buf.length > MAX_BYTES) continue;
    const data = buf.toString("base64");
    if (a.mime === "application/pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
    } else {
      content.push({
        type: "image",
        source: { type: "base64", media_type: a.mime as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data },
      });
    }
  }
  if (content.length === 1) return null; // ninguno se pudo leer

  try {
    const res = await getAnthropic().messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text || null;
  } catch (e) {
    return `(No pude analizar el archivo adjunto: ${e instanceof Error ? e.message : "error"}.)`;
  }
}
