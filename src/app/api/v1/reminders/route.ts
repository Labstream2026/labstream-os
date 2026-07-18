import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, type ApiKeyContext } from "@/lib/api-key-auth";
import { notify } from "@/lib/notify";
import { nextFire, utcFromBogota, describeSchedule, isValidTime, isValidYmd, type ReminderSchedule } from "@/lib/reminder-schedule";
import { readJson, str, shapeReminder, REMINDER_SELECT } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Los recordatorios son una herramienta interna del equipo (espejo de recordatorios/actions.ts):
// el portal del cliente y el usuario demo no los usan, tampoco por API.
function teamGate(ctx: ApiKeyContext) {
  if (ctx.session.role === "cliente" || ctx.session.role === "demo") {
    return apiJson({ ok: false, error: "Los recordatorios son una herramienta interna del equipo." }, 403);
  }
  return null;
}

const FREQUENCIES = new Set(["UNA_VEZ", "DIARIO", "SEMANAL", "MENSUAL"]);

// GET /api/v1/reminders?scope=active|paused|all&for=me|<userId>&take=50
// Por defecto: los míos (soy destinatario O los dejé yo a alguien), próximos primero.
// `for=<userId>` de OTRA persona exige ser admin (mismo espíritu que canManage de la app).
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  const gate = teamGate(ctx);
  if (gate) return gate;
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope")?.trim() || "active";
  const forParam = url.searchParams.get("for")?.trim();
  const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? 50) || 50, 1), 100);

  let who: Record<string, unknown>;
  if (!forParam) who = { OR: [{ forUserId: ctx.session.id }, { createdById: ctx.session.id }] };
  else if (forParam === "me") who = { forUserId: ctx.session.id };
  else if (forParam === ctx.session.id || ctx.session.role === "admin") who = { forUserId: forParam };
  else return apiJson({ ok: false, error: "Solo un administrador consulta los recordatorios de otra persona." }, 403);

  const rows = await db.reminder.findMany({
    where: {
      ...who,
      ...(scope === "active" ? { active: true } : scope === "paused" ? { active: false } : {}),
    },
    orderBy: { nextFireAt: "asc" },
    take,
    select: REMINDER_SELECT,
  });
  return apiJson({ ok: true, reminders: rows.map(shapeReminder) });
});

// POST /api/v1/reminders  body { title, notes?, forUserId?, taskId?, frequency, date? (UNA_VEZ,
// "YYYY-MM-DD"), timeOfDay ("HH:mm" hora de Bogotá), weekdays? ([0..6], 0=domingo, SEMANAL),
// dayOfMonth? (1..31, MENSUAL) } — mismo núcleo que la app: destinatario del equipo (uno mismo
// por defecto), nextFireAt precalculado y aviso inmediato si es para otra persona.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  const gate = teamGate(ctx);
  if (gate) return gate;
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const body = await readJson(req);
  if (body instanceof Response) return body;

  const title = str(body.title).slice(0, 200);
  if (!title) return apiJson({ ok: false, error: "Falta title." }, 400);
  const notes = str(body.notes).slice(0, 500) || null;
  const frequency = str(body.frequency);
  if (!FREQUENCIES.has(frequency)) return apiJson({ ok: false, error: "frequency debe ser UNA_VEZ | DIARIO | SEMANAL | MENSUAL." }, 400);
  const timeOfDay = str(body.timeOfDay);
  if (!isValidTime(timeOfDay)) return apiJson({ ok: false, error: 'timeOfDay debe ser "HH:mm" (hora de Bogotá).' }, 400);

  const weekdaysArr = Array.isArray(body.weekdays)
    ? body.weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [];
  const dayOfMonth = Number.isInteger(body.dayOfMonth) ? (body.dayOfMonth as number) : null;
  const schedule: ReminderSchedule = {
    frequency,
    weekdays: frequency === "SEMANAL" ? weekdaysArr.join(",") : null,
    dayOfMonth: frequency === "MENSUAL" ? dayOfMonth : null,
    timeOfDay,
  };

  // Primer disparo: instante explícito (una vez) o el próximo que toque (recurrente).
  const now = new Date();
  let nextFireAt: Date;
  if (frequency === "UNA_VEZ") {
    const date = str(body.date);
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

  // Destinatario: uno mismo por defecto; si es otro, una persona real del equipo.
  const forUserId = str(body.forUserId) || ctx.session.id;
  if (forUserId !== ctx.session.id) {
    const target = await db.user.findUnique({
      where: { id: forUserId },
      select: { active: true, isSystemBot: true, role: { select: { key: true } } },
    });
    if (!target || !target.active || target.isSystemBot || target.role?.key === "cliente" || target.role?.key === "demo") {
      return apiJson({ ok: false, error: "forUserId no es una persona válida del equipo." }, 400);
    }
  }

  // Tarea opcional: solo validamos que exista (herramienta interna del equipo).
  let taskId: string | null = null;
  const taskRaw = str(body.taskId);
  if (taskRaw) {
    const task = await db.task.findUnique({ where: { id: taskRaw }, select: { id: true } });
    if (!task) return apiJson({ ok: false, error: "taskId no existe." }, 400);
    taskId = task.id;
  }

  const created = await db.reminder.create({
    data: {
      title,
      notes,
      forUserId,
      createdById: ctx.session.id,
      taskId,
      frequency,
      weekdays: schedule.weekdays,
      dayOfMonth: schedule.dayOfMonth,
      timeOfDay,
      nextFireAt,
    },
    select: REMINDER_SELECT,
  });

  // El barrido dispara AVISOS (ReminderAlert): materializamos el primero (la app admite varios;
  // por API se crea un aviso, y los recurrentes regeneran el siguiente al sonar).
  await db.reminderAlert.create({ data: { reminderId: created.id, fireAt: nextFireAt } });

  // Si es para otra persona, se le avisa de una vez (con el avatar de quien lo dejó).
  if (forUserId !== ctx.session.id) {
    await notify(forUserId, {
      type: "reminder",
      event: "reminder_assigned",
      title: `${ctx.session.name} te dejó un recordatorio`,
      body: `${title} · ${frequency === "UNA_VEZ" ? `${str(body.date)} ${timeOfDay}` : describeSchedule(schedule)}`,
      link: "/recordatorios",
      actorId: ctx.session.id,
    }).catch(() => null);
  }

  return apiJson({ ok: true, reminder: shapeReminder(created) }, 201);
});
