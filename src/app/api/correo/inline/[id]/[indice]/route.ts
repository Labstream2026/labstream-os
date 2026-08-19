import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { descargarAdjunto } from "@/lib/correo/imap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sirve UNA parte INCRUSTADA (cid:) de un correo — la imagen de una firma, un GIF — para
// pintarla dentro del mensaje. A diferencia de /adjunto, aquí sí va INLINE, pero SOLO si la
// parte es de verdad una imagen: cualquier otra cosa (HTML, SVG con scripts, PDF) se niega —
// esta ruta jamás puede volverse un renderizador de contenido hostil en nuestro origen.
const MIME_IMAGEN = /^image\/(png|jpe?g|gif|webp|bmp|avif)$/i;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; indice: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });

  const { id, indice } = await ctx.params;
  const i = Number.parseInt(indice, 10);
  if (!Number.isInteger(i) || i < 0 || i > 200) return new NextResponse("Parte inválida", { status: 400 });

  // El índice debe corresponder a una parte que el sync registró CON cid (incrustada de
  // verdad), no a un adjunto cualquiera pedido por esta puerta.
  const msg = await db.mailMessage.findFirst({
    where: { id, account: { userId: session.id } },
    select: { attachments: true },
  });
  const meta = ((msg?.attachments as { indice: number; mime?: string; cid?: string }[] | null) ?? []).find((a) => a.indice === i);
  if (!meta?.cid || !MIME_IMAGEN.test(meta.mime ?? "")) return new NextResponse("No es una imagen incrustada", { status: 404 });

  const r = await descargarAdjunto(id, i, session.id);
  if ("error" in r) return new NextResponse(r.error, { status: r.status });
  if (!MIME_IMAGEN.test(r.mime)) return new NextResponse("No es una imagen", { status: 404 });

  return new NextResponse(new Uint8Array(r.contenido), {
    headers: {
      "Content-Type": r.mime,
      "X-Content-Type-Options": "nosniff",
      // El mismo mensaje se abre varias veces: la imagen incrustada no cambia jamás.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
