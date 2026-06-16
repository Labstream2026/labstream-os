import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { statusMeta, PROJECT_TYPE, formatShortDate } from "@/lib/ui";
import { labelMeta } from "@/lib/colors";
import { getTaskLabels } from "@/lib/workflow-labels";
import { cn } from "@/lib/utils";
import { getSession } from "@/lib/auth";
import { emailEnabled } from "@/lib/email";
import { isEditableOffice } from "@/lib/onlyoffice";
import { canAccessProject, canManageProject, canWriteProject } from "@/lib/project-access";
import { ProjectSettings } from "@/components/project-settings";
import { DataTableView } from "@/components/tables/data-table";
import { createTable } from "@/app/(app)/tablas/actions";
import { Lock } from "lucide-react";
import { TasksBoard } from "./tasks-board";
import { TasksList } from "./tasks-list";
import { CalendarBoard } from "@/app/(app)/calendario/calendar-board";
import { eventToCalItem, taskToCalItems, projectSummaryItems } from "@/app/(app)/calendario/build-items";
import { createMyEvent } from "@/app/(app)/calendario/actions";
import { ProjectTimeline } from "./project-timeline";
import { ViewTabs } from "./view-tabs";
import { DeliverablesPanel } from "./deliverables-panel";
import { FilesPanel } from "./files-panel";
import { ActivityFeed } from "./activity-feed";
import { cellsToMap } from "@/lib/table-cells";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "tareas", label: "Tareas" },
  { key: "calendario", label: "Calendario" },
  { key: "cronograma", label: "Cronograma" },
  { key: "entregables", label: "Entregables" },
  { key: "archivos", label: "Archivos" },
  { key: "tablas", label: "Tablas" },
  { key: "actividad", label: "Actividad" },
];

