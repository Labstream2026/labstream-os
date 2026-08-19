import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// La imagen de una PLANTILLA de firma del estudio, para las vistas previas del panel y del
// compositor. En los correos no se usa esta URL: la imagen viaja incrustada (CID).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role === "cliente" || session.role === "demo") return new NextResponse("No autorizado", { status: 401 });

  const { id } = await ctx.params;
  const t = await db.mailSignatureTemplate.findUnique({ where: { id }, select: { imageBytes: true, imageMime: true } });
  if (!t?.imageBytes) return new NextResponse("Sin imagen", { status: 404 });

  return new NextResponse(new Uint8Array(t.imageBytes), {
    headers: {
      "Content-Type": t.imageMime ?? "image/png",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache", // se re-sube al editar la plantilla: mejor fresca
    },
  });
}
