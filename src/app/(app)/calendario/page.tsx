import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { UserAvatar } from "@/components/user-avatar";
import { caldavEnabled } from "@/lib/caldav";
import { MyCalendar, type CalItem } from "./my-calendar";

export const dynamic = "force-dynamic";

function dayLabel(d: Date) {
  const s = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function CalendarioPage() {
  const session = await getSession();
  // Ventana acotada: desde el inicio del mes anterior en adelante (no toda la
  // historia de eventos). Cubre la rejilla mensual y la agenda próxima.
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [all, myTasks] = await Promise.all([
    db.calendarEvent.findMany({
      where: { start: { gte: windowStart } },
      orderBy: { start: "asc" },
      include: {
        project: { select: { name: true, emoji: true, isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } } },
        attendees: { include: { user: { select: { name: true, initials: true, avatarColor: true } } } },
      },
    }),
    db.task.findMany({
      where: { assigneeId: session?.id ?? "", dueDate: { gte: windowStart } },
      select: { id: true, title: true, dueDate: true, project: { select: { name: true } } },
    }),
  ]);

  // No se muestran citas de proyectos privados a quien no tiene acceso (responsable,
  // miembro, admin) o no es invitado/creador. Las citas sin proyecto son del equipo.
  const events = all.filter((e) => {
    if (!e.project) return true;
    if (e.createdById === session?.id) return true;
    if (e.attendees.some((a) => a.userId === session?.id)) return true;
    return canAccessProject(e.project, session);
  });

  // Items para la rejilla mensual: eventos visibles + mis tareas con fecha de entrega.
  const calItems: CalItem[] = [
    ...events.map((e) => ({
      id: `e-${e.id}`,
      title: e.title,
      date: e.start.toISOString(),
      kind: "event" as const,
      time: e.allDay ? null : new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(e.start),
      projectName: e.project?.name ?? null,
    })),
    ...myTasks.map((t) => ({
      id: `t-${t.id}`,
      title: t.title,
      date: t.dueDate!.toISOString(),
      kind: "task" as const,
      projectName: t.project?.name ?? null,
    })),
  ];

  // agrupar por día
  const groups = new Map<string, typeof events>();
  for (const e of events) {
    const key = e.start.toISOString().slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight">Mi calendario</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tus reuniones y citas del equipo + tus tareas con fecha de entrega.
        {caldavEnabled ? " Las citas se sincronizan con Synology Calendar." : " (Synology Calendar se conecta luego con CALDAV_*.)"}
      </p>

      <div className="mt-6">
        <MyCalendar items={calItems} />
      </div>

      <h2 className="mt-10 text-lg font-semibold">Agenda</h2>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No hay citas todavía.</p>
      ) : (
        <div className="mt-3 space-y-6">
          {[...groups.entries()].map(([key, evs]) => (
            <section key={key}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{dayLabel(new Date(key))}</h2>
              <div className="space-y-2">
                {evs.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                    <div className="w-16 text-sm font-semibold">
                      {e.allDay ? "Todo el día" : new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit" }).format(e.start)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      {e.project ? (
                        <p className="truncate text-xs text-muted-foreground">{e.project.emoji} {e.project.name}</p>
                      ) : null}
                    </div>
                    <div className="flex -space-x-2">
                      {e.attendees.map((a) => (
                        <UserAvatar key={a.userId} initials={a.user.initials} color={a.user.avatarColor} size="sm" ring />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
