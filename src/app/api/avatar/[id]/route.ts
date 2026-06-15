import { NextRequest, NextResponse } from "next/server";
import { readBuffer } from "@/lib/storage";
import { previewRel } from "@/lib/image";

// Sirve la foto de perfil de un usuario (guardada en storage/avatars/<id>).
// Pública (solo imágenes de avatar); detecta el tipo por los primeros bytes.
function sniff(buf: Buffer): string {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length > 6 && buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  return "application/octet-stream";
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // id viene de la URL; sanitizamos a [a-z0-9] para evitar traversal.
  const safe = id.replace(/[^a-zA-Z0-9]/g, "");
  if (!safe) return new NextResponse("No encontrado", { status: 404 });
  // Derivado WebP optimizado si existe; si no, el original.
  let buf: Buffer;
  let contentType: string;
  try {
    buf = await readBuffer(previewRel(`avatars/${safe}`));
    contentType = "image/webp";
  } catch {
    try {
      buf = await readBuffer(`avatars/${safe}`);
      contentType = sniff(buf);
    } catch {
      return new NextResponse("No encontrado", { status: 404 });
    }
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=60",
    },
  });
}
