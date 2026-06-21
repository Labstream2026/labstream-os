import { db } from "@/lib/db";
import { notifyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";

// Motor de tareas recurrentes: el cron lo llama una vez al día y, por cada plantilla
// (RecurringTask) que "toca hoy", crea una Task real. Idempotente por día (lastCreatedOn).
// Las fechas se anclan a MEDIODÍA UTC sobre la fecha de calendario de Colombia, igual que el
// resto de la app, para que no haya corrimientos de día por zona horaria.

const DAY = 86_400_000;

type Today = { ymd: string; noon: Date; weekday: number; day: number };

function bogotaToday(now: Date): Today {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(now); // YYYY-MM-DD
  const noon = new Date(`${ymd}T12:00:00.000Z`);
  return { ymd, noon, weekday: noon.getUTCDay(), day: noon.getUTCDate() };
}

// Normaliza cualquier Date a su mediodía-UTC de calendario (descarta la hora).
function noonOf(d: Date): Date {
  return new Date(`${d.toISOString().slice(0, 10)}T12:00:00.000Z`);
}

type Rule = {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  weekdays: string | null;
  dayOfMonth: number | null;
  startDate: Date;
  endDate: Date | null;
};

// ¿La regla genera una instancia HOY?
function dueToday(rule: Rule, today: Today): boolean {
  const start = noonOf(rule.startDate);
  if (today.noon < start) return false;
  if (rule.endDate && today.noon > noonOf(rule.endDate)) return false;
  const daysSince = Math.round((today.noon.getTime() - start.getTime()) / DAY);
  const interval = Math.max(1, rule.interval);

  if (rule.frequency === "DAILY") return daysSince % interval === 0;

  if (rule.frequency === "WEEKLY") {
    const days = rule.weekdays ? rule.weekdays.split(",").map(Number).filter((n) => !Number.isNaN(n)) : [start.getUTCDay()];
    if (!days.includes(today.weekday)) return false;
    return Math.floor(daysSince / 7) % interval === 0;
  }

  // MONTHLY: el día del mes debe coincidir (si dom=31 y el mes es corto, ese mes se omite).
  const dom = rule.dayOfMonth ?? start.getUTCDate();
  if (today.day !== dom) return false;
  const monthsSince = (today.noon.getUTCFullYear() - start.getUTCFullYear()) * 12 + (today.noon.getUTCMonth() - start.getUTCMonth());
  return monthsSince >= 0 && monthsSince % interval === 0;
}

export type RecurringRunSummary = { ok: true; checked: number; created: number };

export async function runRecurringTasks(now: Date = new Date()): Promise<RecurringRunSummary> {
  const today = bogotaToday(now);
  const rules = await db.recurringTask.findMany({
    where: { active: true, startDate: { lte: today.noon } },
    select: {
      id: true, title: true, description: true, priority: true, isPrivate: true, dueOffsetDays: true,
      projectId: true, assigneeId: true, createdById: true,
      frequency: true, interval: true, weekdays: true, dayOfMonth: true, startDate: true, endDate: true, lastCreatedOn: true,
    },
  });

  let created = 0;
  for (const rule of rules) {
    if (rule.lastCreatedOn === today.ymd) continue; // ya se creó hoy (idempotencia)
    if (!dueToday(rule, today)) continue;

    const dueDate = new Date(today.noon.getTime() + Math.max(0, rule.dueOffsetDays) * DAY);
    const position = rule.projectId ? await db.task.count({ where: { projectId: rule.projectId } }) : 0;
    const task = await db.task.create({
      data: {
        title: rule.title,
        description: rule.description,
        priority: rule.priority,
        isPrivate: rule.isPrivate,
        projectId: rule.projectId,
        assigneeId: rule.assigneeId,
        ownerId: rule.createdById,
        assignedById: rule.assigneeId && rule.assigneeId !== rule.createdById ? rule.createdById : null,
        dueDate,
        position,
      },
      select: { id: true },
    });
    await db.recurringTask.update({ where: { id: rule.id }, data: { lastCreatedOn: today.ymd } });

    if (rule.assigneeId && rule.assigneeId !== rule.createdById) {
      await notifyAndEmail(rule.assigneeId, {
        type: "task",
        title: `Tarea recurrente: ${rule.title}`,
        body: `Se generó tu tarea recurrente (entrega ${dueDate.toISOString().slice(0, 10)}).`,
        link: rule.projectId ? `/proyectos/${rule.projectId}?tab=tareas` : "/mis-tareas",
      }).catch(() => null);
    }
    await logActivity({
      action: "task.recurring",
      summary: `generó la tarea recurrente «${rule.title}»`,
      projectId: rule.projectId ?? undefined,
      entityType: "task",
      entityId: task.id,
    }).catch(() => null);
    created++;
  }

  return { ok: true, checked: rules.length, created };
}
