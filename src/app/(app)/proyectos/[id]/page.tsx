import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { statusMeta, PROJECT_TYPE, PRIORITY, formatShortDate } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { getSession } from "@/lib/auth";
import { canAccessChannel } from "@/lib/chat-access";
import { canAccessProject, canManageProject } from "@/lib/project-access";
import { ProjectSettings } from "@/components/project-settings";
import { isEditableOffice } from "@/lib/onlyoffice";
import { ChannelChat } from "@/components/chat/channel-chat";
import { ChannelSettings } from "@/components/chat/channel-settings";
import { DataTableView } from "@/components/tables/data-table";
import { createTable } from "@/app/(app)/tablas/actions";
import { Lock } from "lucide-react";
import { TasksBoard } from "./tasks-board";
import { DeliverablesPanel } from "./deliverables-panel";
import { FilesPanel } from "./files-panel";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "tareas", label: "Tareas" },
  { key: "entregables", label: "Entregables" },
  { key: "archivos", label: "Archivos" },
  { key: "tablas", label: "Tablas" },
  { key: "chat", label: "Chat" },
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
  const [project, team] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: {
        client: true,
        lead: true,
        channel: {
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              take: 100,
              include: {
                author: { select: { name: true, initials: true, avatarColor: true } },
                attachments: true,
                poll: {
                  include: {
                    options: { orderBy: { position: "asc" }, include: { _count: { select: { votes: true } } } },
                    votes: { where: { userId: session?.id ?? "" }, select: { optionId: true } },
                  },
                },
              },
            },
            members: {
              include: { user: { select: { id: true, name: true, initials: true, avatarColor: true } } },
            },
          },
        },
        tasks: {
          orderBy: { position: "asc" },
          include: {
            assignee: { select: { initials: true, avatarColor: true } },
            checklist: { orderBy: { position: "asc" } },
          },
        },
        deliverables: {
          orderBy: { createdAt: "asc" },
          include: {
            owner: { select: { initials: true, avatarColor: true } },
            versions: { include: { uploadedBy: { select: { initials: true, avatarColor: true } } } },
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
      },
    }),
    db.user.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, initials: true, avatarColor: true },
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

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
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
      <div className="mt-8 flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.key;
          const count = (counts as Record<string, number>)[t.key];
          return (
            <Link
              key={t.key}
              href={`/proyectos/${id}?tab=${t.key}`}
              className={cn(
                "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
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
            <Resumen project={project} />
          </div>
        ) : null}
        {tab === "tareas" ? (
          <TasksBoard
            projectId={id}
            team={team}
            stages={project.stages}
            tasks={project.tasks.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              stage: t.stage,
              priority: t.priority,
              shootDate: t.shootDate,
              assignee: t.assignee,
              checklist: t.checklist.map((c) => ({ id: c.id, label: c.label, done: c.done })),
            }))}
          />
        ) : null}
        {tab === "entregables" ? (
          <DeliverablesPanel
            projectId={id}
            deliverables={project.deliverables.map((d) => ({
              id: d.id,
              name: d.name,
              type: d.type,
              status: d.status,
              owner: d.owner,
              versions: d.versions.map((v) => ({
                id: v.id,
                number: v.number,
                notes: v.notes,
                fileUrl: v.fileUrl,
                createdAt: v.createdAt,
                uploadedBy: v.uploadedBy,
              })),
            }))}
          />
        ) : null}
        {tab === "archivos" ? (
          <FilesPanel
            projectId={id}
            folders={project.folders.map((f) => ({
              id: f.id,
              name: f.name,
              files: f.files.map((file) => ({ id: file.id, name: file.name, kind: file.kind, url: file.url })),
            }))}
            looseFiles={project.files.map((file) => ({ id: file.id, name: file.name, kind: file.kind, url: file.url }))}
          />
        ) : null}
        {tab === "chat" ? (
          project.channel ? (
            (() => {
              const ch = project.channel;
              const access = canAccessChannel(
                { isPublic: ch.isPublic, project: { leadId: project.leadId }, members: ch.members },
                session,
              );
              // Gestión del canal (visibilidad/miembros), estilo Mattermost: solo
              // admin del sistema o responsable del proyecto. Los invitados solo participan.
              const canManage = session?.role === "admin" || project.leadId === session?.id;

              if (!access) {
                return (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
                    <Lock className="size-6 text-muted-foreground" />
                    <p className="font-medium">Canal privado</p>
                    <p className="text-sm text-muted-foreground">
                      Solo los miembros invitados pueden ver este chat. Pídele acceso al responsable del proyecto.
                    </p>
                  </div>
                );
              }

              return (
                <>
                  <ChannelSettings
                    channelId={ch.id}
                    isPublic={ch.isPublic}
                    canManage={canManage}
                    members={ch.members.map((m) => ({
                      id: m.user.id,
                      name: m.user.name,
                      initials: m.user.initials,
                      color: m.user.avatarColor,
                      role: m.role,
                    }))}
                    team={team.map((t) => ({ id: t.id, name: t.name, initials: t.initials, color: t.avatarColor }))}
                  />
                  <div className="h-[55vh] overflow-hidden rounded-xl border border-border bg-card">
                    <ChannelChat
                      channelId={ch.id}
                      me={{
                        name: session?.name ?? "Tú",
                        initials: session?.initials ?? null,
                        color: session?.color ?? null,
                      }}
                      initialMessages={ch.messages.map((m) => ({
                        id: m.id,
                        body: m.body,
                        parentId: m.parentId,
                        createdAt: m.createdAt.toISOString(),
                        author: m.author
                          ? { name: m.author.name, initials: m.author.initials, color: m.author.avatarColor }
                          : null,
                        attachments: m.attachments.map((a) => ({
                          id: a.id,
                          name: a.name,
                          mime: a.mime,
                          editable: isEditableOffice(a.name),
                        })),
                        poll: m.poll
                          ? {
                              id: m.poll.id,
                              question: m.poll.question,
                              options: m.poll.options.map((o) => ({ id: o.id, text: o.text, votes: o._count.votes })),
                              totalVotes: m.poll.options.reduce((n, o) => n + o._count.votes, 0),
                            }
                          : null,
                        myOptionId: m.poll?.votes[0]?.optionId ?? null,
                      }))}
                    />
                  </div>
                </>
              );
            })()
          ) : (
            <p className="text-sm text-muted-foreground">Este proyecto aún no tiene canal de chat.</p>
          )
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
                    cells: Object.fromEntries(r.cells.map((cell) => [cell.columnId, cell.value])),
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
}: {
  project: {
    progress: number;
    priority: string;
    dueDate: Date | null;
    lead: { name: string; initials: string | null; avatarColor: string | null } | null;
  };
}) {
  const priority = PRIORITY[project.priority];
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
        <Badge className={cn(priority.className)}>{priority.label}</Badge>
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
