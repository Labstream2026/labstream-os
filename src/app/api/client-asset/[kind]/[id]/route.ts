import { NextRequest, NextResponse } from "next/server";
import { readBuffer } from "@/lib/storage";
import { previewRel } from "@/lib/image";
import { getSession } from "@/lib/auth";
import { userCanAccessClient } from "@/lib/client-access";

// Sirve la foto o el logo de un cliente (storage/client-photos/<id> o client-logos/<id>).
// Solo dentro de la app autenticada (igual que los banners): 404 a no autenticados.
function sniff(buf: Buffer): string {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length > 6 && buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  return "application/octet-stream";
}

const DIRS: Record<string, string> = { photo: "client-photos", logo: "client-logos" };

export async function GET(_req: NextRequest, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("No encontrado", { status: 404 });

  const { kind, id } = await ctx.params;
  const dir = DIRS[kind];
  const safe = id.replace(/[^a-zA-Z0-9]/g, "");
  if (!dir || !safe) return new NextResponse("No encontrado", { status: 404 });

  // Control de acceso: solo sirve la foto/logo a quien tiene acceso a ese cliente (404 si no).
  if (!(await userCanAccessClient(safe, session))) return new NextResponse("No encontrado", { status: 404 });

  let buf: Buffer;
  let contentType: string;
  try {
    buf = await readBuffer(previewRel(`${dir}/${safe}`));
    contentType = "image/webp";
  } catch {
    try {
      buf = await readBuffer(`${dir}/${safe}`);
      contentType = sniff(buf);
    } catch {
      return new NextResponse("No encontrado", { status: 404 });
    }
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=60" },
  });
}
