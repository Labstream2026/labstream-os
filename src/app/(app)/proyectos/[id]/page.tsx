import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { statusMeta, PROJECT_TYPE, formatShortDate } from "@/lib/ui";
import { ProjectTopbarTitle } from "./topbar-title";
import { labelMeta } from "@/lib/colors";
import { getTaskLabels } from "@/lib/workflow-labels";
import { cn } from "@/lib/utils";
import { getSession, hasPermission } from "@/lib/auth";
import { isEmailEnabled } from "@/lib/email";
import { isEditableOffice, onlyofficeReady } from "@/lib/onlyoffice";
import { ahoraMs, type ArchivoItem } from "@/lib/archivos/tipos";
import { diasQueQuedan } from "@/lib/archivos/papelera";
import { docPresenceFor } from "@/lib/doc-collab";
import { opsEnabled, listOps, statOps } from "@/lib/nas-ops";
import { photoViewSrc, photoDownloadSrc } from "@/lib/deliverable-photo";
import { canAccessProject, canManageProject, canWriteProject } from "@/lib/project-access";
import { ProjectSettings } from "@/components/project-settings";
import { ProjectLifecycleBanner } from "./lifecycle-banner";
import { ProjectDetailsForm } from "./project-details-form";
import { MoveProjectClient } from "./move-project-client";
import { Lock, FileText, ChevronDown, Inbox, Megaphone, Users, Settings, Mail as MailIcon } from "lucide-react";
import { CorreoProyecto } from "./correo-proyecto";
import { LlamadosStrip } from "./llamados-strip";
import {
  IconTablero, IconTareas, IconCalendario, IconCronograma, IconEntregas,
  IconArchivo, IconNotas, IconEquipo, IconActividad,
} from "@/components/icons";
import { ResumenSection } from "./resumen-section";
import { TasksSpace } from "./tasks-space";
import { CompletedTasks } from "./completed-tasks";
import { ProjectCalendar } from "./project-calendar";
import { eventToCalItem, taskToCalItems, projectSummaryItems } from "@/app/(app)/calendario/build-items";
import { createMyEvent } from "@/app/(app)/calendario/actions";
import { ProjectTimeline } from "./project-timeline";
import { DeliverablesPanel } from "./deliverables-panel";
import { TasksViews } from "./tasks-views";
import { ProjectHealth } from "./project-health";
import { signReviewToken } from "@/lib/review-token";
import { draftShareInfo } from "@/lib/draft-share";
import { signUploadToken } from "@/lib/upload-token";
import { UploadShare } from "./upload-share";
import { ClientDeliverables, type ClientDeliverable } from "./client-deliverables";
import { ClientTeamPanel } from "./client-team-panel";
import { ClientJourney } from "./client-journey";
import { NextForClientCard } from "./next-for-client";
import { ClientRequestsPanel } from "./client-requests-panel";
import { formatBogota } from "@/lib/bogota-time";
import { FilesPanel } from "./files-panel";
import { carpetaGaleriaClienteDelProyecto, carpetaGaleriaProyecto } from "@/lib/galeria-vinculos";
import { galeriaWritable } from "@/lib/nas-galeria";
import { MaterialCard } from "./material-card";
import { ActivityFeed } from "./activity-feed";
import { ProjectChatBubble } from "./project-chat-bubble";
import { BriefPanel } from "./brief-panel";
import { EquiposPanel } from "./equipos-panel";
import { loadInventory, conflictsForPlans } from "@/lib/equipos";
import { isWhatsappEnabled } from "@/lib/whatsapp/send";
import { NotesTab } from "@/components/notes/notes-tab";
import { notesFor } from "@/lib/notes-for";

// Imposibles del cronograma: tareas que EMPIEZAN antes de que termine su bloqueadora. Antes
// esto se podía dejar guardado sin que nada lo dijera — los datos de dependencias ni llegaban
// a la vista. Se calcula aquí (barato: un findMany por proyecto) y el cronograma lo enseña.
async function conflictosDependencias(projectId: string): Promise<{ tarea: string; bloqueadora: string; hasta: string }[]> {
  const deps = await db.taskDependency.findMany({
    where: { task: { projectId, completedAt: null }, blocker: { completedAt: null } },
    select: {
      task: { select: { title: true, startDate: true } },
      blocker: { select: { title: true, dueDate: true } },
    },
  });
  const fmt = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" });
  return deps
    .filter((d) => d.task.startDate && d.blocker.dueDate && d.task.startDate.getTime() < d.blocker.dueDate.getTime())
    .slice(0, 8)
    .map((d) => ({ tarea: d.task.title, bloqueadora: d.blocker.title, hasta: fmt.format(d.blocker.dueDate!).replace(".", "") }));
}

export const dynamic = "force-dynamic";

