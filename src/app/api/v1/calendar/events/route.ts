import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { createCalendarEventCore } from "@/lib/calendar-create";
import { logActivity } from "@/lib/activity";
import { loadProjectForRead, readJson, str, strArr, isYmd, isHm, shapeEvent, eventVisible, EVENT_INCLUDE } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD&project=<id>
// Sin project → calendario de la APP (todo lo visible al titular). Con project → el del proyecto.
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from")?.trim();
  const toRaw = url.searchParams.get("to")?.trim();
  const projectId = url.searchParams.get("project")?.trim();
  if ((fromRaw && !isYmd(fromRaw)) || (toRaw && !isYmd(toRaw))) return apiJson({ ok: false, error: 'from/to deben ser "YYYY-MM-DD".' }, 400);
  const from = fromRaw ? new Date(`${fromRaw}T00:00:00.000Z`) : new Date(Date.now() - 30 * 86_400_000);
  const to = toRaw ? new Date(`${toRaw}T23:59:59.000Z`) : new Date(Date.now() + 90 * 86_400_000);
  if (projectId) {
    const access = await loadProjectForRead(projectId, ctx.session);
    if (access instanceof NextResponse) return access;
  }

  const rows = await db.calendarEvent.findMany({
    // Igual que el calendario de la app: las personales de otros ni siquiera se cargan.
    where: {
      start: { gte: from, lte: to },
      ...(projectId ? { projectId } : {}),
      OR: [{ source: "app" }, { createdById: ctx.session.id }, { attendees: { some: { userId: ctx.session.id } } }],
    },
    orderBy: { start: "asc" },
    take: 500,
    include: EVENT_INCLUDE,
  });
  return apiJson({ ok: true, events: rows.filter((e) => eventVisible(e, ctx.session)).map(shapeEvent) });
});

// POST /api/v1/calendar/events  body { title, date, time?, endTime?, description?, location?,
// attendeeIds?, guestEmails?, projectId? } — crea la cita con el MISMO núcleo que la UI y
// Marcebot (createCalendarEventCore): asistentes válidos, notificaciones app+correo, .ics a los
// invitados externos y sincronización con los calendarios Synology. Sin projectId → calendario
// de la app; con projectId → calendario del proyecto (verificando acceso).
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (!hasPermission(ctx.session, "gestionar_calendario")) return apiJson({ ok: false, error: "Sin permiso para crear citas (gestionar_calendario)." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const title = str(body.title).slice(0, 200);
  const date = str(body.date);
  if (!title || !isYmd(date)) return apiJson({ ok: false, error: 'Faltan title y date ("YYYY-MM-DD").' }, 400);
  const time = str(body.time);
  const endTime = str(body.endTime);
  if (time && !isHm(time)) return apiJson({ ok: false, error: 'time debe ser "HH:mm" (omítelo para todo el día).' }, 400);
  if (endTime && !isHm(endTime)) return apiJson({ ok: false, error: 'endTime debe ser "HH:mm".' }, 400);

  const projectId = str(body.projectId) || null;
  if (projectId) {
    const access = await loadProjectForRead(projectId, ctx.session);
    if (access instanceof NextResponse) return access;
  }
  const guestEmails = strArr(body.guestEmails).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)).slice(0, 30);

  const result = await createCalendarEventCore({
    creatorId: ctx.session.id,
    creatorName: ctx.session.name,
    title,
    date,
    time,
    endTime,
    description: clampText(str(body.description)),
    location: str(body.location).slice(0, 200),
    attendeeIds: strArr(body.attendeeIds).slice(0, 50),
    guestEmails,
    projectId,
  });
  if (!result) return apiJson({ ok: false, error: "No se pudo crear la cita (revisa title/date)." }, 400);
  await logActivity({ action: "event.create", summary: `creó la cita «${title}» (vía API)`, projectId: projectId ?? undefined, entityType: "event", entityId: result.id }).catch(() => null);
  return apiJson({ ok: true, event: { id: result.id, start: result.start.toISOString(), allDay: result.allDay, invitedCount: result.invitedCount } }, 201);
});
