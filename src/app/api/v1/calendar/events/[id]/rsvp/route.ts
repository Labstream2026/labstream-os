import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { notifyAndEmail } from "@/lib/notify";
import { readJson, str } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };
const RSVP = new Set(["ACCEPTED", "DECLINED", "TENTATIVE"]);

// POST /api/v1/calendar/events/:id/rsvp  body { status: "ACCEPTED"|"DECLINED"|"TENTATIVE" } — el
// titular responde a una invitación. Espejo de respondToEvent: SOLO los invitados de la cita
// responden, y solo por sí mismos. Avisa al organizador.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const status = str(body.status).toUpperCase();
  if (!RSVP.has(status)) return apiJson({ ok: false, error: 'status debe ser "ACCEPTED", "DECLINED" o "TENTATIVE".' }, 400);

  const attendee = await db.calendarAttendee.findUnique({
    where: { eventId_userId: { eventId: id, userId: ctx.session.id } },
    select: { status: true, event: { select: { title: true, start: true, allDay: true, createdById: true } } },
  });
  if (!attendee) return apiJson({ ok: false, error: "No estás invitado a esta cita (solo los invitados responden)." }, 403);
  if (attendee.status === status) return apiJson({ ok: true, unchanged: true });
  await db.calendarAttendee.update({ where: { eventId_userId: { eventId: id, userId: ctx.session.id } }, data: { status } });

  const ev = attendee.event;
  if (ev.createdById && ev.createdById !== ctx.session.id) {
    await notifyAndEmail(ev.createdById, { type: "event", event: "calendar_event", title: `${ctx.session.name} respondió: ${ev.title}`, body: "Respondió a tu invitación.", link: "/calendario", actorId: ctx.session.id }).catch(() => null);
  }
  return apiJson({ ok: true, status });
});
