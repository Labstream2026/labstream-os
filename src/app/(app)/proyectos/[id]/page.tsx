import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { statusMeta, PROJECT_TYPE, formatShortDate } from "@/lib/ui";
import { CoverBanner } from "@/components/cover-banner";
import { EntityEmoji } from "@/components/icons/marks";
import { saveProjectAppearance, clearProjectCover } from "./appearance-actions";
import { labelMeta } from "@/lib/colors";
import { getTaskLabels } from "@/lib/workflow-labels";
import { cn } from "@/lib/utils";
import { getSession, hasPermission } from "@/lib/auth";
import { isEmailEnabled } from "@/lib/email";
import { isEditableOffice, onlyofficeReady } from "@/lib/onlyoffice";
import { photoViewSrc, photoDownloadSrc } from "@/lib/deliverable-photo";
import { canAccessProject, canManageProject, canWriteProject } from "@/lib/project-access";
import { ProjectSettings } from "@/components/project-settings";
import { ProjectDetailsForm } from "./project-details-form";
import { Lock, FileText } from "lucide-react";
import { TasksBoard } from "./tasks-board";
import { TasksSpace } from "./tasks-space";
import { CompletedTasks } from "./completed-tasks";
import { TasksList } from "./tasks-list";
import { CalendarBoard } from "@/app/(app)/calendario/calendar-board";
import { eventToCalItem, taskToCalItems, projectSummaryItems } from "@/app/(app)/calendario/build-items";
import { createMyEvent } from "@/app/(app)/calendario/actions";
import { ProjectTimeline } from "./project-timeline";
import { ViewTabs } from "./view-tabs";
import { DeliverablesPanel } from "./deliverables-panel";
import { signReviewToken } from "@/lib/review-token";
import { signUploadToken } from "@/lib/upload-token";
import { UploadShare } from "./upload-share";
import { ClientDeliverables, type ClientDeliverable } from "./client-deliverables";
import { ClientTeamPanel } from "./client-team-panel";
import { FilesPanel } from "./files-panel";
import { GuionesPanel } from "./guiones-panel";
import { ActivityFeed } from "./activity-feed";
import { BriefPanel } from "./brief-panel";
import { EquiposPanel } from "./equipos-panel";
import { loadInventory, conflictsForPlans } from "@/lib/equipos";

export const dynamic = "force-dynamic";

