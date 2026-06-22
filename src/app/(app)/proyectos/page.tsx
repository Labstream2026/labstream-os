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

  // Vista Tablero (cards por cliente; vertical y horizontal son pestañas aparte — ProjectsBoard)
  const boardClients: BoardClient[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    emoji: c.emoji,
    color: c.accentColor,
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
  const boardV = <ProjectsBoard clients={boardClients} orientation="vertical" />;
  const boardH = <ProjectsBoard clients={boardClients} orientation="horizontal" />;

  // Vista Lista: una tabla por cliente (segmentación clara por cliente).
  const list = (
    <div className="space-y-8">
      {clients.map((c) => (
        <section key={c.id}>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-2xl">{c.emoji}</span>
            <h2 className="text-xl font-bold tracking-tight">{c.name}</h2>
            <span className="text-xs text-muted-foreground">· {c.projects.length}</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
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
            { key: "tablero-v", label: "Tablero vertical", icon: "▤", node: boardV },
            { key: "tablero-h", label: "Tablero horizontal", icon: "▥", node: boardH },
            { key: "lista", label: "Lista", icon: "☰", node: list },
          ]}
        />
      </div>
    </div>
  );
}