export default async function ProyectoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "resumen" } = await searchParams;

  const session = await getSession();
  const [project, team, taskLabels, projectEvents] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: {
        client: true,
        lead: true,
        tasks: {
          orderBy: { position: "asc" },
          include: {
            assignee: { select: { name: true, initials: true, avatarColor: true } },
            checklist: { orderBy: { position: "asc" } },
            timeEntries: { select: { minutes: true } },
          },
        },
        deliverables: {
          orderBy: { createdAt: "asc" },
          include: {
            owner: { select: { initials: true, avatarColor: true } },
            versions: { include: { uploadedBy: { select: { initials: true, avatarColor: true } } } },
            decisions: { orderBy: { createdAt: "desc" }, take: 12, include: { by: { select: { name: true } } } },
            reviewComments: { orderBy: { createdAt: "asc" } },
          },
        },
        folders: { orderBy: { position: "asc" }, include: { files: true } },
        files: { where: { folderId: null }, orderBy: { createdAt: "asc" } },
        tables: {
          orderBy: { createdAt: "asc" },
          include: {
            columns: { orderBy: { position: "asc" } },
            rows: { orderBy: { position: "asc" }, include: { cells: true } },
          },
        },
        members: { select: { userId: true, role: true } },
        activity: {
          orderBy: { createdAt: "desc" },
          take: 60,
          include: { user: { select: { name: true, initials: true, avatarColor: true } } },
        },
      },
    }),
    db.user.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, initials: true, avatarColor: true },
    }),
    getTaskLabels(),
    // Citas/reuniones de este proyecto (para el calendario colaborativo del proyecto).
    db.calendarEvent.findMany({
      where: { projectId: id, start: { gte: new Date(new Date().setMonth(new Date().getMonth() - 1)) } },
      include: {
        project: { select: { name: true, emoji: true } },
        attendees: { include: { user: { select: { name: true, initials: true, avatarColor: true } } } },
        guests: { select: { email: true } },
      },
    }),
  ]);

  if (!project) notFound();

  // Acceso al proyecto: público → equipo con ver_proyectos; privado → responsable/miembros/admin.
  if (!canAccessProject(project, session)) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-8 py-24 text-center">
        <Lock className="size-7 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Proyecto privado</h1>
        <p className="text-sm text-muted-foreground">
          No tienes acceso a este proyecto. Pídele al responsable que te añada como miembro.
        </p>
        <Link href="/proyectos" className="mt-2 text-sm font-medium text-primary hover:underline">
          ← Volver a proyectos
        </Link>
      </div>
    );
  }

  const status = statusMeta(project.status);
  const counts = {
    tareas: project.tasks.length,
    entregables: project.deliverables.length,
    archivos: project.folders.reduce((n, f) => n + f.files.length, 0) + project.files.length,
  };

  // Datos de tareas compartidos por las pestañas Tareas y Cronograma (incluye fechas
  // de inicio, horas estimadas y reales para el seguimiento del Gantt).
  const tasksData = project.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    stage: t.stage,
    priority: t.priority,
    shootDate: t.shootDate,
    dueDate: t.dueDate,
    startDate: t.startDate,
    estimatedMinutes: t.estimatedMinutes,
    loggedMinutes: t.timeEntries.reduce((n, e) => n + e.minutes, 0),
    createdAt: t.createdAt,
    completedAt: t.completedAt,
    assigneeId: t.assigneeId,
    assignee: t.assignee,
    checklist: t.checklist.map((c) => ({ id: c.id, label: c.label, done: c.done })),
  }));

  // Items del calendario del proyecto: citas + tareas (entrega/rodaje) + hitos del
  // propio proyecto (inicio, entrega y fechas de entregables).
  const projectCalItems = [
    ...projectEvents.map((e) => eventToCalItem(e, session?.id, `/proyectos/${id}`)),
    ...project.tasks.flatMap((t) =>
      taskToCalItems({
        id: t.id, title: t.title, dueDate: t.dueDate, shootDate: t.shootDate,
        project: { id, name: project.name, emoji: project.emoji },
        assignee: t.assignee ? { name: t.assignee.name, initials: t.assignee.initials, avatarColor: t.assignee.avatarColor } : null,
      }),
    ),
    ...projectSummaryItems({
      id, name: project.name, emoji: project.emoji,
      startDate: project.startDate, dueDate: project.dueDate,
      deliverables: project.deliverables.map((d) => ({ name: d.name, dueDate: d.dueDate })),
    }),
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/proyectos" className="text-sm text-muted-foreground hover:text-foreground">
        ← Proyectos
      </Link>

      <div className="mt-4 flex items-start gap-4">
        <span className="flex size-14 items-center justify-center rounded-xl bg-muted text-3xl">
          {project.emoji ?? "🎬"}
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            <Badge className={cn(status.className)}>{status.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <Link href={`/clientes/${project.clientId}`} className="hover:underline">
              {project.client.emoji} {project.client.name}
            </Link>{" "}
            · {project.code} · {PROJECT_TYPE[project.type]}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.key;
          const count = (counts as Record<string, number>)[t.key];
          return (
            <Link
              key={t.key}
              href={`/proyectos/${id}?tab=${t.key}`}
              className={cn(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {count ? <span className="ml-1.5 text-xs text-muted-foreground">{count}</span> : null}
            </Link>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === "resumen" ? (
          <div className="space-y-5">
            {canManageProject(project, session) ? (
              <ProjectSettings
                projectId={project.id}
                isPrivate={project.isPrivate}
                leadId={project.leadId}
                members={project.members.flatMap((m) => {
                  const u = team.find((t) => t.id === m.userId);
                  return u
                    ? [{ id: u.id, name: u.name, initials: u.initials, color: u.avatarColor, role: m.role as string }]
                    : [];
                })}
                team={team.map((t) => ({ id: t.id, name: t.name, initials: t.initials, color: t.avatarColor }))}
              />
            ) : null}
            <Resumen project={project} priorities={taskLabels.priorities} />
          </div>
        ) : null}
        {tab === "tareas" ? (
          (() => {
            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Espacio de tareas por fases de producción. Cambia entre tablero y lista.
                </p>
                <ViewTabs
                  storageKey="tareas-view"
                  views={[
                    {
                      key: "tablero",
                      label: "Tablero",
                      icon: "🗂️",
                      node: <TasksBoard projectId={id} team={team} stages={project.stages} stageColors={(project.stageColors as Record<string, string> | null) ?? {}} tasks={tasksData} statuses={taskLabels.statuses} priorities={taskLabels.priorities} />,
                    },
                    {
                      key: "lista",
                      label: "Lista",
                      icon: "☰",
                      node: <TasksList projectId={id} team={team} stages={project.stages} tasks={tasksData} statuses={taskLabels.statuses} priorities={taskLabels.priorities} />,
                    },
                  ]}
                />
              </div>
            );
          })()
        ) : null}
        {tab === "calendario" ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Calendario de <span className="font-medium text-foreground">{project.name}</span>: citas y reuniones del
              proyecto, tareas (entrega y rodaje) e hitos (inicio, entrega y entregables).
            </p>
            <div className="h-[74vh]">
              <CalendarBoard
                items={projectCalItems}
                onCreate={canWriteProject(project, session) ? createMyEvent : undefined}
                projectId={id}
                team={team.map((u) => ({ id: u.id, name: u.name, initials: u.initials, color: u.avatarColor }))}
              />
            </div>
          </div>
        ) : null}
        {tab === "cronograma" ? (
          <ProjectTimeline
            projectId={id}
            tasks={tasksData}
            stages={project.stages}
            stageColors={(project.stageColors as Record<string, string> | null) ?? {}}
            deliverables={project.deliverables.map((d) => ({ id: d.id, name: d.name, dueDate: d.dueDate, status: d.status }))}
            team={team}
            statuses={taskLabels.statuses}
            priorities={taskLabels.priorities}
            canEdit={canWriteProject(project, session)}
            projectStart={project.startDate}
            projectEnd={project.dueDate}
          />
        ) : null}
        {tab === "entregables" ? (
          <DeliverablesPanel
            projectId={id}
            canManage={canManageProject(project, session)}
            deliverables={project.deliverables.map((d) => ({
              id: d.id,
              name: d.name,
              type: d.type,
              status: d.status,
              dueDate: d.dueDate,
              owner: d.owner,
              reviewVisits: d.reviewVisits,
              reviewRevoked: !!d.reviewRevokedAt,
              reviewAllowDrawings: d.reviewAllowDrawings,
              versions: d.versions.map((v) => ({
                id: v.id,
                number: v.number,
                notes: v.notes,
                fileUrl: v.fileUrl,
                fileAssetId: v.fileAssetId,
                internalApproved: v.internalApproved,
                createdAt: v.createdAt,
                uploadedBy: v.uploadedBy,
              })),
              decisions: d.decisions.map((dec) => ({
                id: dec.id,
                versionNumber: dec.versionNumber,
                stage: dec.stage,
                result: dec.result,
                byName: dec.by?.name ?? dec.byName ?? null,
                note: dec.note,
                createdAt: dec.createdAt,
              })),
              comments: d.reviewComments.map((c) => ({
                id: c.id,
                authorName: c.authorName,
                body: c.body,
                timecode: c.timecode,
                versionNumber: c.versionNumber,
                hasDrawing: !!c.drawingData,
                resolved: c.resolved,
                fromClient: c.fromClient,
                createdAt: c.createdAt,
              })),
            }))}
            emailEnabled={emailEnabled}
          />
        ) : null}
        {tab === "archivos" ? (
          <FilesPanel
            projectId={id}
            folders={project.folders.map((f) => ({
              id: f.id,
              name: f.name,
              icon: f.icon,
              color: f.color,
              files: f.files.map((file) => ({ id: file.id, name: file.name, kind: file.kind, url: file.url, editable: isEditableOffice(file.name) })),
            }))}
            looseFiles={project.files.map((file) => ({ id: file.id, name: file.name, kind: file.kind, url: file.url, editable: isEditableOffice(file.name) }))}
          />
        ) : null}
        {tab === "actividad" ? (
          <ActivityFeed
            items={project.activity.map((a) => ({
              id: a.id,
              action: a.action,
              summary: a.summary,
              createdAt: a.createdAt.toISOString(),
              user: a.user ? { name: a.user.name, initials: a.user.initials, color: a.user.avatarColor } : null,
              actorName: a.actorName,
            }))}
          />
        ) : null}

        {tab === "tablas" ? (
          <div className="space-y-5">
            <form action={createTable.bind(null, id)} className="flex items-center gap-2">
              <input
                name="name"
                placeholder="Nombre de la tabla (ej. Plan de rodaje)"
                className="min-w-56 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Nueva tabla
              </button>
            </form>
            {project.tables.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Crea una tabla tipo Notion: columnas de texto, estado, fecha, persona y citas de calendario.
              </p>
            ) : null}
            {project.tables.map((t) => (
              <DataTableView
                key={t.id}
                team={team.map((m) => ({ id: m.id, name: m.name, initials: m.initials, color: m.avatarColor }))}
                table={{
                  id: t.id,
                  name: t.name,
                  columns: t.columns.map((c) => ({
                    id: c.id,
                    name: c.name,
                    type: c.type,
                    options: (c.options as { id: string; label: string; color: string }[] | null) ?? null,
                  })),
                  rows: t.rows.map((r) => ({
                    id: r.id,
                    cells: cellsToMap(t.columns, r.cells),
                  })),
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Resumen({
  project,
  priorities,
}: {
  project: {
    progress: number;
    priority: string;
    dueDate: Date | null;
    lead: { name: string; initials: string | null; avatarColor: string | null } | null;
  };
  priorities: import("@/lib/colors").LabelRow[];
}) {
  const priority = labelMeta(priorities, project.priority);
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Field label="Progreso">
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${project.progress}%` }} />
          </div>
          <span className="text-sm font-medium">{project.progress}%</span>
        </div>
      </Field>
      <Field label="Prioridad">
        <Badge className={cn(priority.chip)}>{priority.label}</Badge>
      </Field>
      <Field label="Entrega">
        <span className="text-sm">{formatShortDate(project.dueDate) ?? "—"}</span>
      </Field>
      <Field label="Responsable">
        {project.lead ? (
          <span className="flex items-center gap-2 text-sm">
            <UserAvatar initials={project.lead.initials} color={project.lead.avatarColor} size="sm" />
            {project.lead.name}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Sin asignar</span>
        )}
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