// Pestañas del proyecto agrupadas en 3 bloques (Contenido · Entregables · Operación) para que
// las 10 no se vean como un muro plano; un separador sutil marca cada grupo.
const TABS = [
  { key: "resumen", label: "Resumen", group: "contenido" },
  { key: "tareas", label: "Tareas", group: "contenido" },
  { key: "calendario", label: "Calendario", group: "contenido" },
  { key: "cronograma", label: "Cronograma", group: "contenido" },
  { key: "entregables", label: "Entregables", group: "entregables" },
  { key: "archivos", label: "Archivos", group: "entregables" },
  { key: "equipos", label: "Equipos", group: "operacion" },
  { key: "actividad", label: "Actividad", group: "operacion" },
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
        // Incluimos los miembros del cliente (con rol) para reconocer al RESPONSABLE de la cuenta,
        // que puede abrir/escribir los proyectos de su cliente (canAccessProject lo usa).
        client: { include: { members: { select: { userId: true, role: true } } } },
        lead: true,
        tasks: {
          orderBy: { position: "asc" },
          include: {
            assignee: { select: { name: true, initials: true, avatarColor: true } },
            checklist: { orderBy: { position: "asc" } },
            timeEntries: { select: { minutes: true } },
            tags: { orderBy: { createdAt: "asc" } },
            _count: { select: { comments: true } },
          },
        },
        deliverables: {
          orderBy: { createdAt: "asc" },
          include: {
            owner: { select: { initials: true, avatarColor: true } },
            reviewers: { select: { userId: true } },
            versions: { include: { uploadedBy: { select: { initials: true, avatarColor: true } } } },
            decisions: { orderBy: { createdAt: "desc" }, take: 12, include: { by: { select: { name: true } } } },
            reviewComments: { orderBy: { createdAt: "asc" } },
            // Fotos de los entregables FOTOGRAFIA (galería de selección del cliente).
            photos: { orderBy: { position: "asc" } },
          },
        },
        folders: { orderBy: { position: "asc" }, include: { files: { where: { deliverablePhotos: { none: {} } }, include: { task: { select: { id: true, title: true } }, chatAttachments: { select: { messageId: true, message: { select: { channelId: true } } }, take: 1 } } } } },
        // Excluye de Archivos los FileAsset que son fotos de entregables (no son archivos sueltos del proyecto).
        files: { where: { folderId: null, deliverablePhotos: { none: {} } }, orderBy: { createdAt: "asc" }, include: { task: { select: { id: true, title: true } }, chatAttachments: { select: { messageId: true, message: { select: { channelId: true } } }, take: 1 } } },
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
      select: { id: true, name: true, initials: true, avatarColor: true, role: { select: { key: true } } },
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

  // Portal del cliente: dentro del proyecto solo ve sus pestañas (sin Equipos), y los entregables
  // se le muestran con una vista de cliente (final + aprobar + comentar). Puede subir archivos.
  const isCliente = session?.role === "cliente";
  const canUploadFiles = canWriteProject(project, session) || (isCliente && hasPermission(session, "subir_archivos"));

  // Posibles RESPONSABLES de una tarea: SIEMPRE del equipo (nunca usuarios del portal cliente).
  // Para el portal cliente, además solo su equipo del proyecto (no la lista completa de la empresa).
  const teamForTasks = team.filter(
    (t) => t.role?.key !== "cliente" && (!isCliente || t.id === project.leadId || project.members.some((m) => m.userId === t.id)),
  );

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

  // ── Datos de la pestaña Equipos (solo si está activa, para no cargarlos siempre) ──
  let equiposData: {
    plans: import("./equipos-panel").EqPlan[];
    inventory: import("@/lib/equipos").InventoryItem[];
    tags: { id: string; label: string; color: string }[];
    kits: import("./equipos-panel").EqKit[];
  } | null = null;
  if (tab === "equipos") {
    const [inv, plans, kits] = await Promise.all([
      loadInventory(),
      db.equipmentPlan.findMany({
        where: { projectId: id },
        orderBy: { shootDate: "asc" },
        include: { items: { select: { id: true, rowId: true, quantity: true, packed: true } } },
      }),
      db.equipmentKit.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { items: true } } } }),
    ]);
    // Conflictos de TODOS los planes en UNA sola consulta (antes: una por plan, N+1).
    const conflicts = await conflictsForPlans(plans.map((p) => ({ id: p.id, shootDate: p.shootDate })));
    const plansOut = plans.map((p) => {
      const reservedMap = conflicts.get(p.id) ?? new Map();
      return {
        id: p.id,
        title: p.title,
        shootDate: p.shootDate.toISOString(),
        status: p.status,
        assigneeId: p.assigneeId,
        reservations: p.items.map((r) => ({ id: r.id, rowId: r.rowId, quantity: r.quantity, packed: r.packed })),
        reserved: Object.fromEntries([...reservedMap.entries()].map(([k, v]) => [k, v])),
      };
    });
    equiposData = {
      plans: plansOut,
      inventory: inv.items,
      tags: inv.tags,
      kits: kits.map((k) => ({ id: k.id, name: k.name, emoji: k.emoji, itemCount: k._count.items })),
    };
  }

  const status = statusMeta(project.status);
  // Los guiones viven en una carpeta dedicada «Guiones»; se separan de Archivos para
  // tener su propia pestaña enfocada (y no contarlos dos veces).
  const guionesFolder = project.folders.find((f) => f.name === "Guiones");
  const guionesFiles = guionesFolder?.files ?? [];
  const otherFolders = project.folders.filter((f) => f.name !== "Guiones");
  const counts = {
    tareas: project.tasks.length,
    entregables: project.deliverables.length,
    archivos: otherFolders.reduce((n, f) => n + f.files.length, 0) + project.files.length + guionesFiles.length,
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
    description: t.description,
    commentCount: t._count.comments,
    tags: t.tags.map((g) => ({ id: g.id, label: g.label, color: g.color })),
    isDeliverableWork: t.isDeliverableWork,
    breachedAt: t.breachedAt,
  }));

  // Pendientes vs completadas según las etiquetas de estado configurables (isDone):
  // el tablero/lista solo muestran lo vivo; las terminadas van a su propia pestaña.
  const doneStatusKeys = new Set(taskLabels.statuses.filter((st) => st.isDone).map((st) => st.key));
  const pendingTasks = tasksData.filter((t) => !doneStatusKeys.has(t.status));
  const completedTasks = tasksData
    .filter((t) => doneStatusKeys.has(t.status))
    .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
  // Estado al que vuelve una tarea reabierta: el primer estado abierto del catálogo.
  const reopenStatusKey = taskLabels.statuses.find((st) => !st.isDone)?.key ?? "PENDIENTE";

  // Items del calendario del proyecto: citas + tareas (entrega/rodaje) + hitos del
  // propio proyecto (inicio, entrega y fechas de entregables).
  const projectCalItems = [
    ...projectEvents.map((e) => eventToCalItem(e, session?.id, `/proyectos/${id}`)),
    ...project.tasks.flatMap((t) =>
      taskToCalItems({
        id: t.id, title: t.title, dueDate: t.dueDate, dueTime: t.dueTime, shootDate: t.shootDate,
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

  // Panel de entregables, definido una vez y reutilizado en Resumen y en la pestaña Entregables.
  const emailEnabled = await isEmailEnabled();
  const deliverablesPanelNode = (
    <DeliverablesPanel
      projectId={id}
      canManage={canManageProject(project, session)}
      members={team
        // Revisores elegibles: TODO el equipo interno (si eliges a alguien que no es miembro
        // del proyecto, se agrega automáticamente para que tenga acceso a lo que revisa) +
        // los CLIENTES invitados a ESTE proyecto (elegir a un cliente activa la revisión
        // DIRECTA: sus versiones van derecho a su portal, sin pre-aprobación interna).
        .filter((t) =>
          t.role?.key !== "cliente"
            ? true
            : t.id === project.leadId || project.members.some((m) => m.userId === t.id),
        )
        .map((t) => ({
          id: t.id,
          name:
            t.role?.key === "cliente"
              ? `${t.name} · cliente (revisión directa)`
              : t.id === project.leadId || project.members.some((m) => m.userId === t.id)
                ? t.name
                : `${t.name} · se agregará al proyecto`,
          initials: t.initials,
          color: t.avatarColor,
        }))}
      workTasks={project.tasks
        .filter((t) => t.isDeliverableWork && !t.completedAt && !t.deliverableId)
        .map((t) => ({ id: t.id, title: t.title, assignee: t.assignee?.name ?? null }))}
      deliverables={project.deliverables.map((d) => ({
        id: d.id,
        name: d.name,
        number: d.number,
        type: d.type,
        status: d.status,
        dueDate: d.dueDate,
        internalReviewDueAt: d.internalReviewDueAt,
        fixDueAt: d.fixDueAt,
        owner: d.owner,
        reviewerId: d.reviewerId,
        reviewerIds: d.reviewers.map((r) => r.userId),
        reviewExpiresAt: d.reviewExpiresAt,
        reviewVisits: d.reviewVisits,
        reviewRevoked: !!d.reviewRevokedAt,
        reviewAllowDrawings: d.reviewAllowDrawings,
        cover: d.coverFileAssetId
          ? { src: photoViewSrc({ fileAssetId: d.coverFileAssetId, url: null }), full: photoDownloadSrc({ fileAssetId: d.coverFileAssetId, url: null }) }
          : null,
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
          image: (c.drawingData as { image?: string } | null)?.image ?? null,
          isNote: c.isNote,
          resolved: c.resolved,
          fromClient: c.fromClient,
          createdAt: c.createdAt,
        })),
        photos: d.photos.map((p) => ({
          id: p.id,
          filename: p.filename,
          src: photoViewSrc(p),
          downloadSrc: photoDownloadSrc(p),
          pick: p.pick,
          clientNote: p.clientNote,
        })),
      }))}
      emailEnabled={emailEnabled}
    />
  );

  // Entregables tal como los ve el CLIENTE: solo los que ya salieron a su revisión, con la última
  // versión que el equipo aprobó internamente (la "final"); nunca el trabajo en proceso.
  const CLIENT_FACING = new Set(["ENVIADO_CLIENTE", "CORRECCIONES", "APROBADO", "ENTREGADO"]);
  const clientDeliverables: ClientDeliverable[] = isCliente
    ? project.deliverables
        .filter((d) => CLIENT_FACING.has(d.status))
        .map((d) => {
          const fv = d.versions.filter((v) => v.internalApproved).sort((a, b) => b.number - a.number)[0];
          return {
            id: d.id,
            name: d.name,
            type: d.type,
            status: d.status,
            dueDate: d.dueDate ? d.dueDate.toISOString() : null,
            cover: d.coverFileAssetId ? { src: photoViewSrc({ fileAssetId: d.coverFileAssetId, url: null }) } : null,
            finalVersion: fv ? { number: fv.number, href: fv.fileAssetId ? `/api/files-asset/${fv.fileAssetId}` : fv.fileUrl } : null,
            // Enlace a la SALA de revisión unificada (misma de «Mis entregas»): el cliente comenta,
            // pre-aprueba/aprueba con el sistema completo. Sustituye a la tarjeta reducida.
            reviewHref: `/review/${signReviewToken(d.id)}`,
            // El cliente solo ve SUS comentarios y las respuestas del equipo dirigidas a él;
            // los comentarios internos de pre-aprobación (fromClient=false sin visibleToClient)
            // NUNCA se le mandan.
            comments: d.reviewComments
              .filter((c) => c.fromClient || c.visibleToClient)
              .map((c) => ({ id: c.id, authorName: c.authorName, body: c.body, fromClient: c.fromClient, createdAt: c.createdAt.toISOString() })),
          };
        })
    : [];

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/proyectos" className="text-sm text-muted-foreground hover:text-foreground">
        ← Proyectos
      </Link>

      <div className="mt-4">
        <CoverBanner
          name={project.name}
          emoji={project.emoji}
          fallbackEmoji="🎬"
          color={project.color}
          bannerUrl={project.bannerUrl}
          canEdit={canManageProject(project, session)}
          onSave={saveProjectAppearance.bind(null, project.id)}
          onClearCover={clearProjectCover.bind(null, project.id)}
          compact
          marks="proyectos"
          subtitle={
            <>
              <Link href={`/clientes/${project.clientId}`} className="hover:underline">
                <EntityEmoji value={project.client.emoji} /> {project.client.name}
              </Link>{" "}
              · {project.code} · {PROJECT_TYPE[project.type]}
            </>
          }
        >
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <Badge className={cn(status.className)}>{status.label}</Badge>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${project.progress}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">{project.progress}%</span>
            </div>
          </div>
        </CoverBanner>
      </div>

      {/* El cabezal va a ancho completo; el resto del contenido se mantiene centrado. */}
      <div className="mx-auto max-w-7xl">
      {/* Tabs */}
      <div className="mt-8 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.filter((t) => (t.key !== "actividad" || hasPermission(session, "ver_actividad")) && (t.key !== "equipos" || !isCliente)).map((t, i, arr) => {
          const active = tab === t.key;
          const count = (counts as Record<string, number>)[t.key];
          // Separador entre grupos (Contenido · Entregables · Operación).
          const newGroup = i > 0 && arr[i - 1].group !== t.group;
          return (
            <Fragment key={t.key}>
            {newGroup ? <span aria-hidden className="my-2 self-stretch border-l border-border/60" /> : null}
            <Link
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
            </Fragment>
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
                canArchive={hasPermission(session, "eliminar_proyectos")}
                canAssignLead={session?.role === "admin" || project.leadId === session?.id}
              />
            ) : null}
            {/* Resumen: progreso, prioridad, entrega y responsable (arriba). */}
            <Resumen project={project} priorities={taskLabels.priorities} />
            {/* Portal del cliente: su equipo del proyecto, con añadir personas CONOCIDAS
                (dirección/responsables/equipo de sus clientes) para poder asignarles tareas. */}
            {isCliente ? (
              <ClientTeamPanel
                projectId={project.id}
                members={project.members.flatMap((m) => {
                  const u = team.find((t) => t.id === m.userId && t.role?.key !== "cliente");
                  return u ? [{ id: u.id, name: u.name, title: null, initials: u.initials, color: u.avatarColor }] : [];
                })}
              />
            ) : null}
            {/* Detalle del proyecto, debajo del resumen. */}
            {hasPermission(session, "editar_proyectos") ? (
              <ProjectDetailsForm
                projectId={project.id}
                name={project.name}
                description={project.description}
                dueDate={project.dueDate ? project.dueDate.toISOString().slice(0, 10) : ""}
              />
            ) : null}
            {/* Propuesta (alcance y entregables): expandida por defecto y renderizada; la edición
                se despliega a demanda desde el propio BriefPanel. Los Entregables ya no van en el
                Resumen (viven en su propia pestaña). */}
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 px-4 py-3 text-sm font-semibold">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                Propuesta del proyecto
                <span className="text-xs font-normal text-muted-foreground">· alcance y entregables (qué haremos)</span>
              </div>
              <div className="border-t border-border p-4">
                <BriefPanel
                  projectId={id}
                  scope={project.briefScope}
                  deliverables={project.briefDeliverables}
                  canWrite={canWriteProject(project, session)}
                />
              </div>
            </div>
          </div>
        ) : null}
        {tab === "tareas" ? (
          (() => {
            return (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Espacio de tareas por fases de producción. Cambia entre tablero y lista.
                </p>
                <TasksSpace
                  pendingCount={pendingTasks.length}
                  completedCount={completedTasks.length}
                  pending={
                    <ViewTabs
                      storageKey="tareas-view"
                      views={[
                        {
                          key: "tablero",
                          label: "Tablero",
                          icon: "🗂️",
                          node: <TasksBoard projectId={id} team={teamForTasks} stages={project.stages} stageColors={(project.stageColors as Record<string, string> | null) ?? {}} tasks={pendingTasks} statuses={taskLabels.statuses} priorities={taskLabels.priorities} isAdmin={session?.role === "admin" || session?.role === "productor"} />,
                        },
                        {
                          key: "lista",
                          label: "Lista",
                          icon: "☰",
                          node: <TasksList projectId={id} team={teamForTasks} stages={project.stages} tasks={pendingTasks} statuses={taskLabels.statuses} priorities={taskLabels.priorities} isAdmin={session?.role === "admin" || session?.role === "productor"} />,
                        },
                      ]}
                    />
                  }
                  completed={
                    <CompletedTasks
                      projectId={id}
                      reopenKey={reopenStatusKey}
                      canReopen={!isCliente}
                      items={completedTasks.map((t) => ({
                        id: t.id,
                        title: t.title,
                        completedAtIso: t.completedAt?.toISOString() ?? null,
                        stage: t.stage,
                        assignee: t.assignee ? { initials: t.assignee.initials, avatarColor: t.assignee.avatarColor } : null,
                        breached: !!t.breachedAt,
                      }))}
                    />
                  }
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
            <div className="h-[74vh] min-h-[26rem]">
              <CalendarBoard
                items={projectCalItems}
                onCreate={canWriteProject(project, session) || (isCliente && hasPermission(session, "gestionar_calendario")) ? createMyEvent : undefined}
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
          isCliente ? (
            <ClientDeliverables
              deliverables={clientDeliverables}
              canApprove={hasPermission(session, "aprobar_cliente")}
              canComment={hasPermission(session, "comentar")}
            />
          ) : (
            deliverablesPanelNode
          )
        ) : null}
        {tab === "archivos" ? (
          <div className="space-y-6">
            {/* Guiones: sección destacada arriba para adjuntar/ver guiones rápido (fusionada en Archivos). */}
            <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-base">📝</span>
                <h3 className="text-sm font-semibold">Guiones</h3>
                {guionesFiles.length ? <span className="text-xs text-muted-foreground">· {guionesFiles.length}</span> : null}
              </div>
              <GuionesPanel
                projectId={id}
                files={guionesFiles.map((file) => ({ id: file.id, name: file.name, editable: isEditableOffice(file.name) }))}
                canWrite={canUploadFiles}
                onlyoffice={await onlyofficeReady()}
              />
            </section>

            {/* Resto de archivos del proyecto (carpetas, subidas, enlaces, rutas de red). */}
            <section>
              <h3 className="mb-3 text-sm font-semibold">Archivos del proyecto</h3>
              {/* Solo quien GESTIONA el proyecto ve/comparte el enlace público de subida (la URL en vivo
                  no se expone a todo el equipo) y elige la carpeta del NAS. */}
              {canManageProject(project, session) ? (
                <UploadShare
                  projectId={id}
                  initialLink={project.uploadRevokedAt || !project.uploadNonce ? null : `${(process.env.NEXTAUTH_URL || "https://os.labstreamsas.com").replace(/\/$/, "")}/subir/${signUploadToken(id, project.uploadNonce)}`}
                  uploadDir={project.uploadDir}
                  emailEnabled={emailEnabled}
                />
              ) : null}
              <FilesPanel
                projectId={id}
                folders={otherFolders.map((f) => ({
                  id: f.id,
                  name: f.name,
                  icon: f.icon,
                  color: f.color,
                  // El cliente no ve las rutas de red (SMB/NAS): exponen la estructura interna del servidor.
                  files: f.files.filter((file) => !isCliente || file.kind !== "NAS").map((file) => ({ id: file.id, name: file.name, kind: file.kind, url: file.url, path: file.path, editable: isEditableOffice(file.name), task: file.task, viaClientLink: file.viaClientLink, chat: file.chatAttachments[0] ? { channelId: file.chatAttachments[0].message.channelId, messageId: file.chatAttachments[0].messageId } : null })),
                }))}
                looseFiles={project.files.filter((file) => !isCliente || file.kind !== "NAS").map((file) => ({ id: file.id, name: file.name, kind: file.kind, url: file.url, path: file.path, editable: isEditableOffice(file.name), task: file.task, viaClientLink: file.viaClientLink, chat: file.chatAttachments[0] ? { channelId: file.chatAttachments[0].message.channelId, messageId: file.chatAttachments[0].messageId } : null }))}
              />
            </section>
          </div>
        ) : null}
        {tab === "actividad" && hasPermission(session, "ver_actividad") ? (
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

        {tab === "equipos" && equiposData ? (
          <EquiposPanel
            projectId={id}
            plans={equiposData.plans}
            inventory={equiposData.inventory}
            tags={equiposData.tags}
            kits={equiposData.kits}
            team={team.map((m) => ({ id: m.id, name: m.name, initials: m.initials, color: m.avatarColor }))}
            canWrite={canWriteProject(project, session)}
          />
        ) : null}
      </div>
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
