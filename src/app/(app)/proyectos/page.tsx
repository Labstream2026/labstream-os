import Link from "next/link";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { accessibleClientWhere } from "@/lib/client-access";
import { ProjectCard } from "@/components/project-card";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { statusMeta, formatShortDate } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { ViewTabs } from "./[id]/view-tabs";
import { ProjectColorPicker } from "./project-color-picker";
import { ProjectsBoard, type BoardClient } from "./projects-board";
import { CalendarBoard } from "@/app/(app)/calendario/calendar-board";
import { eventToCalItem, taskToCalItems } from "@/app/(app)/calendario/build-items";

export const dynamic = "force-dynamic";

export default async function ProyectosPage() {
  const session = await getSession();
  // Solo traemos de la BD los proyectos que el usuario puede ver (no todos para
  // descartarlos en JS): el filtro de acceso va en la propia consulta.
  const allClients = await db.client.findMany({
    where: accessibleClientWhere(session),
    orderBy: { createdAt: "asc" },
    include: {
      projects: {
        where: accessibleProjectWhere(session),
        orderBy: { createdAt: "asc" },
        include: {
          lead: { select: { initials: true, avatarColor: true } },
          members: { select: { userId: true, role: true } },
          deliverables: { select: { name: true, dueDate: true } },
        },
      },
    },
  });

  const clients = allClients.filter((c) => c.projects.length > 0);

  const total = clients.reduce((n, c) => n + c.projects.length, 0);
  const flat = clients.flatMap((c) => c.projects.map((p) => ({ ...p, clientName: c.name, clientEmoji: c.emoji })));

  // Calendario del portafolio: SOLO citas + tareas de los proyectos visibles (no las
  // reuniones del equipo sin proyecto: eso solo se ve en la pestaña Calendario, que es
  // la única ventana que muestra TODO). Mismo board colaborativo.
  const visibleProjectIds = flat.map((p) => p.id);
  const safeIds = visibleProjectIds.length ? visibleProjectIds : ["__none__"];
  const calWindowStart = new Date(new Date().setMonth(new Date().getMonth() - 1));
  const [overviewEvents, overviewTasks, calTeam] = await Promise.all([
    db.calendarEvent.findMany({
      where: { projectId: { in: safeIds }, start: { gte: calWindowStart } },
      include: {
        project: { select: { name: true, emoji: true } },
        attendees: { include: { user: { select: { name: true, initials: true, avatarColor: true } } } },
        guests: { select: { email: true } },
      },
    }),
    db.task.findMany({
      where: { projectId: { in: safeIds }, OR: [{ dueDate: { gte: calWindowStart } }, { shootDate: { gte: calWindowStart } }] },
      select: {
        id: true, title: true, dueDate: true, shootDate: true,
        project: { select: { id: true, name: true, emoji: true } },
        assignee: { select: { name: true, initials: true, avatarColor: true } },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, initials: true, avatarColor: true } }),
  ]);
  const overviewCalItems = [
    ...overviewEvents.map((e) => eventToCalItem(e, session?.id, e.projectId ? `/proyectos/${e.projectId}` : null)),
    ...overviewTasks.flatMap((t) => taskToCalItems(t)),
  ];

  // Vista Tablero (cards por cliente; vertical u horizontal — ProjectsBoard)
  const boardClients: BoardClient[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    projects: c.projects.map((p) => ({
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      status: p.status,
      progress: p.progress,
      dueDate: p.dueDate ? p.dueDate.toISOString() : null,
      lead: p.lead ? { initials: p.lead.initials, color: p.lead.avatarColor } : null,
    })),
  }));
  const board = <ProjectsBoard clients={boardClients} />;

  // Vista Lista: una tabla por cliente (segmentación clara por cliente).
  const list = (
    <div className="space-y-8">
      {clients.map((c) => (
        <section key={c.id}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-base">{c.emoji}</span>
            <h2 className="text-sm font-semibold">{c.name}</h2>
            <span className="text-xs text-muted-foreground">· {c.projects.length}</span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Color</th>
                  <th className="px-3 py-2 font-medium">Proyecto</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Progreso</th>
                  <th className="px-3 py-2 font-medium">Entrega</th>
                </tr>
              </thead>
              <tbody>
                {c.projects.map((p) => {
                  const st = statusMeta(p.status);
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2"><ProjectColorPicker projectId={p.id} color={p.color} /></td>
                      <td className="px-3 py-2">
                        <Link href={`/proyectos/${p.id}`} className="font-medium hover:underline">{p.emoji} {p.name}</Link>
                      </td>
                      <td className="px-3 py-2"><Badge className={cn("text-[10px]", st.className)}>{st.label}</Badge></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${p.progress}%` }} /></div>
                          <span className="text-xs text-muted-foreground">{p.progress}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{formatShortDate(p.dueDate) ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Proyectos</h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} proyectos en {clients.length} clientes</p>
        </div>
        <Link href="/proyectos/nuevo" className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="size-4" /> Nuevo proyecto
        </Link>
      </div>

      <div className="mt-8">
        <ViewTabs
          storageKey="proyectos-view"
          views={[
            { key: "tablero", label: "Tablero", icon: "🗂️", node: board },
            { key: "lista", label: "Lista", icon: "☰", node: list },
            {
              key: "calendario", label: "Calendario", icon: "📅",
              node: (
                <div className="h-[72vh]">
                  {/* Vista de portafolio: ver/editar/arrastrar las citas de los proyectos.
                      Crear citas se hace dentro de cada proyecto o en la pestaña Calendario. */}
                  <CalendarBoard
                    items={overviewCalItems}
                    team={calTeam.map((u) => ({ id: u.id, name: u.name, initials: u.initials, color: u.avatarColor }))}
                  />
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
