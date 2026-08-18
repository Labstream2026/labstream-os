import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { descargarAdjunto } from "@/lib/correo/imap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Baja UN adjunto directo del servidor IMAP (no se guardan en la base). Siempre como
// DESCARGA (attachment + nosniff): un HTML o SVG adjunto renderizado en nuestro origen sería
// saltarse todo el saneado del cuerpo por la puerta de al lado.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; indice: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });

  const { id, indice } = await ctx.params;
  const i = Number.parseInt(indice, 10);
  if (!Number.isInteger(i) || i < 0 || i > 200) return new NextResponse("Adjunto inválido", { status: 400 });

  const r = await descargarAdjunto(id, i, session.id);
  if ("error" in r) return new NextResponse(r.error, { status: r.status });

  return new NextResponse(new Uint8Array(r.contenido), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(r.nombre)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
