import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { statusMeta, PROJECT_TYPE, PRIORITY, formatShortDate } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { getSession } from "@/lib/auth";
import { ChannelChat } from "@/components/chat/channel-chat";
import { TasksBoard } from "./tasks-board";
import { DeliverablesPanel } from "./deliverables-panel";
import { FilesPanel } from "./files-panel";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "tareas", label: "Tareas" },
  { key: "entregables", label: "Entregables" },
  { key: "archivos", label: "Archivos" },
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

  const [project, team, session] = await Promise.all([
    db.project.findUnique({
      where: { id },
      include: {
        client: true,
        lead: true,
        channel: {
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              take: 50,
              include: { author: { select: { name: true, initials: true, avatarColor: true } } },
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
      },
    }),
    db.user.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, initials: true, avatarColor: true },
    }),
    getSession(),
  ]);

  if (!project) notFound();

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
        {tab === "resumen" ? <Resumen project={project} /> : null}
        {tab === "tareas" ? (
          <TasksBoard
            projectId={id}
            team={team}
            tasks={project.tasks.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
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
            <div className="h-[60vh] overflow-hidden rounded-xl border border-border bg-card">
              <ChannelChat
                channelId={project.channel.id}
                me={{
                  name: session?.name ?? "Tú",
                  initials: session?.initials ?? null,
                  color: session?.color ?? null,
                }}
                initialMessages={project.channel.messages.map((m) => ({
                  id: m.id,
                  body: m.body,
                  createdAt: m.createdAt.toISOString(),
                  author: m.author
                    ? { name: m.author.name, initials: m.author.initials, color: m.author.avatarColor }
                    : null,
                }))}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Este proyecto aún no tiene canal de chat.</p>
          )
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
