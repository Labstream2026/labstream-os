import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { buildUserFeed } from "@/lib/calendar-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Feed de suscripción de calendario (webcal/ics de SOLO LECTURA). El token secreto de la URL ES
// la autenticación (no hay sesión: lo lee el servidor de Google/Apple/Outlook). Rotar el token
// desde el perfil revoca el enlace. Devuelve el calendario PERSONAL del titular del token.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token: raw } = await ctx.params;
  // La URL termina en «.ics» para que algunos clientes la acepten; el token real va sin extensión.
  const token = raw.replace(/\.ics$/i, "").trim();
  // Token demasiado corto = imposible que sea válido (los generamos de 32 hex).
  if (token.length < 16) return new NextResponse("Not found", { status: 404 });

  const user = await db.user.findUnique({
    where: { calendarFeedToken: token },
    select: { id: true, active: true },
  });
  if (!user || !user.active) return new NextResponse("Not found", { status: 404 });

  const ics = await buildUserFeed(user.id);
  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="labstream.ics"',
      // Solo lectura y personal: no cachear en intermediarios; los clientes refrescan por su cuenta.
      "Cache-Control": "private, no-store",
    },
  });
}
