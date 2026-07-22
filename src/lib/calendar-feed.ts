import { db } from "@/lib/db";
import { inAliveProjectWhere } from "@/lib/project-access";
import { buildIcsCalendar, type IcsEvent } from "@/lib/ics";

// Ventana del feed: mismo horizonte que el sondeo CalDAV (mes anterior → ~1 año adelante).
const WINDOW_BACK_DAYS = 31;
const WINDOW_FWD_DAYS = 366;

// Combina la fecha de entrega (día anclado a mediodía UTC) con "HH:mm" → Date con esa hora de
// pared en UTC (misma convención que el resto del calendario). Sin hora → null (todo el día).
function dueDateTime(dueDate: Date, dueTime: string | null | undefined): Date | null {
  if (!dueTime) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(dueTime.trim());
  if (!m) return null;
  const hh = Math.min(23, Number(m[1])), mm = Math.min(59, Number(m[2]));
  return new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate(), hh, mm, 0, 0));
}

// Arma el calendario PERSONAL del usuario como texto .ics para el feed de suscripción
// (webcal/ics de solo lectura que Google/Apple/Outlook refrescan solos). Incluye lo mismo que
// el usuario ve como SUYO en /calendario: sus citas (creadas por él o donde es invitado) + sus
// entregas y rodajes. NO incluye eventos de equipo/proyecto de otros ni datos ajenos.
export async function buildUserFeed(userId: string): Promise<string> {
  const now = new Date();
  // Las columnas guardan "hora de pared UTC"; acotar por esa misma escala basta para la ventana.
  const from = new Date(now.getTime() - WINDOW_BACK_DAYS * 86400000);
  const to = new Date(now.getTime() + WINDOW_FWD_DAYS * 86400000);

  const [events, tasks] = await Promise.all([
    db.calendarEvent.findMany({
      where: {
        start: { gte: from, lte: to },
        OR: [{ createdById: userId }, { attendees: { some: { userId } } }],
        // Citas de proyectos DORMIDOS (papelera/terminados) fuera del feed de Google/Apple.
        AND: [inAliveProjectWhere],
      },
      select: { id: true, uid: true, title: true, description: true, location: true, start: true, end: true, allDay: true },
      orderBy: { start: "asc" },
      take: 2000,
    }),
    db.task.findMany({
      where: {
        completedAt: null,
        AND: [
          { OR: [{ assigneeId: userId }, { ownerId: userId }] },
          { OR: [{ dueDate: { gte: from, lte: to } }, { shootDate: { gte: from, lte: to } }] },
          // Tareas de proyectos DORMIDOS fuera del feed (dejan de sincronizar al archivar/terminar).
          inAliveProjectWhere,
        ],
      },
      select: { id: true, title: true, description: true, dueDate: true, dueTime: true, shootDate: true, project: { select: { name: true } } },
      take: 2000,
    }),
  ]);

  const items: IcsEvent[] = [];
  for (const e of events) {
    items.push({
      uid: e.uid ?? `${e.id}@labstreamsas.com`,
      title: e.title,
      start: e.start,
      end: e.end ?? undefined,
      allDay: e.allDay,
      description: e.description ?? undefined,
      location: e.location ?? undefined,
      reminderMinutes: null, // el recordatorio ya lo maneja la app; no lo duplicamos en el feed
    });
  }
  for (const t of tasks) {
    const proj = t.project?.name ? ` · ${t.project.name}` : "";
    if (t.dueDate) {
      const timed = dueDateTime(t.dueDate, t.dueTime);
      items.push({
        uid: `task-${t.id}@labstreamsas.com`,
        title: `✅ ${t.title}${proj}`,
        start: timed ?? t.dueDate,
        allDay: !timed,
        description: t.description ?? undefined,
        reminderMinutes: null,
      });
    }
    if (t.shootDate) {
      items.push({
        uid: `shoot-${t.id}@labstreamsas.com`,
        title: `🎬 Rodaje: ${t.title}${proj}`,
        start: t.shootDate,
        allDay: true,
        description: t.description ?? undefined,
        reminderMinutes: null,
      });
    }
  }

  return buildIcsCalendar(items, { calName: "Labstream — mi calendario", refreshMinutes: 60 });
}
