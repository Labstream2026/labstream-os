import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, type ApiKeyContext } from "@/lib/api-key-auth";
import { nextFire, utcFromBogota, bogotaYmd, ymdPlus, isValidTime, isValidYmd, type ReminderSchedule } from "@/lib/reminder-schedule";
import { readJson, str, shapeReminder, REMINDER_SELECT } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const FREQUENCIES = new Set(["UNA_VEZ", "DIARIO", "SEMANAL", "MENSUAL"]);
const SNOOZES = new Set(["10m", "1h", "manana"]);

// Mismo gate que la app (recordatorios/actions.ts): gestiona el creador, el destinatario o un admin;
// el portal cliente y el demo no entran.
async function loadForManage(id: string, ctx: ApiKeyContext) {
  if (ctx.session.role === "cliente" || ctx.session.role === "demo") {
    return apiJson({ ok: false, error: "Los recordatorios son una herramienta interna del equipo." }, 403);
  }
  const r = await db.reminder.findUnique({ where: { id }, select: REMINDER_SELECT });
  if (!r) return apiJson({ ok: false, error: "Recordatorio no encontrado." }, 404);
  const mine = r.forUserId === ctx.session.id || r.createdById === ctx.session.id || ctx.session.role === "admin";
  if (!mine) return apiJson({ ok: false, error: "Solo el creador, el destinatario o un admin gestionan este recordatorio." }, 403);
  return r;
}

// GET /api/v1/reminders/:id
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const r = await loadForManage(id, ctx);
  if (r instanceof Response) return r;
  return apiJson({ ok: true, reminder: shapeReminder(r) });
});

// PATCH /api/v1/reminders/:id  body { title?, notes?, active?, snooze? ("10m" | "1h" | "manana"),
// frequency?, date? (UNA_VEZ), timeOfDay?, weekdays? ([0..6]), dayOfMonth? }
// - snooze: corre SOLO el próximo disparo y lo deja activo (un recurrente retoma su regla después).
// - Cambios de programación: se mezclan con lo guardado, se validan como al crear y se recalcula
//   nextFireAt. Para UNA_VEZ sin `date` nueva se conserva la fecha vigente (derivada de nextFireAt).
// - active: pausar/reactivar (reactivar un recurrente recalcula; un UNA_VEZ ya pasado no revive).
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  const r = await loadForManage(id, ctx);
  if (r instanceof Response) return r;
  const body = await readJson(req);
  if (body instanceof Response) return body;

  const data: Record<string, unknown> = {};
  if ("title" in body) {
    const title = str(body.title).slice(0, 200);
    if (!title) return apiJson({ ok: false, error: "title no puede quedar vacío." }, 400);
    data.title = title;
  }
  if ("notes" in body) data.notes = str(body.notes).slice(0, 500) || null;

  const now = new Date();
  const snooze = str(body.snooze);
  const scheduleTouched = ["frequency", "date", "timeOfDay", "weekdays", "dayOfMonth"].some((k) => k in body);

  if (snooze) {
    // Posponer manda sobre lo demás: es un ajuste puntual del PRÓXIMO disparo.
    if (!SNOOZES.has(snooze)) return apiJson({ ok: false, error: 'snooze debe ser "10m", "1h" o "manana".' }, 400);
    data.nextFireAt =
      snooze === "10m" ? new Date(now.getTime() + 10 * 60_000)
      : snooze === "1h" ? new Date(now.getTime() + 3_600_000)
      : utcFromBogota(ymdPlus(bogotaYmd(now), 1), "08:00");
    data.active = true;
  } else if (scheduleTouched) {
    const frequency = "frequency" in body ? str(body.frequency) : r.frequency;
    if (!FREQUENCIES.has(frequency)) return apiJson({ ok: false, error: "frequency debe ser UNA_VEZ | DIARIO | SEMANAL | MENSUAL." }, 400);
    const timeOfDay = "timeOfDay" in body ? str(body.timeOfDay) : r.timeOfDay;
    if (!isValidTime(timeOfDay)) return apiJson({ ok: false, error: 'timeOfDay debe ser "HH:mm" (hora de Bogotá).' }, 400);
    const weekdaysArr = Array.isArray(body.weekdays)
      ? body.weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : null;
    const weekdays = weekdaysArr !== null ? weekdaysArr.join(",") || null : r.weekdays;
    const dayOfMonth = "dayOfMonth" in body ? (Number.isInteger(body.dayOfMonth) ? (body.dayOfMonth as number) : null) : r.dayOfMonth;

    const schedule: ReminderSchedule = {
      frequency,
      weekdays: frequency === "SEMANAL" ? weekdays : null,
      dayOfMonth: frequency === "MENSUAL" ? dayOfMonth : null,
      timeOfDay,
    };
    let nextFireAt: Date;
    if (frequency === "UNA_VEZ") {
      // Sin fecha nueva se conserva la vigente (la fecha de un UNA_VEZ vive en nextFireAt).
      const date = str(body.date) || (r.frequency === "UNA_VEZ" ? bogotaYmd(r.nextFireAt) : "");
      if (!date || !isValidYmd(date)) return apiJson({ ok: false, error: 'Falta date ("YYYY-MM-DD") para UNA_VEZ.' }, 400);
      nextFireAt = utcFromBogota(date, timeOfDay);
      if (nextFireAt.getTime() < now.getTime() - 60_000) return apiJson({ ok: false, error: "Ese momento ya pasó." }, 400);
    } else {
      if (frequency === "SEMANAL" && !schedule.weekdays) return apiJson({ ok: false, error: "weekdays: elige al menos un día (0=domingo … 6=sábado)." }, 400);
      if (frequency === "MENSUAL" && (!schedule.dayOfMonth || schedule.dayOfMonth < 1 || schedule.dayOfMonth > 31)) {
        return apiJson({ ok: false, error: "dayOfMonth debe estar entre 1 y 31." }, 400);
      }
      const next = nextFire(schedule, now);
      if (!next) return apiJson({ ok: false, error: "La regla no genera ningún disparo." }, 400);
      nextFireAt = next;
    }
    data.frequency = frequency;
    data.weekdays = schedule.weekdays;
    data.dayOfMonth = schedule.dayOfMonth;
    data.timeOfDay = timeOfDay;
    data.nextFireAt = nextFireAt;
    if ("active" in body) data.active = !!body.active;
  } else if ("active" in body) {
    // Pausar / reactivar (espejo de toggleReminder).
    const active = !!body.active;
    if (active) {
      if (r.frequency === "UNA_VEZ") {
        if (r.nextFireAt.getTime() < now.getTime()) return apiJson({ ok: false, error: "Ese momento ya pasó; crea uno nuevo." }, 400);
        data.active = true;
      } else {
        const next = nextFire(r, now);
        if (!next) return apiJson({ ok: false, error: "La regla no genera ningún disparo." }, 400);
        data.active = true;
        data.nextFireAt = next;
      }
    } else {
      data.active = false;
    }
  }

  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar." }, 400);
  const updated = await db.reminder.update({ where: { id }, data, select: REMINDER_SELECT });
  return apiJson({ ok: true, reminder: shapeReminder(updated) });
});

// DELETE /api/v1/reminders/:id
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const r = await loadForManage(id, ctx);
  if (r instanceof Response) return r;
  await db.reminder.delete({ where: { id } });
  return apiJson({ ok: true, deleted: id });
});
