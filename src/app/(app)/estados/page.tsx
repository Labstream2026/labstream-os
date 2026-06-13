import { UserAvatar } from "@/components/user-avatar";

const FEED = [
  {
    bot: true,
    initials: "🤖",
    color: "slate",
    name: "Resumen diario",
    time: "08:00",
    text: "Buenos días equipo · 6 proyectos activos, 2 en revisión, 1 bloqueado. ¡A por el día! ☕",
  },
  {
    bot: false,
    initials: "LF",
    color: "emerald",
    name: "Lucía Fernández",
    time: "09:14",
    status: "En curso",
    text: "Avanzando con la API de integración — el webhook ya recibe eventos correctamente 🎉",
  },
  {
    bot: false,
    initials: "DP",
    color: "amber",
    name: "Diego Pérez",
    time: "09:31",
    status: "Bloqueado",
    text: "La configuración de la base de datos está bloqueada: espero accesos del cliente Horizon.",
  },
];

export default function EstadosPage() {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-8 py-8">
      <div className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight"># estados-equipo</h1>
        <p className="text-sm text-muted-foreground">Updates diarios del equipo · 6 miembros</p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto py-4">
        <p className="text-center text-xs text-muted-foreground">Hoy</p>
        {FEED.map((m, i) => (
          <div key={i} className="flex gap-3">
            {m.bot ? (
              <span className="flex size-8 items-center justify-center rounded-full bg-foreground text-sm">
                {m.initials}
              </span>
            ) : (
              <UserAvatar initials={m.initials} color={m.color} size="md" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{m.name}</span>
                {m.bot ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    Bot
                  </span>
                ) : null}
                {m.status ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {m.status}
                  </span>
                ) : null}
                <span className="text-[11px] text-muted-foreground">{m.time}</span>
              </div>
              <p className="mt-0.5 text-sm text-foreground/90">{m.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <input
          placeholder="Comparte tu estado en #estados-equipo…"
          className="w-full bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-2 flex items-center justify-between px-1 text-muted-foreground">
          <div className="flex gap-3 text-sm">
            <span className="font-bold">B</span>
            <span>📎</span>
            <span>🙂</span>
            <span>@</span>
          </div>
          <span className="rounded-md bg-muted px-3 py-1 text-xs font-medium">Enviar</span>
        </div>
      </div>
    </div>
  );
}
