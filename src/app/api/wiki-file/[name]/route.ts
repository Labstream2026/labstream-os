import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canSeeWiki } from "@/lib/wiki-access";
import { readBuffer, mimeFor } from "@/lib/storage";
import { previewRel } from "@/lib/image";

export const runtime = "nodejs";

// Sirve archivos/imágenes subidos dentro de las páginas de la Wiki
// (storage/wikifile/<name>). Solo para el equipo interno con acceso a la Wiki.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const session = await getSession();
  if (!session || !(await canSeeWiki(session))) return new NextResponse("No autorizado", { status: 403 });

  const { name } = await ctx.params;
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, ""); // sin barras → sin path traversal
  if (!safe || safe.includes("..")) return new NextResponse("No encontrado", { status: 404 });

  // Si existe el derivado WebP optimizado (imágenes), se sirve ese; si no, el original.
  let buf: Buffer;
  let contentType: string;
  try {
    buf = await readBuffer(previewRel(`wikifile/${safe}`));
    contentType = "image/webp";
  } catch {
    try {
      buf = await readBuffer(`wikifile/${safe}`);
      contentType = mimeFor(safe, "application/octet-stream") ?? "application/octet-stream";
    } catch {
      return new NextResponse("No encontrado", { status: 404 });
    }
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
