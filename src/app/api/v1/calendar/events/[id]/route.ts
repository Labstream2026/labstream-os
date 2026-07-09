import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { pushEventToParticipants, sendEventCancellations, removeEventFromParticipants } from "@/lib/calendar-sync";
import { notifyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
import { readJson, str, isYmd, isHm, shapeEvent, eventVisible, EVENT_INCLUDE } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

async function loadEvent(id: string) {
  return db.calendarEvent.findUnique({ where: { id }, include: EVENT_INCLUDE });
}

// Solo el CREADOR modifica/borra una cita (SIN excepción para admin: mismo criterio que
// updateMyEvent/deleteMyEvent en la app), y solo las creadas en la app — las importadas de
// Synology se gestionan en su calendario de origen.
function canManageEvent(e: { createdById: string | null; source: string }, ctx: ApiKeyContext): boolean {
  if (e.source !== "app") return false;
  return e.createdById === ctx.session.id;
}

// GET /api/v1/calendar/events/:id
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const event = await loadEvent(id);
  if (!event || !eventVisible(event, ctx.session)) return apiJson({ ok: false, error: "Cita no encontrada." }, 404);
  return apiJson({ ok: true, event: shapeEvent(event) });
});

// PATCH /api/v1/calendar/events/:id  body { title?, date?, time?, endTime?, description?, location? }
// Edita/reprograma la cita (solo el creador; permiso gestionar_calendario). time "" → todo el día.
// Los asistentes/invitados se fijan al crear (la reconciliación con sus calendarios Synology se
// hace desde la app). Tras el cambio se re-sincroniza y se avisa a los asistentes.
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (!hasPermission(ctx.session, "gestionar_calendario")) return apiJson({ ok: false, error: "Sin permiso (gestionar_calendario)." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  const event = await loadEvent(id);
  if (!event || !eventVisible(event, ctx.session)) return apiJson({ ok: false, error: "Cita no encontrada." }, 404);
  if (!canManageEvent(event, ctx)) return apiJson({ ok: false, error: "Solo quien creó la cita puede editarla; las importadas se editan en su calendario de origen." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    const t = body.title.trim().slice(0, 200);
    if (!t) return apiJson({ ok: false, error: "El título no puede quedar vacío." }, 400);
    data.title = t;
  }
  if (typeof body.description === "string") data.description = clampText(body.description.trim()) || null;
  if (typeof body.location === "string") data.location = body.location.trim().slice(0, 200) || null;

  // Reprogramación: campos ausentes conservan lo que había (fecha, hora o "todo el día").
  const reschedule = "date" in body || "time" in body || "endTime" in body;
  if (reschedule) {
    const prevDate = event.start.toISOString().slice(0, 10);
    const prevTime = event.allDay ? "" : event.start.toISOString().slice(11, 16);
    const prevEnd = event.end ? event.end.toISOString().slice(11, 16) : "";
    const date = "date" in body ? str(body.date) : prevDate;
    const time = "time" in body ? str(body.time) : prevTime;
    const endTime = "endTime" in body ? str(body.endTime) : prevEnd;
    if (!isYmd(date)) return apiJson({ ok: false, error: 'date debe ser "YYYY-MM-DD".' }, 400);
    if (time && !isHm(time)) return apiJson({ ok: false, error: 'time debe ser "HH:mm" (o "" para todo el día).' }, 400);
    if (endTime && !isHm(endTime)) return apiJson({ ok: false, error: 'endTime debe ser "HH:mm" (o "").' }, 400);
    const allDay = !time;
    const start = new Date(`${date}T${allDay ? "09:00" : time}:00`);
    if (Number.isNaN(start.getTime())) return apiJson({ ok: false, error: "Fecha/hora inválidas." }, 400);
    const end = !allDay && endTime ? new Date(`${date}T${endTime}:00`) : null;
    if (end && end <= start) return apiJson({ ok: false, error: "endTime debe ser posterior a time." }, 400);
    data.start = start;
    data.end = end;
    data.allDay = allDay;
  }
  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar." }, 400);

  await db.calendarEvent.update({ where: { id }, data });
  await pushEventToParticipants(id).catch(() => null);

  // Avisar a los asistentes (menos al titular) si la cita cambió de fecha/hora.
  if (reschedule) {
    const updated = await db.calendarEvent.findUnique({ where: { id }, select: { title: true, start: true, allDay: true } });
    if (updated) {
      const when = updated.allDay
        ? updated.start.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
        : updated.start.toLocaleString("es-CO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
      for (const a of event.attendees) {
        if (a.user.id === ctx.session.id) continue;
        await notifyAndEmail(a.user.id, { type: "event", event: "calendar_event", title: `Se movió la cita: ${updated.title}`, body: `${ctx.session.name} la reprogramó · ${when}`, link: "/calendario", actorId: ctx.session.id }).catch(() => null);
      }
    }
  }
  await logActivity({ action: "event.update", summary: `editó la cita «${event.title}» (vía API)`, projectId: event.projectId ?? undefined, entityType: "event", entityId: id }).catch(() => null);
  const fresh = await loadEvent(id);
  return apiJson({ ok: true, event: fresh ? shapeEvent(fresh) : null });
});

// DELETE /api/v1/calendar/events/:id — cancela la cita (solo el creador): avisa a los asistentes,
// manda la cancelación .ics a los invitados externos y la quita de los calendarios Synology.
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (!hasPermission(ctx.session, "gestionar_calendario")) return apiJson({ ok: false, error: "Sin permiso (gestionar_calendario)." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const event = await loadEvent(id);
  if (!event || !eventVisible(event, ctx.session)) return apiJson({ ok: false, error: "Cita no encontrada." }, 404);
  if (!canManageEvent(event, ctx)) return apiJson({ ok: false, error: "Solo quien creó la cita puede borrarla." }, 403);

  const when = event.allDay
    ? event.start.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
    : event.start.toLocaleString("es-CO", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  for (const a of event.attendees) {
    if (a.user.id === ctx.session.id) continue;
    await notifyAndEmail(a.user.id, { type: "event", event: "calendar_event", title: `Se canceló la cita: ${event.title}`, body: `${ctx.session.name} canceló la cita que estaba para ${when}.`, link: "/calendario", actorId: ctx.session.id }).catch(() => null);
  }
  await sendEventCancellations(id).catch(() => 0);
  await removeEventFromParticipants(id).catch(() => null);
  await db.calendarEvent.delete({ where: { id } });
  await logActivity({ action: "event.delete", summary: `canceló la cita «${event.title}» (vía API)`, projectId: event.projectId ?? undefined, entityType: "event", entityId: id }).catch(() => null);
  return apiJson({ ok: true });
});
