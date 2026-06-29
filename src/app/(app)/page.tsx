import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { canAccessProject } from "@/lib/project-access";
import { buildSessionTimeline } from "@/lib/timeline-data";
import { GlobalTimeline } from "./timeline/global-timeline";
import { MarcebotCard } from "./marcebot-card";
import { formatShortDate } from "@/lib/ui";
import { ViewTabs } from "@/app/(app)/proyectos/[id]/view-tabs";
import { TeamPerformance } from "./reportes/team-performance";
import { TeamTasks } from "./team-tasks";
import { RaciMatrix } from "./raci-matrix";
import { getUserPreference } from "@/lib/user-preference";
import { StatTile } from "@/components/charts";
import { Building2, Rocket, ListChecks, MessageSquare } from "lucide-react";

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
  if (!me) redirect("/login");
  const session = await getSession();

  // El portal del cliente no tiene Inicio: entra directo a sus proyectos.
  if (session?.role === "cliente") redirect("/proyectos");

  // Página de inicio personalizada: si el usuario eligió otra distinta de Inicio, lo llevamos
  // allí al entrar en "/". (Se configura en el Perfil; lista blanca de rutas.)
  const prefs = await getUserPreference(me.id);
  if (prefs.startPage && prefs.startPage !== "/") redirect(prefs.startPage);
  const [clients, projects, blocked, myTasks] = await Promise.all([
    db.client.findMany({ where: { AND: [accessibleClientWhere(session), { isActive: true }] }, orderBy: { name: "asc" }, include: { _count: { select: { projects: { where: { archivedAt: null } } } } } }),
    db.project.count({ where: { status: { notIn: INACTIVE as never }, archivedAt: null } }),
    db.project.count({ where: { status: "PAUSADO", archivedAt: null } }),
    db.task.findMany({
      where: { assigneeId: me.id, status: { in: OPEN as never } },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { project: { select: { id: true, name: true, emoji: true } } },
    }),
  ]);
  // Orden alfabético real de los clientes: insensible a mayúsculas/acentos y con reglas del español.
  clients.sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

  const myTaskCount = await db.task.count({ where: { assigneeId: me.id, status: { in: OPEN as never } } });

  // Conteo REAL de mensajes no leídos del usuario (igual que el badge del sidebar).
  // En try/catch: si la query raw falla, el conteo NO debe tumbar toda la portada.
  let unread = 0;
  try {
    const unreadRows = await db.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
      FROM "ChatMessage" m
      JOIN "ChannelMember" cm ON cm."channelId" = m."channelId"
      WHERE cm."userId" = ${me.id}
        AND m."parentId" IS NULL
        AND m."deletedAt" IS NULL
        AND (m."authorId" IS NULL OR m."authorId" <> ${me.id})
        AND m."createdAt" > COALESCE(cm."lastReadAt", 'epoch'::timestamp)
    `;
    unread = Number(unreadRows[0]?.total ?? 0);
  } catch {
    unread = 0;
  }

  // Próximos rodajes y entregas (3 semanas) en proyectos visibles para el usuario.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 21);
  const projAccess = { id: true, name: true, emoji: true, isPrivate: true, leadId: true, members: { select: { userId: true } } } as const;
  const [shootRows, deliveryRows] = await Promise.all([
    db.task.findMany({
      where: { shootDate: { gte: today, lte: horizon } },
      orderBy: { shootDate: "asc" },
      select: { id: true, title: true, shootDate: true, isPrivate: true, ownerId: true, assigneeId: true, project: { select: projAccess } },
    }),
    db.deliverable.findMany({
      where: { dueDate: { gte: today, lte: horizon } },
      orderBy: { dueDate: "asc" },
      select: { id: true, name: true, dueDate: true, project: { select: projAccess } },
    }),
  ]);
  const mineTask = (t: { ownerId: string | null; assigneeId: string | null }) => t.ownerId === me.id || t.assigneeId === me.id;
  type Upcoming = { id: string; kind: "shoot" | "delivery"; title: string; date: Date; projectId: string; projectName: string; emoji: string | null };
  const upcoming: Upcoming[] = [
    ...shootRows
      .filter((t) => t.project && (!t.isPrivate || mineTask(t)) && (canAccessProject(t.project, session) || mineTask(t)))
      .map((t) => ({ id: `s-${t.id}`, kind: "shoot" as const, title: t.title, date: t.shootDate!, projectId: t.project!.id, projectName: t.project!.name, emoji: t.project!.emoji })),
    ...deliveryRows
      .filter((d) => d.project && canAccessProject(d.project, session))
      .map((d) => ({ id: `d-${d.id}`, kind: "delivery" as const, title: d.name, date: d.dueDate!, projectId: d.project!.id, projectName: d.project!.name, emoji: d.project!.emoji })),
  ]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 6);

  // Resumen del cronograma (proyectos activos visibles) para el Inicio. Solo si el
  // usuario puede ver proyectos; reutiliza el mismo armado que el Cronograma general.
  const canSeeCronograma = hasPermission(session, "ver_proyectos");
  const canReports = hasPermission(session, "ver_reportes");
  // La vista "Tareas del equipo" (todas las tareas del equipo, con reasignación) es SOLO admin.
  const isAdmin = hasPermission(session, "administrar_usuarios");
  const cronograma = canSeeCronograma
    ? await buildSessionTimeline(session, { activeOnly: true })
    : { clients: [], milestones: [], undatedCount: 0 };

  const unreadAccent: "red" | "amber" = unread > 0 ? "red" : "amber";
  const stats = [
    { icon: <Building2 className="size-5" />, value: clients.length, label: "Clientes", accent: "blue" as const },
    { icon: <Rocket className="size-5" />, value: projects, label: "Proyectos", accent: "primary" as const },
    { icon: <ListChecks className="size-5" />, value: myTaskCount, label: "Tus tareas", accent: "green" as const },
    { icon: <MessageSquare className="size-5" />, value: unread, label: "Sin leer", accent: unreadAccent },
  ];

  // Contenido personal del Inicio (mi desempeño + mis tareas), reutilizado como pestaña.
  const miInicio = (
    <>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <StatTile key={s.label} compact icon={s.icon} value={s.value} label={s.label} accent={s.accent} />
        ))}
      </div>

      {/* Marcebot: resumen en vivo de los pendientes del usuario (y del equipo si es admin). */}
      <MarcebotCard userId={me.id} name={me.name} roleKey={session?.role ?? ""} />

      {/* Resumen del cronograma de todos los proyectos (solo lectura; clic → editar). */}
      {canSeeCronograma ? (
        <section className="mt-10">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Cronograma</h2>
            <Link href="/timeline" className="text-sm font-medium text-primary hover:underline">
              Ver completo
            </Link>
          </div>
          {cronograma.clients.length > 0 ? (
            <GlobalTimeline clients={cronograma.clients} milestones={cronograma.milestones} readOnly compact fixedUnit="week" maxHeight="22rem" />
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Aún no hay proyectos activos con fechas. Asigna fechas de inicio/entrega en tus proyectos para ver aquí el resumen del cronograma.
            </div>
          )}
        </section>
      ) : null}

      {upcoming.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-semibold">Próximos rodajes y entregas</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {upcoming.map((u) => (
              <Link
                key={u.id}
                href={`/proyectos/${u.projectId}?tab=${u.kind === "shoot" ? "tareas" : "entregables"}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
                  {u.kind === "shoot" ? "🎬" : "📦"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.emoji} {u.projectName}</p>
                </div>
                <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  {formatShortDate(u.date)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

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
                  href={t.project ? `/proyectos/${t.project.id}?tab=tareas` : "/mis-tareas"}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
                >
                  <span className="flex size-5 items-center justify-center rounded-md border border-border" />
                  <span className="flex-1 truncate text-sm">{t.title}</span>
                  <span className="hidden truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground sm:inline">
                    {t.project ? `${t.project.emoji} ${t.project.name}` : "Personal"}
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
    </>
  );

  // Pestañas del Inicio. "Mi inicio" y "RACI" (guía de quién hace qué) las ve todo el
  // equipo; "Desempeño" y "Tareas del equipo" solo quien tenga el permiso.
  const inicioViews = [
    { key: "mi", label: "Mi inicio", icon: "🏠", node: miInicio },
    { key: "raci", label: "RACI del equipo", icon: "🧭", node: <RaciMatrix /> },
    ...(canReports ? [{ key: "equipo", label: "Desempeño del equipo", icon: "📊", node: <TeamPerformance session={session} /> }] : []),
    ...(isAdmin ? [{ key: "tareas-equipo", label: "Tareas del equipo", icon: "🗂️", node: <TeamTasks session={session} /> }] : []),
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <p className="text-sm text-muted-foreground">{todayLabel()}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{greeting(me?.name ?? "Equipo")}</h1>
      <div className="mt-6">
        <ViewTabs storageKey="inicio-view" views={inicioViews} />
      </div>
    </div>
  );
}
