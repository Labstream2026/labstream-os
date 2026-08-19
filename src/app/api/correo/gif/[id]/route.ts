import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Un GIF de la biblioteca del estudio, para previsualizarlo en el selector del redactor.
// Al ENVIAR no se usa esta URL: el GIF viaja incrustado (CID) dentro del mensaje.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role === "cliente" || session.role === "demo") return new NextResponse("No autorizado", { status: 401 });

  const { id } = await ctx.params;
  const gif = await db.mailGif.findUnique({ where: { id }, select: { mime: true, bytes: true } });
  if (!gif) return new NextResponse("No existe", { status: 404 });

  return new NextResponse(new Uint8Array(gif.bytes), {
    headers: {
      "Content-Type": gif.mime,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=604800", // inmutable en la práctica: se borra, no se edita
    },
  });
}