// Pestañas del proyecto agrupadas en 3 bloques (Contenido · Entregables · Operación) para que
// las 10 no se vean como un muro plano; un separador sutil marca cada grupo.
// El Chat ya NO es una pestaña: vive en una BURBUJA flotante (ProjectChatBubble). Aquí quedan
// las pestañas de navegación, que se muestran en el MENÚ LATERAL vertical (no en una barra arriba).
//
// Cada pestaña lleva su ícono del set propio. Era la navegación más densa de la app y la única
// sin ninguno: nueve renglones de puro texto que hay que LEER para encontrar el que se busca.
// Con ícono la forma se reconoce de reojo, y son los MISMOS de la barra lateral y del buscador,
// así que "Tareas" se ve igual esté donde esté.
const TABS = [
  { key: "resumen", label: "Resumen", group: "contenido", Icon: IconTablero },
  { key: "tareas", label: "Tareas", group: "contenido", Icon: IconTareas },
  { key: "calendario", label: "Calendario", group: "contenido", Icon: IconCalendario },
  { key: "cronograma", label: "Cronograma", group: "contenido", Icon: IconCronograma },
  { key: "entregables", label: "Entregables", group: "entregables", Icon: IconEntregas },
  { key: "archivos", label: "Archivos", group: "entregables", Icon: IconArchivo },
  { key: "notas", label: "Notas", group: "contenido", Icon: IconNotas },
  { key: "equipos", label: "Equipos", group: "operacion", Icon: IconEquipo },
  { key: "correo", label: "Correo", group: "operacion", Icon: MailIcon },
  { key: "actividad", label: "Actividad", group: "operacion", Icon: IconActividad },
];
const GROUP_LABEL: Record<string, string> = { contenido: "Contenido", entregables: "Entregables", operacion: "Operación" };

// Título de la pestaña: el nombre del proyecto y dónde estás dentro de él. Antes TODAS las
// páginas se llamaban "Labstream OS", así que dos proyectos abiertos —o el mismo proyecto en
// dos secciones— daban pestañas idénticas. En el resumen se pone el cliente, que es lo que
// ubica; en las demás, la sección, que es lo que distingue dos pestañas del mismo proyecto.
//
// Consulta aparte de la de la página (mínima) y con el MISMO candado de acceso: sin él, el
// título revelaría el nombre de un proyecto privado a quien la página le responde 404.
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { tab = "resumen" } = await searchParams;
  const session = await getSession();
  const project = await db.project.findUnique({
    where: { id },
    select: {
      name: true,
      isPrivate: true,
      leadId: true,
      members: { select: { userId: true, role: true } },
      client: { select: { name: true, members: { select: { userId: true, role: true } } } },
    },
  });
  if (!project || !canAccessProject(project, session)) return { title: "Proyecto" };
  const seccion = TABS.find((t) => t.key === tab)?.label;
  const cola = seccion && tab !== "resumen" ? seccion : project.client?.name;
  return { title: cola ? `${project.name} · ${cola}` : project.name };
}

