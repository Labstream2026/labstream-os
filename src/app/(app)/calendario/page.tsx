import { db } from "@/lib/db";
import { UserAvatar } from "@/components/user-avatar";

export const dynamic = "force-dynamic";

function dayLabel(d: Date) {
  const s = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function CalendarioPage() {
  const events = await db.calendarEvent.findMany({
    orderBy: { start: "asc" },
    include: {
      project: { select: { name: true, emoji: true } },
      attendees: { include: { user: { select: { name: true, initials: true, avatarColor: true } } } },
    },
  });

  // agrupar por día
  const groups = new Map<string, typeof events>();
  for (const e of events) {
    const key = e.start.toISOString().slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Calendario</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Citas del equipo. Las creadas desde las tablas de proyectos aparecen aquí y se notifican al invitado.
      </p>

      {events.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No hay citas todavía.</p>
      ) : (
        <div className="mt-8 space-y-6">
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
