import { sanitizeName } from "@/lib/storage";

// Tope por archivo del enlace público de subida del cliente: 200 MB (para no cargar el NAS).
export const MAX_CLIENT_UPLOAD = 200 * 1024 * 1024;

// Solo imágenes y video (el material que el cliente sube). NUNCA ejecutables/scripts/office —
// el enlace es público, así que la lista de tipos es cerrada y explícita.
const ALLOWED_RE = /\.(jpe?g|png|webp|gif|heic|heif|mp4|m4v|mov|webm|mkv|ogv)$/i;
const IMAGE_RE = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

export function isAllowedClientUpload(name: string): boolean {
  return ALLOWED_RE.test(name);
}
export function isImageUpload(name: string): boolean {
  return IMAGE_RE.test(name);
}

// Subcarpeta (bajo STORAGE_DIR) donde cae el material de un proyecto. El equipo puede fijar una
// carpeta propia (`uploadDir`), p. ej. bind-monteada a un volumen del NAS; si no, la por defecto.
// Se SANEA para que nunca salga de STORAGE_DIR: cada segmento pasa por sanitizeName y se descartan
// "." / ".." / rutas absolutas. El guardado siempre valida traversal con absPath() además.
export function projectUploadRelDir(project: { id: string; uploadDir: string | null }): string {
  const raw = (project.uploadDir ?? "").trim();
  if (!raw) return `project/${project.id}`;
  const segs = raw
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => sanitizeName(s.trim()))
    .filter((s) => s && s !== "." && s !== "..");
  return segs.length ? segs.join("/") : `project/${project.id}`;
}

export class UploadTooLargeError extends Error {
  constructor() {
    super("El archivo supera el límite de 200 MB.");
  }
}

// Lee el cuerpo (stream) imponiendo un tope de bytes: si se pasa, cancela y lanza (un enlace
// filtrado no puede subir archivos gigantes ni reventar la memoria sin control).
export async function readBodyWithLimit(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new UploadTooLargeError();
      }
      chunks.push(Buffer.from(value));
    }
  }
  return Buffer.concat(chunks);
}
