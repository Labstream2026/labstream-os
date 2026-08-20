import type { CalItem } from "./my-calendar";
import { taskUrgency, urgencyHexCalendario } from "@/lib/task-urgency";
import { estadoRonda } from "@/lib/rondas";

// Constructores compartidos: convierten filas de CalendarEvent / Task en CalItem,
// para que TODOS los calendarios de la app (equipo, proyecto, cliente, mis tareas)
// muestren y editen los eventos de la misma forma.

// Los eventos guardan la hora de PARED en UTC (contenedor en UTC). Se lee con timeZone
// "UTC" para devolver esa misma hora, no la del navegador — coherente con el resto del
// calendario, que posiciona la rejilla con getUTCHours(). Robusto aunque corra en cliente.
const fmtTime = (d: Date) => new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" }).format(d);

// Combina la fecha de entrega (anclada a mediodía UTC) con una hora "HH:mm" → ISO con esa hora
// de pared en UTC (misma convención que los eventos). Si no hay hora válida, devuelve null
// (la tarea sigue siendo de "todo el día").
export function dueDateTimeISO(dueDate: Date, dueTime: string | null | undefined): string | null {
  if (!dueTime) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(dueTime.trim());
  if (!m) return null;
  const hh = Math.min(23, Number(m[1])), mm = Math.min(59, Number(m[2]));
  return new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate(), hh, mm, 0, 0)).toISOString();
}

export type EventRow = {
  id: string;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  description: string | null;
  location: string | null;
  createdById: string | null;
  projectId: string | null;
  source?: string;
  project?: { name: string | null; emoji: string | null } | null;
  attendees: { userId: string; user: { name: string; initials: string | null; avatarColor: string | null } }[];
  guests: { email: string }[];
};

// Convierte un evento. `canEdit` = lo creó el usuario actual y es un evento de la app.
export function eventToCalItem(e: EventRow, currentUserId: string | undefined, link?: string | null): CalItem {
  return {
    id: `e-${e.id}`,
    eventId: e.id,
    canEdit: e.createdById === currentUserId && (e.source ?? "app") === "app",
    attendeeIds: e.attendees.map((a) => a.userId),
    title: e.title,
    date: e.start.toISOString(),
    start: e.start.toISOString(),
    end: e.end ? e.end.toISOString() : null,
    kind: "event",
    allDay: e.allDay,
    time: e.allDay ? null : fmtTime(e.start),
    endTime: !e.allDay && e.end ? fmtTime(e.end) : null,
    projectName: e.project?.name ?? null,
    projectEmoji: e.project?.emoji ?? null,
    description: e.description,
    location: e.location,
    guests: e.guests.map((g) => g.email),
    attendees: e.attendees.map((a) => ({ name: a.user.name, initials: a.user.initials, color: a.user.avatarColor })),
    link: link !== undefined ? link : e.projectId ? `/proyectos/${e.projectId}` : null,
  };
}

export type TaskRow = {
  id: string;
  title: string;
  dueDate: Date | null;
  dueTime?: string | null; // "HH:mm" opcional → la entrega se muestra a esa hora
  shootDate: Date | null;
  // Sin esto, una tarea HECHA se seguía pintando de rojo al pasar su fecha: `taskUrgency` ya
  // sabe devolver «hecha» y «hecha tarde», pero se la llamaba solo con la fecha de entrega.
  completedAt?: Date | null;
  project?: { id: string; name: string | null; emoji: string | null } | null;
  assignee?: { name: string; initials: string | null; avatarColor: string | null } | null;
};

export type ProjectSummaryRow = {
  id: string;
  name: string;
  emoji: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  // `rondas` = cuántas veces el cliente ha pedido cambios en ESA pieza (se deriva contando
  // DeliverableDecision con stage=CLIENTE y result=CAMBIOS; no hay columna que mantener).
  deliverables: { name: string; dueDate: Date | null; rondas?: number }[];
  // Tope pactado en la propuesta («hasta 4 rondas»). Null = no se acordó ninguno.
  roundsIncluded?: number | null;
};

