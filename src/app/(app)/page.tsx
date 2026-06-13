import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

function greeting(name: string) {
  const h = new Date().getHours();
  const part = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  return `${part}, ${name.split(" ")[0]} 👋`;
}

function todayLabel() {
  const s = new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const INACTIVE = ["CERRADO", "CANCELADO"];
const OPEN = ["PENDIENTE", "EN_PROCESO", "EN_ESPERA", "EN_REVISION"];

export default async function HomePage() {
  const me = await getCurrentUser();
  const [clients, projects, blocked, myTasks] = await Promise.all([
    db.client.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { projects: true } } } }),
    db.project.count({ where: { status: { notIn: INACTIVE as never } } }),
    db.project.count({ where: { status: "PAUSADO" } }),
    db.task.findMany({
      where: { assigneeId: me?.id, status: { in: OPEN as never } },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { project: { select: { id: true, name: true, emoji: true } } },
    }),
  ]);

  const myTaskCount = await db.task.count({ where: { assigneeId: me?.id, status: { in: OPEN as never } } });

  const stats = [
    { emoji: "🏢", value: clients.length, label: "Clientes", sub: "activos" },
    { emoji: "🚀", value: projects, label: "Proyectos", sub: blocked ? `${blocked} bloqueado` : "activos" },
    { emoji: "✅", value: myTaskCount, label: "Tus tareas", sub: "abiertas" },
    { emoji: "💬", value: 8, label: "Sin leer", sub: "en Estados" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <p className="text-sm text-muted-foreground">{todayLabel()}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{greeting(me?.name ?? "Equipo")}</h1>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <span className="text-xl">{s.emoji}</span>
            <p className="mt-3 text-3xl font-bold">{s.value}</p>
            <p className="text-sm font-medium">{s.label}</p>
            <p className="text-xs text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Tus tareas de hoy</h2>
            <Link href="/mis-tareas" className="text-sm font-medium text-primary hover:underline">
              Ver todas
            </Link>
          </div>
          <div className="space-y-2">
            {myTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tienes tareas abiertas. 🎉</p>
            ) : (
              myTasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/proyectos/${t.project.id}?tab=tareas`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
                >
                  <span className="flex size-5 items-center justify-center rounded-md border border-border" />
                  <span className="flex-1 truncate text-sm">{t.title}</span>
                  <span className="hidden truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground sm:inline">
                    {t.project.emoji} {t.project.name}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Clientes</h2>
            <Link href="/proyectos" className="text-sm font-medium text-primary hover:underline">
              Ver proyectos
            </Link>
          </div>
          <div className="space-y-2">
            {clients.map((c) => (
              <Link
                key={c.id}
                href={`/clientes/${c.id}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-lg">
                  {c.emoji ?? "🏢"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c._count.projects} proyecto{c._count.projects === 1 ? "" : "s"} · {c.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
