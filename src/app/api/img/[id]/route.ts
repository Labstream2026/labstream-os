import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { readBuffer } from "@/lib/storage";

// Sirve imágenes subidas a celdas de tablas (storage/tableimg/<id>).
// Requiere sesión (material interno del equipo). Detecta el tipo por bytes.
function sniff(buf: Buffer): string {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length > 6 && buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  return "application/octet-stream";
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });
  const { id } = await ctx.params;
  const safe = id.replace(/[^a-zA-Z0-9-]/g, "");
  if (!safe) return new NextResponse("No encontrado", { status: 404 });
  let buf: Buffer;
  try {
    buf = await readBuffer(`tableimg/${safe}`);
  } catch {
    return new NextResponse("No encontrado", { status: 404 });
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": sniff(buf), "Cache-Control": "private, max-age=60" },
  });
}