export default async function ProyectoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; estado?: string }>;
}) {
  const { id } = await params;
  const { tab = "resumen", estado } = await searchParams;

  const session = await getSession();
  // Profundidad de los entregables: sus comentarios de revisión, decisiones y fotos SOLO los
  // consumen la pestaña «Entregables» y la vista del portal del cliente. En el resto de
  // pestañas se traían enteros —todos los comentarios de todos los entregables— para tirarlos.
  const esClienteRol = session?.role === "cliente";
  const detalleEntregables = tab === "entregables" || esClienteRol;
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
            // `take: 0` fuera de su pestaña: la FORMA del tipo no cambia (por eso el take y no un
            // include condicional, que partía el tipo en una unión), pero no viajan filas.
            decisions: { orderBy: { createdAt: "desc" }, take: detalleEntregables ? 12 : 0, include: { by: { select: { name: true } } } },
            reviewComments: { orderBy: { createdAt: "asc" }, take: detalleEntregables ? 500 : 0 },
            // Fotos de los entregables FOTOGRAFIA (galería de selección del cliente).
            photos: { orderBy: { position: "asc" }, take: detalleEntregables ? 500 : 0 },
          },
        },
        // orderBy en los files ANIDADOS a propósito: sin él, el orden lo decide el heap de
        // Postgres y cambia tras cualquier UPDATE (p. ej. un guardado de OnlyOffice).
        folders: { orderBy: { position: "asc" }, include: { files: { where: { deletedAt: null, deliverablePhotos: { none: {} }, projectCovers: { none: {} } }, orderBy: { createdAt: "asc" }, include: { task: { select: { id: true, title: true } }, uploadedBy: { select: { name: true } }, _count: { select: { deliverableVersions: true, deliverablePhotos: true, projectCovers: true } }, chatAttachments: { where: { message: { deletedAt: null } }, select: { messageId: true, message: { select: { channelId: true } } }, take: 1 } } } } },
        // Excluye de Archivos los FileAsset que son fotos de entregables o portadas del banco
        // (no son archivos sueltos del proyecto).
        files: { where: { folderId: null, deletedAt: null, deliverablePhotos: { none: {} }, projectCovers: { none: {} } }, orderBy: { createdAt: "asc" }, include: { task: { select: { id: true, title: true } }, uploadedBy: { select: { name: true } }, _count: { select: { deliverableVersions: true, deliverablePhotos: true, projectCovers: true } }, chatAttachments: { where: { message: { deletedAt: null } }, select: { messageId: true, message: { select: { channelId: true } } }, take: 1 } } },
        // Banco de portadas (pestaña «Portadas» de entregables).
        covers: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          include: { notes: { orderBy: { createdAt: "desc" }, select: { id: true, authorName: true, body: true, drawing: true, resolved: true, createdAt: true } } },
        },
        members: { select: { userId: true, role: true } },
        // Fuera de la pestaña «Actividad» solo se usa la MÁS RECIENTE (el «último movimiento»
        // del resumen): traer 60 filas con su autor en cada visita era trabajo tirado.
        activity: {
          orderBy: { createdAt: "desc" },
          take: tab === "actividad" ? 60 : 1,
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
  // Ciclo de vida: proyecto DORMIDO (papelera o terminado) = SOLO LECTURA. canWriteProject ya
  // devuelve false (los campos vienen en el include), pero las excepciones del cliente de abajo
  // saltan ese candado → se les añade `alive` explícito.
  const alive = !project.archivedAt && !project.finishedAt;
  const canUploadFiles = canWriteProject(project, session) || (alive && isCliente && hasPermission(session, "subir_archivos"));
  // ¿Está conectado el Document Server? Lo usan Guiones, Archivos y la carpeta de Operaciones.
  const ooReady = await onlyofficeReady();

  // ── Carpeta viva de Operaciones_LAB (bind mount del NAS) ──
  // El cliente jamás la ve (rutas internas). Se lee el disco EN VIVO: la sección muestra lo
  // que llegó por Finder/SMB y no está registrado; los FileAsset OPS cuya ruta ya no exista
  // se marcan «¿movido?». Todo con try/catch: si el mount se cae, la pestaña sigue viva.
  const opsAvailable = opsEnabled() && !isCliente;
  const allProjectFiles = [...project.files, ...project.folders.flatMap((f) => f.files)];
  let opsInfo: { folder: string; ok: boolean; live: { name: string; rel: string; size: number | null; mtimeMs: number; ext: string }[]; dirs: { name: string; rel: string }[]; ooReady: boolean } | null = null;
  const opsMissing = new Set<string>();
  // El listado en vivo solo lo pinta la pestaña de Archivos: no se paga en las demás.
  if (opsAvailable && project.opsFolder && tab === "archivos") {
    let ok = false;
    let live: { name: string; rel: string; size: number | null; mtimeMs: number; ext: string }[] = [];
    let dirs: { name: string; rel: string }[] = [];
    try {
      const l = await listOps(project.opsFolder);
      ok = true;
      const registered = new Set(allProjectFiles.filter((f) => f.kind === "OPS" && f.path).map((f) => f.path as string));
      live = l.files.filter((f) => !registered.has(f.rel)).map((f) => ({ name: f.name, rel: f.rel, size: f.size, mtimeMs: f.mtimeMs, ext: f.ext }));
      dirs = l.dirs.map((d) => ({ name: d.name, rel: d.rel }));
    } catch {
      ok = false;
    }
    opsInfo = { folder: project.opsFolder, ok, live, dirs, ooReady };
  }
  // Solo cuando la pestaña de Archivos está abierta (es la única que pinta «¿movido?»), y en
  // paralelo: antes era un stat SECUENCIAL por archivo OPS contra el bind mount, en TODAS las
  // pestañas — con el mount lento, cada visita al proyecto lo pagaba.
  if (opsAvailable && tab === "archivos") {
    const opsFiles = allProjectFiles.filter((f) => f.kind === "OPS" && f.path);
    const stats = await Promise.all(opsFiles.map((f) => statOps(f.path as string).catch(() => null)));
    opsFiles.forEach((f, i) => {
      if (!stats[i]) opsMissing.add(f.id);
    });
  }
  // Broche del TERMINADO: el banner muestra el proyecto en números (todo ya viene cargado
  // arriba — tareas con timeEntries y entregables — así que sumar aquí no cuesta consultas).
  const finishedStats = project.finishedAt
    ? {
        tasks: project.tasks.length,
        delivApproved: project.deliverables.filter((d) => d.status === "APROBADO" || d.status === "ENTREGADO").length,
        delivTotal: project.deliverables.length,
        hours: Math.round(project.tasks.reduce((n, t) => n + t.timeEntries.reduce((m, e) => m + e.minutes, 0), 0) / 6) / 10,
      }
    : null;

  // Solicitudes del CLIENTE (portal): el equipo las gestiona desde el Resumen. Solo se cargan ahí.
  const clientRequests =
    tab === "resumen" && !isCliente
      ? await db.clientRequest.findMany({
          where: { projectId: id },
          orderBy: { createdAt: "desc" },
          take: 25,
          select: { id: true, type: true, title: true, details: true, status: true, responseNote: true, createdById: true, createdAt: true },
        })
      : [];

  // Clientes activos para «Mover a otro cliente» (solo admins, dentro de Configuración).
  const moveClients =
    tab === "resumen" && session?.role === "admin"
      ? await db.client.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })
      : [];

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
  // Notas del proyecto: solo se consultan si la pestaña está abierta (una consulta por visita
  // a una pestaña que casi nadie mira no se paga en todas las demás).
  const projectNotes = tab === "notas" && session && !isCliente && hasPermission(session, "ver_notas")
    ? await notesFor(session, { projectId: id })
    : [];

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
  // La carpeta «Guiones» ya NO se aparta: sus archivos son archivos del proyecto como los demás
  // y aparecen en la lista, en su carpeta. Antes vivían en una sección propia de 900 px y, por
  // estar fuera de `otherFolders`, ni siquiera contaban igual que lo que la lista enseñaba.
  // Lo único que aquella sección sabía hacer y la lista no —copiar el texto del guion— baja al
  // menú ⋯ de la fila.
  const otherFolders = project.folders;
  // `archivos` NO se calcula aquí: se rellena más abajo con el largo exacto de `archivosItems`,
  // que es lo que la pestaña va a enseñar. Antes se sumaba a mano e incluía los guiones —que la
  // lista esconde— y las rutas del NAS —que al cliente se le ocultan—, así que la pastilla
  // prometía archivos que al entrar no estaban.
  const counts: Record<string, number> = {
    tareas: project.tasks.length,
    entregables: project.deliverables.length,
  };

  // Vida de los documentos de Office del proyecto: comentarios sin resolver y quién los tiene
  // abiertos ahora mismo. Se ve en la lista, ANTES de abrir nada.
  const docIds = [...otherFolders.flatMap((f) => f.files), ...project.files]
    .filter((f) => isEditableOffice(f.name))
    .map((f) => f.id);
  const docComentarios = docIds.length
    ? await db.docComment.groupBy({ by: ["fileId"], where: { fileId: { in: docIds }, resolved: false }, _count: { _all: true } })
    : [];
  const docPresentes = await docPresenceFor(docIds);
  const docCount = new Map(docComentarios.map((r) => [r.fileId, r._count._all]));
  const docLive = (fileId: string) => ({
    comentarios: docCount.get(fileId) ?? 0,
    dentro: (docPresentes.get(fileId) ?? []).map((p) => p.name),
  });

  // ── Los archivos como los pinta el panel unificado (ArchivoItem) ──
  // Los recortes del rol cliente se hacen AQUÍ, en el servidor: las rutas SMB no viajan y el
  // path de un OPS se anula. El panel nunca decide qué esconder.
  // Enlace de BORRADOR de los entregables: misma puerta que su server action (gestionar el
  // proyecto + `compartir_cliente`, que tienen productor y director pero no los editores).
  // Sin permiso el bloque no se pinta: no ofrecemos un botón que el servidor va a rechazar.
  const puedeBorrador = !isCliente && session?.role !== "demo" && canManageProject(project, session) && hasPermission(session, "compartir_cliente");
  const puedeBorrarBase = alive && session?.role !== "demo" && hasPermission(session, "eliminar_archivos");
  const esClienteMiembro = isCliente && project.members.some((m) => m.userId === session?.id);
  const puedeEliminarArchivo = (uploadedById: string | null, enUso: boolean): boolean => {
    if (!puedeBorrarBase) return false;
    // Vinculado a un entregable (versión/foto/portada): borrar exige gestionar el proyecto.
    if (enUso) return canManageProject(project, session);
    if (canWriteProject(project, session)) return true;
    // Excepción del portal: el cliente borra SOLO lo que subió él.
    return esClienteMiembro && uploadedById === session!.id;
  };
  type ArchivoRow = (typeof project.files)[number];
  const aArchivoItem = (file: ArchivoRow, carpeta: { id: string; name: string; icon: string | null; color: string | null } | null): ArchivoItem => {
    const enUso = file._count.deliverableVersions + file._count.deliverablePhotos + file._count.projectCovers > 0;
    return {
      id: file.id,
      name: file.name,
      kind: file.kind as string,
      url: file.url,
      path: isCliente && file.kind === "OPS" ? null : file.path,
      size: file.size,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      pinned: file.pinned,
      autor: file.uploadedBy?.name ?? file.uploaderName ?? null,
      version: file.version,
      editable: isEditableOffice(file.name),
      viaClientLink: file.viaClientLink,
      missing: opsMissing.has(file.id),
      enUso,
      puedeEliminar: puedeEliminarArchivo(file.uploadedById, enUso),
      ...docLive(file.id),
      task: file.task,
      chat: file.chatAttachments[0] ? { channelId: file.chatAttachments[0].message.channelId, messageId: file.chatAttachments[0].messageId } : null,
      carpeta,
    };
  };
  // La papelera se pide aparte y SOLO en su pestaña: es una lista corta que casi nadie mira.
  const papeleraRaw = tab === "archivos" && !isCliente
    ? await db.fileAsset.findMany({
        where: { projectId: id, deletedAt: { not: null } },
        orderBy: { deletedAt: "desc" },
        take: 100,
        select: {
          id: true, name: true, kind: true, url: true, path: true, size: true, version: true,
          createdAt: true, updatedAt: true, pinned: true, viaClientLink: true, uploaderName: true,
          deletedAt: true,
          uploadedBy: { select: { name: true } },
          folder: { select: { id: true, name: true, icon: true, color: true } },
          _count: { select: { deliverableVersions: true, deliverablePhotos: true, projectCovers: true } },
        },
      })
    : [];
  const papeleraItems: ArchivoItem[] = papeleraRaw.map((f) => ({
    id: f.id,
    name: f.name,
    kind: f.kind as string,
    url: f.url,
    path: f.path,
    size: f.size,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    pinned: f.pinned,
    autor: f.uploadedBy?.name ?? f.uploaderName ?? null,
    version: f.version,
    editable: false,
    viaClientLink: f.viaClientLink,
    enUso: f._count.deliverableVersions + f._count.deliverablePhotos + f._count.projectCovers > 0,
    carpeta: f.folder,
    borradoEn: f.deletedAt ? f.deletedAt.toISOString() : null,
    diasRestantes: f.deletedAt ? diasQueQuedan(f.deletedAt) : 0,
  }));

  const archivosItems: ArchivoItem[] = [
    ...otherFolders.flatMap((f) =>
      f.files
        .filter((file) => !isCliente || file.kind !== "NAS")
        .map((file) => aArchivoItem(file, { id: f.id, name: f.name, icon: f.icon, color: f.color })),
    ),
    ...project.files.filter((file) => !isCliente || file.kind !== "NAS").map((file) => aArchivoItem(file, null)),
  ];
  // La pastilla de la pestaña = lo que el panel enseña. Un solo número, sin excepciones.
  counts.archivos = archivosItems.length;

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
  // Raíz del navegador de carpetas del enlace de subida: la carpeta del CLIENTE en la galería (y si
  // no tiene, la del proyecto). `catch` porque toca el disco: sin NAS montado devuelve null y el
  // panel enseña el aviso en vez de tumbar la página entera del proyecto.
  const raizSubida =
    (await carpetaGaleriaClienteDelProyecto(id).catch(() => null)) ??
    (await carpetaGaleriaProyecto(id).catch(() => null));
  // ¿La galería acepta escritura AHORA? Si no (montaje en solo lectura o sin el centinela), elegir
  // una carpeta y mandarle el enlace al cliente acabaría en que sus subidas fallan una por una.
  // Vale más decirlo aquí que descubrirlo cuando el cliente ya lo intentó.
  const galeriaEscribible = raizSubida ? await galeriaWritable().catch(() => false) : false;
  // Se construye SOLO en su pestaña: armarlo mapea versiones, decisiones, comentarios y fotos
  // de cada entregable, y además serializa todo ese árbol en el payload RSC. En las otras
  // pestañas no se pinta, así que era trabajo y bytes tirados.
  const deliverablesPanelNode = tab !== "entregables" ? null : (
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
        draft: puedeBorrador ? draftShareInfo(d, process.env.NEXTAUTH_URL || "https://os.labstreamsas.com") : null,
        updatedAtIso: d.updatedAt.toISOString(),
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
          // El checklist del editor distingue lo bloqueante de lo opcional, y las respuestas de
          // hilo (parentId) no son ítems que tildar.
          priority: c.priority,
          parentId: c.parentId,
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
      covers={project.covers.map((c) => ({
        id: c.id,
        name: c.name,
        fileAssetId: c.fileAssetId,
        deliverableId: c.deliverableId,
        decision: c.decision,
        decisionBy: c.decisionBy,
        decisionNote: c.decisionNote,
        notes: c.notes,
      }))}
      coversRevoked={!!project.coversRevokedAt}
      projectName={project.name}
      whatsappEnabled={isWhatsappEnabled()}
      clientPhone={project.client?.phone ?? ""}
      stateFilter={estado ?? null}
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

  // Pestañas visibles del proyecto (según permisos/rol) — se pintan en el menú lateral vertical.
  const visibleTabs = TABS.filter(
    (t) =>
      (t.key !== "actividad" || hasPermission(session, "ver_actividad")) &&
      (t.key !== "equipos" || !isCliente) &&
      // Las notas son una herramienta interna: el portal del cliente no las ve.
      (t.key !== "notas" || (!isCliente && hasPermission(session, "ver_notas"))) &&
      // Archivos exige su permiso. El backfill (ensureVerArchivosDefaults) ya se lo dio a
      // todo rol que ve proyectos: nadie pierde la pestaña por encender el gate.
      (t.key !== "archivos" || hasPermission(session, "ver_archivos")),
  );

  return (
    <div className="px-4 py-4 sm:px-8 sm:py-5">
      {/* Opción A: el título vive EN la barra superior (portal a #topbar-page-slot) — sin
          cabecera dentro de la página, el contenido empieza de inmediato. El h1 accesible
          queda oculto (el visible está en la barra). */}
      <ProjectTopbarTitle
        name={project.name}
        emoji={project.emoji}
        color={project.color}
        clientId={project.clientId}
        clientName={project.client.name}
        code={project.code}
        typeLabel={PROJECT_TYPE[project.type]}
        statusLabel={status.label}
        statusClassName={status.className}
        progress={project.progress}
      />
      <h1 className="sr-only">{project.name} · {project.client.name} · {project.code} · {PROJECT_TYPE[project.type]}</h1>

      {/* Banner-LÁPIDA: si el proyecto está dormido (papelera/terminado), decirlo de frente.
          El candado real es server-side; esto es la señal + la salida a un clic. */}
      {!alive ? (
        <ProjectLifecycleBanner
          projectId={project.id}
          mode={project.archivedAt ? "papelera" : "terminado"}
          detail={
            project.archivedAt
              ? `En la papelera desde el ${formatShortDate(project.archivedAt)} · todo queda en solo lectura hasta restaurarlo.`
              : `Terminado el ${formatShortDate(project.finishedAt!)}${project.finishedById ? ` por ${team.find((t) => t.id === project.finishedById)?.name ?? "el equipo"}` : ""} · ${finishedStats!.tasks} tareas · ${finishedStats!.delivApproved}/${finishedStats!.delivTotal} entregables aprobados · ${finishedStats!.hours} h registradas · solo lectura; reábrelo para editar.`
          }
          canRestore={!!project.archivedAt && hasPermission(session, "ver_papelera") && canManageProject(project, session)}
          canReopen={!project.archivedAt && canManageProject(project, session)}
        />
      ) : null}

      {/* Layout de 2 columnas: MENÚ LATERAL vertical del proyecto (izq, el que te gusta) + contenido
          (der). En móvil el menú va arriba como fila horizontal con scroll. */}
      <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row">
      <nav className="shrink-0 md:w-44">
        {/* Móvil: fila horizontal con scroll */}
        <div className="-mb-px flex gap-1 overflow-x-auto border-b border-border md:hidden">
          {visibleTabs.map((t) => {
            const count = (counts as Record<string, number>)[t.key];
            return (
              <Link key={t.key} href={`/proyectos/${id}?tab=${t.key}`} className={cn("flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors", tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                <t.Icon className="size-4 shrink-0" />
                {t.label}{count ? <span className="text-xs text-muted-foreground">{count}</span> : null}
              </Link>
            );
          })}
        </div>
        {/* Escritorio: columna vertical agrupada (Contenido · Entregables · Operación) */}
        <div className="hidden md:sticky md:top-4 md:block">
          {(["contenido", "entregables", "operacion"] as const).map((g) => {
            const items = visibleTabs.filter((t) => t.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="mb-1.5">
                <p className="px-2.5 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{GROUP_LABEL[g]}</p>
                {items.map((t) => {
                  const count = (counts as Record<string, number>)[t.key];
                  return (
                    <Link key={t.key} href={`/proyectos/${id}?tab=${t.key}`} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium transition-colors", tab === t.key ? "bg-primary/10 text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground")}>
                      <t.Icon className="size-[18px] shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{t.label}</span>
                      {count ? <span className="text-xs text-muted-foreground">{count}</span> : null}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </nav>

      <div className="min-w-0 flex-1">
      <div className="mt-0">
        {tab === "resumen" ? (
          <div className="space-y-4">
            {/* ── PORTAL DEL CLIENTE ── sin cambios: su héroe es el viaje del proyecto. */}
            {isCliente ? (
              <>
                <ClientJourney
                  project={{
                    status: project.status,
                    finishedAt: project.finishedAt,
                    nextForClient: project.nextForClient,
                    dueDate: project.dueDate,
                    prevDueDate: project.prevDueDate,
                    dueDateChangedAt: project.dueDateChangedAt,
                    deliverables: project.deliverables.map((d) => ({ status: d.status })),
                    lead: project.lead ? { name: project.lead.name } : null,
                  }}
                />
                <ProjectHealth
                  clientView
                  tasks={project.tasks.map((t) => ({ dueDate: t.dueDate, completedAt: t.completedAt, assigneeName: t.assignee?.name ?? null }))}
                  deliverables={project.deliverables.map((d) => ({ name: d.name, status: d.status, dueDate: d.dueDate, updatedAt: d.updatedAt }))}
                  startDate={project.startDate}
                  dueDate={project.dueDate}
                  lastActivityAt={project.activity[0]?.createdAt ?? null}
                  progress={project.progress}
                />
                <Resumen project={project} priorities={taskLabels.priorities} />
                <ClientTeamPanel
                  projectId={project.id}
                  members={project.members.flatMap((m) => {
                    const u = team.find((t) => t.id === m.userId && t.role?.key !== "cliente");
                    return u ? [{ id: u.id, name: u.name, title: null, initials: u.initials, color: u.avatarColor }] : [];
                  })}
                />
              </>
            ) : (
              (() => {
                // ── EQUIPO · Resumen rediseñado ── el PULSO siempre visible (salud + anillo de
                // progreso + chips clave) y el resto en DESPLEGABLES con su dato en la cabecera:
                // una pantalla, se abre solo lo que se necesita.
                const prioridad = labelMeta(taskLabels.priorities, project.priority);
                const nowMs = Date.now();
                const dueLate = !!project.dueDate && project.dueDate.getTime() < nowMs && !project.finishedAt;
                // Carga por miembro (cabecera y cuerpo del desplegable «Carga del equipo»).
                const carga = team
                  .map((m) => {
                    const abiertas = project.tasks.filter((t) => t.assigneeId === m.id && !t.completedAt);
                    if (!abiertas.length) return null;
                    const late = abiertas.filter((t) => t.dueDate && t.dueDate.getTime() < nowMs - 43_200_000).length;
                    const estH = Math.round(abiertas.reduce((n, t) => n + (t.estimatedMinutes ?? 0), 0) / 60);
                    return { m, open: abiertas.length, late, estH };
                  })
                  .filter(Boolean) as { m: (typeof team)[number]; open: number; late: number; estH: number }[];
                carga.sort((a, b) => b.open - a.open);
                const cargaOpen = carga.reduce((n, r) => n + r.open, 0);
                const cargaLate = carga.reduce((n, r) => n + r.late, 0);
                const cargaH = carga.reduce((n, r) => n + r.estH, 0);
                const pendientes = clientRequests.filter((r) => r.status !== "RESUELTA").length;
                const puedeGestionar = canManageProject(project, session);
                const puedeEditar = hasPermission(session, "editar_proyectos");
                const esAdmin = session?.role === "admin";
                return (
                  <>
                    {/* ── El pulso ── siempre a la vista; no se pliega. */}
                    <ProjectHealth
                      tasks={project.tasks.map((t) => ({ dueDate: t.dueDate, completedAt: t.completedAt, assigneeName: t.assignee?.name ?? null }))}
                      deliverables={project.deliverables.map((d) => ({ name: d.name, status: d.status, dueDate: d.dueDate, updatedAt: d.updatedAt }))}
                      startDate={project.startDate}
                      dueDate={project.dueDate}
                      lastActivityAt={project.activity[0]?.createdAt ?? null}
                      progress={project.progress}
                      hero={{
                        priorityLabel: prioridad.label,
                        priorityChip: prioridad.chip,
                        dueLabel: formatShortDate(project.dueDate) ?? "—",
                        dueLate,
                        leadName: project.lead?.name ?? null,
                      }}
                    />

                    {/* ── Solicitudes del cliente ── trabajo entrante: abierta SOLA si hay pendientes. */}
                    {clientRequests.length > 0 ? (
                      <ResumenSection
                        icon={Inbox}
                        tile="bg-orange-100 dark:bg-orange-500/15"
                        iconCls="text-orange-700 dark:text-orange-300"
                        title="Solicitudes del cliente"
                        titleExtra={pendientes > 0 ? (
                          <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-bold leading-none text-white">{pendientes}</span>
                        ) : null}
                        hint={pendientes > 0 ? `${pendientes} por responder — se abre sola mientras haya pendientes` : "todo respondido"}
                        defaultOpen={pendientes > 0}
                      >
                        <ClientRequestsPanel
                          bare
                          canWrite={canWriteProject(project, session)}
                          requests={clientRequests.map((r) => ({
                            id: r.id,
                            type: r.type,
                            title: r.title,
                            details: r.details,
                            status: r.status,
                            responseNote: r.responseNote,
                            creatorName: team.find((t) => t.id === r.createdById)?.name ?? "Cliente",
                            createdAtLabel: formatBogota(r.createdAt, { day: "numeric", month: "short" }),
                          }))}
                        />
                      </ResumenSection>
                    ) : null}

                    {/* ── «¿Qué sigue?» ── la frase del portal se LEE en la cabecera; se abre solo para editarla. */}
                    {puedeGestionar ? (
                      <ResumenSection
                        icon={Megaphone}
                        tile="bg-violet-100 dark:bg-violet-500/15"
                        iconCls="text-violet-700 dark:text-violet-300"
                        title="«¿Qué sigue?» para el cliente"
                        hint={project.nextForClient?.trim()
                          ? <span className="italic">«{project.nextForClient.trim()}»</span>
                          : "vacío — el cliente ve el texto automático de la fase"}
                      >
                        <NextForClientCard bare projectId={project.id} note={project.nextForClient} />
                      </ResumenSection>
                    ) : null}

                    {/* ── Carga del equipo ── avatares en la cabecera; barras de reparto al abrir. */}
                    {carga.length >= 2 ? (
                      <ResumenSection
                        icon={Users}
                        tile="bg-emerald-100 dark:bg-emerald-500/15"
                        iconCls="text-emerald-700 dark:text-emerald-300"
                        title="Carga del equipo"
                        titleExtra={
                          <span className="flex items-center">
                            {carga.slice(0, 4).map((r, i) => (
                              <span key={r.m.id} className={cn("rounded-full ring-2 ring-card", i > 0 && "-ml-1.5")}>
                                <UserAvatar initials={r.m.initials} name={r.m.name} color={r.m.avatarColor} size="sm" />
                              </span>
                            ))}
                          </span>
                        }
                        hint={`${cargaOpen} abiertas${cargaH ? ` · ~${cargaH} h estimadas` : ""}${cargaLate ? ` · ${cargaLate} atrasadas` : ""}`}
                      >
                        <TeamLoad rows={carga} />
                      </ResumenSection>
                    ) : null}

                    {/* ── Propuesta ── referencia (qué haremos); abre expandida solo en proyectos recién creados. */}
                    <ResumenSection
                      icon={FileText}
                      tile="bg-sky-100 dark:bg-sky-500/15"
                      iconCls="text-sky-700 dark:text-sky-300"
                      title="Propuesta del proyecto"
                      hint="alcance y entregables (qué haremos)"
                      defaultOpen={project.tasks.length === 0}
                    >
                      <BriefPanel
                        projectId={id}
                        scope={project.briefScope}
                        deliverables={project.briefDeliverables}
                        rounds={project.roundsIncluded}
                        canWrite={canWriteProject(project, session)}
                      />
                    </ResumenSection>

                    {/* ── Configuración ── la cocina (detalles, miembros/privacidad, mover de cliente)
                        junta y plegada al final: estaba aquí mismo, pero en 3 tarjetas abiertas. */}
                    {puedeEditar || puedeGestionar || esAdmin ? (
                      <ResumenSection
                        icon={Settings}
                        tile="bg-muted"
                        iconCls="text-muted-foreground"
                        title="Configuración"
                        hint={[
                          project.dueDate ? `entrega ${formatShortDate(project.dueDate)}` : "sin fecha de entrega",
                          project.isPrivate ? "privado" : "todo el equipo",
                          project.client?.name ?? null,
                        ].filter(Boolean).join(" · ")}
                        bodyClass="space-y-3 bg-muted/30"
                      >
                        {puedeEditar ? (
                          <ProjectDetailsForm
                            projectId={project.id}
                            name={project.name}
                            description={project.description}
                            dueDate={project.dueDate ? project.dueDate.toISOString().slice(0, 10) : ""}
                          />
                        ) : null}
                        {puedeGestionar ? (
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
                            isFinished={!!project.finishedAt}
                          />
                        ) : null}
                        {esAdmin ? (
                          <MoveProjectClient
                            projectId={project.id}
                            currentClientId={project.clientId}
                            clients={moveClients}
                          />
                        ) : null}
                      </ResumenSection>
                    ) : null}
                  </>
                );
              })()
            )}
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
                projectId={project.id}
                  pendingCount={pendingTasks.length}
                  completedCount={completedTasks.length}
                  pending={
                    // T1+T2 · Filtro por persona (chips de avatares) + vista «Por persona»
                    // (carriles), envolviendo el tablero/lista de siempre.
                    <TasksViews
                      projectId={id}
                      team={teamForTasks}
                      stages={project.stages}
                      stageColors={(project.stageColors as Record<string, string> | null) ?? {}}
                      tasks={pendingTasks}
                      statuses={taskLabels.statuses}
                      priorities={taskLabels.priorities}
                      isAdmin={session?.role === "admin" || session?.role === "productor"}
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
            {/* Las hojas de llamado viven aquí: el llamado ES un asunto de fecha. */}
            {!isCliente ? <LlamadosStrip projectId={id} gestiona={canManageProject(project, session) && session?.role !== "demo"} /> : null}
            <div className="h-[74vh] min-h-[26rem]">
              <ProjectCalendar
                items={projectCalItems}
                onCreate={canWriteProject(project, session) || (alive && isCliente && hasPermission(session, "gestionar_calendario")) ? createMyEvent : undefined}
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
            conflictos={await conflictosDependencias(id)}
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
          <div className="space-y-3">
            {/* La pestaña abría con TRES bloques desplegados que no son archivos —Guiones con su
                propia zona de arrastre y su vacío (900 px medidos), el mapa de discos y el banner
                del enlace público— así que el primer archivo caía fuera de la pantalla.
                Ahora: los guiones son archivos de su carpeta como cualquier otro (con «Copiar el
                texto» en su menú ⋯), y lo demás vive PLEGADO en una fila de una línea. Nada se
                pierde; deja de estar abierto de oficio. */}
            <div className="flex flex-wrap gap-2">
              {!isCliente ? (
                <details className="min-w-56 flex-1 rounded-lg border border-border bg-card">
                  <summary className="cursor-pointer list-none px-3 py-2 text-sm text-muted-foreground marker:content-none">
                    💾 <b className="font-semibold text-foreground">¿Dónde está el material?</b>
                  </summary>
                  <div className="border-t border-border p-3">
                    <MaterialCard projectId={id} canManage={hasPermission(session, "gestionar_biblioteca")} />
                  </div>
                </details>
              ) : null}
              {/* Solo quien GESTIONA el proyecto ve/comparte el enlace público de subida (la URL en
                  vivo no se expone a todo el equipo). */}
              {canManageProject(project, session) ? (
                <details className="min-w-56 flex-1 rounded-lg border border-border bg-card">
                  <summary className="cursor-pointer list-none px-3 py-2 text-sm text-muted-foreground marker:content-none">
                    🔗 <b className="font-semibold text-foreground">Link de subida para el cliente</b>
                  </summary>
                  <div className="border-t border-border p-3">
                    <UploadShare
                      projectId={id}
                      initialLink={project.uploadRevokedAt || !project.uploadNonce ? null : `${(process.env.NEXTAUTH_URL || "https://os.labstreamsas.com").replace(/\/$/, "")}/subir/${signUploadToken(id, project.uploadNonce)}`}
                      uploadDir={project.uploadDir}
                      uploadGaleriaFolder={project.uploadGaleriaFolder}
                      galeriaRaiz={raizSubida?.rel ?? null}
                      galeriaRaizLabel={project.client?.name ?? project.name}
                      galeriaEscribible={galeriaEscribible}
                      emailEnabled={emailEnabled}
                    />
                  </div>
                </details>
              ) : null}
            </div>

            <section>
              <FilesPanel
                projectId={id}
                items={archivosItems}
                ahora={ahoraMs()}
                carpetas={otherFolders.map((f) => ({ id: f.id, name: f.name, icon: f.icon, color: f.color }))}
                ops={opsInfo}
                canUpload={alive && canUploadFiles && session?.role !== "demo"}
                canLinks={alive && canUploadFiles && session?.role !== "demo"}
                canRutas={alive && !isCliente && canWriteProject(project, session) && session?.role !== "demo"}
                canFolders={alive && !isCliente && canWriteProject(project, session) && session?.role !== "demo"}
                canLinkOps={opsAvailable && alive && canWriteProject(project, session) && session?.role !== "demo"}
                canCreateDoc={alive && canUploadFiles && session?.role !== "demo"}
                canChunked={alive && !isCliente && canWriteProject(project, session) && session?.role !== "demo"}
                papelera={papeleraItems}
                onlyoffice={ooReady}
              />
            </section>
          </div>
        ) : null}
        {tab === "notas" && !isCliente && hasPermission(session, "ver_notas") ? (
          <NotesTab
            notes={projectNotes}
            projectId={id}
            canWrite={hasPermission(session, "editar_notas") && session?.role !== "demo"}
          />
        ) : null}

        {tab === "correo" ? (
          <CorreoProyecto projectId={id} sessionUserId={session?.id ?? null} gestiona={!isCliente && session?.role !== "demo" && canManageProject(project, session)} />
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

      {/* Chat del proyecto = BURBUJA flotante (ya no una pestaña) con badge de no-leídos.
          En la PAPELERA no se monta: el canal está congelado (enviar sería un no-op) y la
          conversación se consulta desde /chat. En TERMINADOS sí vive (retomar es legítimo). */}
      {session && session.role !== "cliente" && !project.archivedAt ? (
        <ProjectChatBubble
          projectId={id}
          me={{ id: session.id, name: session.name, initials: session.initials, color: session.color }}
          isAdmin={session.role === "admin"}
        />
      ) : null}
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

// X2 · Carga por miembro DE ESTE proyecto (tareas abiertas + horas estimadas + atrasadas).
// La Carga global vive en Mis tareas; esta es la lupa local para repartir en contexto.
// Vive dentro del desplegable «Carga del equipo» (las filas se calculan en la página, que
// también alimenta la cabecera): barras de reparto — verde al día, ámbar con atrasadas.
function TeamLoad({
  rows,
}: {
  rows: { m: { id: string; name: string; initials: string | null; avatarColor: string | null }; open: number; late: number; estH: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.open));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.m.id} className="flex items-center gap-2.5">
          <UserAvatar initials={r.m.initials} name={r.m.name} color={r.m.avatarColor} size="sm" />
          <span className="w-24 truncate text-[13px]">{r.m.name.split(" ")[0]}</span>
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", r.late ? "bg-amber-500" : "bg-emerald-500")}
              style={{ width: `${Math.max(8, (r.open / max) * 100)}%` }}
            />
          </div>
          <span className="w-32 shrink-0 text-right text-[11px] text-muted-foreground">
            {r.open} abierta{r.open === 1 ? "" : "s"}{r.estH ? ` · ~${r.estH} h` : ""}
            {r.late ? <b className="text-red-600 dark:text-red-400"> · ⚠{r.late}</b> : null}
          </span>
        </div>
      ))}
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