// Resumen de un proyecto en el calendario (solo lectura): inicio ▶, entrega 🏁 y la
// fecha de cada entregable 🎬. Se usa, p. ej., en el calendario del cliente para ver
// de un vistazo los hitos de todos sus proyectos.
export function projectSummaryItems(p: ProjectSummaryRow): CalItem[] {
  const link = `/proyectos/${p.id}`;
  const base = { kind: "milestone" as const, allDay: true, canEdit: false, projectName: p.name, projectEmoji: p.emoji ?? null, link };
  const out: CalItem[] = [];
  // Sin emoji en el TÍTULO. Los tres son de clase `milestone`, así que ya llevan el ícono de
  // hito delante; el emoji era una segunda marca encima de la primera. Y uno mentía: el 🎬 de
  // un entregable es una claqueta, o sea el símbolo del RODAJE, que es otra cosa y ya tiene su
  // propio ícono en la misma pantalla.
  if (p.startDate) out.push({ id: `pstart-${p.id}`, title: `Inicio del proyecto`, date: p.startDate.toISOString(), start: p.startDate.toISOString(), ...base });
  if (p.dueDate) out.push({ id: `pdue-${p.id}`, title: `Entrega del proyecto`, date: p.dueDate.toISOString(), start: p.dueDate.toISOString(), ...base });
  for (const [i, d] of p.deliverables.entries()) {
    if (!d.dueDate) continue;
    // La ronda pactada, en el día de la pieza. Sin cambios pedidos, `estadoRonda` devuelve
    // texto null y aquí no se pinta nada: un chip «Ronda 0» solo sería ruido.
    const r = estadoRonda(d.rondas ?? 0, p.roundsIncluded ?? null);
    out.push({
      id: `pdel-${p.id}-${i}`, title: d.name, date: d.dueDate.toISOString(), start: d.dueDate.toISOString(),
      nota: r.texto, notaTono: r.texto ? r.tono : null, ...base,
    });
  }
  return out;
}

// ¿Este item pasa el filtro «ver el calendario de X»?
//
// La regla que no es obvia: lo que NO tiene dueño pasa siempre. Los hitos del proyecto (inicio,
// entrega, fechas de entregables) nacen sin responsable ni asistentes a propósito —son de
// todos—, así que un filtro que exija coincidencia los borraba: elegir a una persona escondía
// la fecha de entrega del proyecto, que es lo más importante de esa pantalla.
export function coincidePersona(
  it: { assignee?: { name: string } | null; attendees?: { name: string }[] | null },
  persona: string,
): boolean {
  if (!persona) return true;
  const deAlguien = Boolean(it.assignee) || (it.attendees ?? []).length > 0;
  if (!deAlguien) return true;
  return it.assignee?.name === persona || (it.attendees ?? []).some((a) => a.name === persona);
}

// Convierte una tarea en hasta dos chips: entrega (dueDate) y rodaje (shootDate).
export function taskToCalItems(t: TaskRow): CalItem[] {
  const out: CalItem[] = [];
  const assignee = t.assignee ? { name: t.assignee.name, initials: t.assignee.initials, color: t.assignee.avatarColor } : null;
  const link = t.project ? `/proyectos/${t.project.id}?tab=tareas` : "/mis-tareas";
  const base = { projectName: t.project?.name ?? null, projectEmoji: t.project?.emoji ?? null, assignee, link };
  if (t.dueDate) {
    const timed = dueDateTimeISO(t.dueDate, t.dueTime);
    const iso = timed ?? t.dueDate.toISOString();
    out.push({
      id: `t-${t.id}`, title: t.title, date: iso, start: iso, kind: "task",
      // Con hora → bloque a esa hora; sin hora → todo el día (como antes).
      allDay: !timed, time: timed ? (t.dueTime ?? null) : null,
      urgencyHex: urgencyHexCalendario(taskUrgency({ dueDate: t.dueDate, completedAt: t.completedAt ?? null }).state), ...base,
    });
  }
  if (t.shootDate) out.push({ id: `s-${t.id}`, title: t.title, date: t.shootDate.toISOString(), start: t.shootDate.toISOString(), kind: "shoot", allDay: true, ...base });
  return out;
}
