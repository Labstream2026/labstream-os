import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canAccessProject, canWriteProject, canManageProject, accessibleProjectWhere } from "@/lib/project-access";
import { isEditableOffice } from "@/lib/onlyoffice";
import { ahoraMs, fechaRelativa, VIDEO_ARCHIVO_EXT, type ArchivoItem } from "@/lib/archivos/tipos";
import { canAccessClient, canManageClient } from "@/lib/client-access";
import { ClientMembers } from "./client-members";
import { ClientTopbarPeople } from "./client-topbar-people";
import { ClientUsers, type ClientUserItem } from "./client-users";
import { ClientEdit } from "./client-edit";
import { ClientIdentity, ClientCover } from "./client-appearance";
import { ClientGaleria, ClientGaleriaAviso, type CarpetaDisponible } from "./client-galeria";
import { galeriaEnabled, galeriaReady, galeriaWritable, listGaleriaFolders, statGaleria } from "@/lib/nas-galeria";
import { ClientHero } from "@/components/client-hero";
import { ClientViewNav } from "./client-view-nav";
import { ClientResumen, type ResumenProyecto } from "./client-resumen";
import { ClientBrief, type BriefProyecto } from "./client-brief";
import { AjustesLayout, type AjSeccion } from "./client-ajustes";
import { saveClientAppearance, clearClientImage, clearClientCover } from "../actions";
import { statusMeta, formatShortDate, MARCO } from "@/lib/ui";
import { CalendarBoard } from "@/app/(app)/calendario/calendar-board";
import { eventToCalItem, taskToCalItems, projectSummaryItems } from "@/app/(app)/calendario/build-items";
import { createMyEvent } from "@/app/(app)/calendario/actions";
import { buildSessionTimeline } from "@/lib/timeline-data";
import { GlobalTimeline } from "@/app/(app)/timeline/global-timeline";
import { ActivityFeed } from "@/app/(app)/proyectos/[id]/activity-feed";
import { ClientDeliverables, type ClientDeliverable } from "./client-deliverables";
import { ClientStatus } from "./client-status";
import { ClientProjectArchive, type ProyectoArchivable } from "./client-project-archive";
import { ClientBilling, type ClientInvoiceRow } from "./client-billing";
import { ClientComercial } from "./client-comercial";
import { ClientFilesPanel } from "./client-files";
import { ClientProyectos, type ProyectoInfo } from "./client-proyectos";
import { billableQuoteWhere, quoteBillTotal, daysSince, effectiveInvoiceStatus } from "@/lib/billing";
import { quoteTotals } from "@/lib/ui";
import { type PorFacturarItem } from "@/app/(app)/facturacion/por-facturar";
import { tone } from "@/lib/colors";
import { effectiveStatus, STATUS_META, type ProposalStatus } from "@/lib/proposals/types";
import { TEMPLATE_MAP } from "@/lib/proposals/templates";
import { IconInicio, IconProyectos, IconCalendario, IconEntregas, IconArchivo, IconFacturacion, IconActividad, IconConfiguracion, IconNotas } from "@/components/icons";
import { NotesTab } from "@/components/notes/notes-tab";
import { notesFor } from "@/lib/notes-for";

export const dynamic = "force-dynamic";

// Título de la pestaña: el nombre del cliente, no "Labstream OS" como todas las demás.
// Con el mismo candado que la página (permiso de zona + acceso a ESTE cliente), para que el
// título no revele la cartera de clientes a quien no la puede ver.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const session = await getSession();
  if (!hasPermission(session, "ver_clientes")) return { title: "Cliente" };
  const client = await db.client.findUnique({
    where: { id },
    select: {
      name: true,
      members: { select: { userId: true, role: true } },
      projects: { select: { leadId: true, members: { select: { userId: true } } } },
    },
  });
  if (!client || !canAccessClient(client, session)) return { title: "Cliente" };
  return { title: client.name };
}

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  // La zona Clientes requiere ver_clientes; además, abajo se valida el acceso a ESTE cliente.
  if (!hasPermission(session, "ver_clientes")) redirect("/");
  const canActividad = hasPermission(session, "ver_actividad");
  const client = await db.client.findUnique({
    where: { id },
    include: {
      _count: { select: { quotes: true } },
      members: { include: { user: { select: { id: true, name: true, email: true, initials: true, avatarColor: true, passwordHash: true, role: { select: { key: true } } } } } },
      files: { orderBy: { createdAt: "desc" }, select: { id: true, name: true, kind: true, url: true, path: true, createdAt: true, updatedAt: true, pinned: true, category: true, note: true, uploadedBy: { select: { name: true } } } },
      projects: {
        // El recorte por acceso va EN LA BASE (accessibleProjectWhere), no en un .filter() de
        // JS: antes se traía cada proyecto vedado entero (con entregables y versiones) solo
        // para tirarlo. Nota: esto además CORRIGE un permiso latente — el RESPONSABLE de la
        // cuenta ahora ve aquí los proyectos privados de su cliente, como ya le prometía
        // canAccessProject (la rama nunca podía cumplirse porque el include no traía client).
        where: { AND: [{ archivedAt: null }, accessibleProjectWhere(session)] },
        orderBy: { createdAt: "asc" },
        include: {
          lead: { select: { name: true, initials: true, avatarColor: true } },
          members: { select: { userId: true, role: true } },
          deliverables: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              number: true,
              type: true,
              status: true,
              dueDate: true,
              // Para la miniatura de la pestaña Entregables: portada asignada o, en su
              // defecto, el fotograma del video de la última versión (?poster=1).
              coverFileAssetId: true,
              // 0 = pre-aprobado sin abrir; >0 = el cliente ya lo está viendo.
              reviewVisits: true,
              versions: {
                orderBy: { number: "desc" },
                take: 1,
                select: { number: true, fileAsset: { select: { id: true, name: true } } },
              },
              _count: { select: { reviewComments: true } },
            },
          },
        },
      },
    },
  });

  if (!client) notFound();
  // Solo quien puede ver el cliente (miembro o participa en sus proyectos; admin todos).
  if (!canAccessClient(client, session)) notFound();

  // Cinturón sobre el where de arriba. OJO: hay que pasarle el cliente con sus miembros, o la
  // rama del RESPONSABLE fallaría aquí y el filtro desharía lo que la consulta ya concedió.
  const projects = client.projects.filter((p) => canAccessProject({ ...p, client: { members: client.members } }, session));
  const projectIds = projects.map((p) => p.id);
  const active = projects.filter((p) => !["CERRADO", "CANCELADO"].includes(p.status)).length;

  // Una sola verdad de "hoy" para toda la página (fechas vencidas, próximas, actividad).
  // `ahoraMs()` y no `Date.now()`: el lint de pureza prohíbe llamar impuras en el cuerpo del
  // componente; el helper (función normal de lib) es la vía aceptada en esta base.
  const nowMs = ahoraMs();
  const DONE_PROY = ["APROBADO", "ENTREGADO", "CERRADO", "CANCELADO"];
  const DELIV_DONE = ["APROBADO", "ENTREGADO"];
  // El cliente con sus miembros, para las ramas de acceso que lo necesitan (RESPONSABLE).
  const clientePara = { members: client.members };
  const sessionCanApprove = hasPermission(session, "aprobar_entregables");

  // Entregables de TODOS los proyectos visibles del cliente, aplanados con su proyecto
  // de origen, para la pestaña «Entregables» (vista agregada por cliente, agrupada por estado).
  // La miniatura y el permiso de aprobar se resuelven AQUÍ (servidor): portada asignada o el
  // fotograma de la última versión si es video; aprobar = gestionar + aprobar_entregables,
  // el MISMO gate que la pantalla de Revisiones.
  const clientDeliverables: ClientDeliverable[] = projects.flatMap((p) => {
    const canApprove = sessionCanApprove && canManageProject({ ...p, client: clientePara }, session);
    return p.deliverables.map((d) => {
      const vFile = d.versions[0]?.fileAsset ?? null;
      const thumbSrc = d.coverFileAssetId
        ? `/api/files-asset/${d.coverFileAssetId}`
        : vFile && VIDEO_ARCHIVO_EXT.test(vFile.name)
          ? `/api/files-asset/${vFile.id}?poster=1`
          : null;
      return {
        id: d.id,
        name: d.name,
        number: d.number,
        type: d.type,
        status: d.status,
        dueDate: d.dueDate,
        dueLabel: formatShortDate(d.dueDate),
        overdue: !!d.dueDate && d.dueDate.getTime() < nowMs && !DELIV_DONE.includes(d.status),
        versionNumber: d.versions[0]?.number ?? null,
        project: { id: p.id, name: p.name, emoji: p.emoji },
        thumbSrc,
        comments: d._count.reviewComments,
        reviewVisits: d.reviewVisits,
        canApprove,
      };
    });
  });

  // Actividad del cliente: cambios del propio cliente + de sus proyectos. Solo se consulta si
  // la pestaña existe para este usuario: sin `ver_actividad` la vista no se pinta, así que
  // traer 60 registros con su autor era trabajo tirado en cada carga de la ficha.
  const activity = canActividad
    ? await db.activityLog.findMany({
        where: { OR: [{ clientId: id }, { projectId: { in: projectIds.length ? projectIds : ["__none__"] } }] },
        orderBy: { createdAt: "desc" },
        take: 60,
        include: { user: { select: { name: true, initials: true, avatarColor: true } } },
      })
    : [];

  // Propuestas vinculadas a este cliente (constructor de propuestas).
  const proposals = await db.proposal.findMany({
    where: { clientId: id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, code: true, title: true, status: true, expiresAt: true, templateKey: true },
  });

  // ── Facturación del cliente (solo con permiso de finanzas; valores sensibles) ──
  // Vive pegada al cliente: aparece aunque no tenga proyectos activos (caso "terminé el
  // proyecto y falta emitir la factura"). Sin ver_finanzas, la pestaña no se muestra.
  const canBilling = hasPermission(session, "ver_finanzas");
  const canCreateInvoice = hasPermission(session, "crear_cotizaciones");
  let billingPorFacturar: PorFacturarItem[] = [];
  let billingInvoices: ClientInvoiceRow[] = [];
  if (canBilling) {
    const [cInvoices, cQuotes] = await Promise.all([
      db.invoice.findMany({
        where: { clientId: id },
        orderBy: { createdAt: "desc" },
        include: { project: { select: { name: true } }, items: { select: { quantity: true, unitPrice: true } } },
      }),
      db.quote.findMany({
        where: { clientId: id, ...billableQuoteWhere() },
        orderBy: { approvedAt: "asc" },
        include: { project: { select: { name: true, emoji: true } }, items: { select: { quantity: true, unitPrice: true } } },
      }),
    ]);
    const drafts: PorFacturarItem[] = cInvoices
      .filter((inv) => inv.status === "BORRADOR")
      .map((inv) => ({
        key: `inv-${inv.id}`,
        clientName: client.name,
        clientEmoji: client.emoji,
        context: inv.project?.name ? `${inv.code} · ${inv.project.name}` : inv.code,
        note: "Borrador creado, falta emitir",
        amount: quoteTotals(inv.items, inv.taxRate).total,
        currency: inv.currency,
        emit: { type: "open", href: `/facturacion/${inv.id}` },
      }));
    const fromQuotes: PorFacturarItem[] = cQuotes.map((q) => {
      const d = daysSince(q.approvedAt);
      return {
        key: `q-${q.id}`,
        clientName: client.name,
        clientEmoji: client.emoji,
        context: q.project?.name ?? q.title,
        note: q.project
          ? `Proyecto terminado · sin factura${d != null ? ` · aprobada hace ${d} d` : ""}`
          : `Sin proyecto · cobro directo${d != null ? ` · aprobada hace ${d} d` : ""}`,
        urgent: d != null && d >= 15,
        amount: quoteBillTotal(q),
        currency: q.currency,
        emit: { type: "quote", quoteId: q.id },
      };
    });
    billingPorFacturar = [...fromQuotes, ...drafts];
    billingInvoices = cInvoices
      .filter((inv) => inv.status !== "BORRADOR")
      .map((inv) => ({
        id: inv.id,
        code: inv.code,
        status: effectiveInvoiceStatus(inv.status, inv.dueDate),
        total: quoteTotals(inv.items, inv.taxRate).total,
        currency: inv.currency,
        projectName: inv.project?.name ?? null,
      }));
  }

  // Acceso al cliente: miembros explícitos + a quién se le puede dar acceso.
  const canManage = canManageClient(client, session);
  const canEdit = canManage || hasPermission(session, "editar_clientes");

  // ── Carpeta del cliente en la Galería (tarjeta de Ajustes + aviso en la ficha) ──
  // La regla: todo cliente tiene su carpeta en la raíz de Entregas_LAB. Aquí solo se LEE el
  // estado (¿hay vínculo?, ¿la carpeta sigue en el disco?, ¿qué carpetas de la raíz hay para
  // vincular?); crear/vincular corre en galeria-actions con sus propias llaves.
  const galeriaOn = galeriaEnabled() && (await galeriaReady());
  const puedeCarpeta = canEdit && session?.role !== "demo" && hasPermission(session, "escribir_discos");
  let galeriaEscritura = false;
  let carpetaExiste = true;
  let carpetasRaiz: CarpetaDisponible[] = [];
  if (galeriaOn) {
    galeriaEscritura = await galeriaWritable();
    if (client.galeriaFolder) {
      const st = await statGaleria(client.galeriaFolder).catch(() => null);
      carpetaExiste = !!st?.dir;
    }
    if (puedeCarpeta) {
      // Solo la raíz: la carpeta del cliente vive ahí por convención. Se marca la dueña de
      // cada una para deshabilitarla en el selector (el servidor la rechazaría igual).
      const [folders, duenos] = await Promise.all([
        listGaleriaFolders("").catch(() => []),
        db.client.findMany({ where: { galeriaFolder: { not: null }, id: { not: id } }, select: { name: true, galeriaFolder: true } }),
      ]);
      const duenoPorRel = new Map(duenos.map((c) => [c.galeriaFolder as string, c.name]));
      carpetasRaiz = folders.map((f) => ({ rel: f.rel, name: f.name, ocupadaPor: duenoPorRel.get(f.rel) ?? null }));
    }
  }

  // ── Vista «Archivos»: TODOS los archivos de los proyectos visibles + el material de marca ──
  // Mismo patrón que la pestaña Entregables: se aplana con el proyecto de origen colgado.
  // Se excluyen los FileAsset que son fotos de entregables o portadas (no son archivos sueltos).
  const rawArchivos = await db.fileAsset.findMany({
    where: {
      projectId: { in: projectIds.length ? projectIds : ["__none__"] },
      deletedAt: null, // lo que está en la papelera no se enseña (se recupera desde su proyecto)
      deliverablePhotos: { none: {} },
      projectCovers: { none: {} },
    },
    // Por ACTIVIDAD, no por creación: un guion editado ayer en OnlyOffice es más «reciente»
    // que una foto subida hoy hace un mes. updatedAt existe desde la migración archivos_fase2.
    orderBy: { updatedAt: "desc" },
    take: 300, // tope duro: el payload RSC de esta página se serializa SIEMPRE, se mire o no la vista
    select: {
      id: true, name: true, kind: true, url: true, path: true, size: true, version: true,
      createdAt: true, updatedAt: true, pinned: true, viaClientLink: true, uploaderName: true,
      uploadedBy: { select: { name: true } },
      task: { select: { id: true, title: true } },
      folder: { select: { id: true, name: true, icon: true, color: true } },
      project: { select: { id: true, name: true, emoji: true } },
      chatAttachments: { where: { message: { deletedAt: null } }, take: 1, select: { messageId: true, message: { select: { channelId: true } } } },
      _count: { select: { deliverableVersions: true, deliverablePhotos: true, projectCovers: true } },
    },
  });
  // Escritura por proyecto, con el cliente puesto (la rama del RESPONSABLE cuenta aquí).
  const escribibles = projects.filter((p) => canWriteProject({ ...p, client: clientePara }, session));
  const gestionados = projects.filter((p) => canManageProject({ ...p, client: clientePara }, session));
  const escribeEn = new Set(escribibles.map((p) => p.id));
  const puedeEliminarArchivos = hasPermission(session, "eliminar_archivos");
  const itemsArchivos: ArchivoItem[] = [
    ...rawArchivos.map((f) => {
      const enUso = f._count.deliverableVersions + f._count.deliverablePhotos + f._count.projectCovers > 0;
      const gestiona = gestionados.some((p) => p.id === f.project.id);
      return {
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
        editable: isEditableOffice(f.name),
        viaClientLink: f.viaClientLink,
        enUso,
        // Espejo de las reglas reales de deleteFile: permiso + escritura, y con vínculos, gestión.
        puedeEliminar: puedeEliminarArchivos && escribeEn.has(f.project.id) && (!enUso || gestiona),
        task: f.task,
        chat: f.chatAttachments[0] ? { channelId: f.chatAttachments[0].message.channelId, messageId: f.chatAttachments[0].messageId } : null,
        carpeta: f.folder,
        proyecto: f.project,
      };
    }),
    ...client.files.map((cf) => ({
      id: cf.id,
      name: cf.name,
      kind: cf.kind as string,
      url: cf.url,
      path: cf.path,
      size: null,
      createdAt: cf.createdAt.toISOString(),
      updatedAt: cf.updatedAt.toISOString(),
      pinned: cf.pinned,
      categoria: cf.category,
      nota: cf.note,
      autor: cf.uploadedBy?.name ?? null,
      version: 1,
      editable: false,
      viaClientLink: false,
      esMarca: true,
      puedeEliminar: canEdit,
    })),
  ];
  const proyectoRef = (p: (typeof projects)[number]) => ({ id: p.id, name: p.name, emoji: p.emoji });
  // Invitar/crear usuarios cliente es sensible → solo admins (administrar_usuarios).
  const isAdmin = hasPermission(session, "administrar_usuarios");
  // Notas de la CUENTA y de SUS PROYECTOS, juntas (aprobado por prototipo): cada una con el
  // chip de su origen para poder filtrar. El compositor de la pestaña apunta a la cuenta.
  const clientNotes = session && hasPermission(session, "ver_notas") ? await notesFor(session, { clientId: id, projectIds }) : [];

  // Separamos los miembros del cliente: EQUIPO interno (acceso) vs USUARIOS CLIENTE del portal (rol cliente).
  const clientUsers: ClientUserItem[] = client.members
    .filter((m) => m.user.role?.key === "cliente")
    .map((m) => ({ id: m.user.id, name: m.user.name, email: m.user.email, initials: m.user.initials, color: m.user.avatarColor, pending: !m.user.passwordHash }))
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

  const memberItems = client.members
    .filter((m) => m.user.role?.key !== "cliente")
    .map((m) => ({ id: m.user.id, name: m.user.name, initials: m.user.initials, color: m.user.avatarColor, role: m.role }));
  // UNA sola consulta de usuarios activos para los dos usos de la página: el listado de «Dar
  // acceso» (equipo, sin los usuarios cliente del portal) y el selector de personas del
  // calendario (todos). Antes eran dos consultas casi idénticas.
  const activeUsers = await db.user.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, initials: true, avatarColor: true, role: { select: { key: true } } },
  });
  const team = canManage ? activeUsers.filter((u) => u.role?.key !== "cliente") : [];
  const memberIds = new Set(client.members.map((m) => m.user.id));
  const addable = team
    .filter((u) => !memberIds.has(u.id))
    .map((u) => ({ id: u.id, name: u.name, initials: u.initials, color: u.avatarColor }));

  // Calendario colaborativo del cliente: citas + tareas de sus proyectos visibles.
  const calWindowStart = new Date(new Date().setMonth(new Date().getMonth() - 1));
  const safeProjectIds = projectIds.length ? projectIds : ["__none__"];
  const calTeam = activeUsers;
  const [clientEvents, clientTasks] = await Promise.all([
    db.calendarEvent.findMany({
      where: { projectId: { in: safeProjectIds }, start: { gte: calWindowStart } },
      include: {
        project: { select: { name: true, emoji: true } },
        attendees: { include: { user: { select: { name: true, initials: true, avatarColor: true } } } },
        guests: { select: { email: true } },
      },
    }),
    db.task.findMany({
      where: { projectId: { in: safeProjectIds }, OR: [{ dueDate: { gte: calWindowStart } }, { shootDate: { gte: calWindowStart } }] },
      select: {
        id: true, title: true, dueDate: true, dueTime: true, shootDate: true, completedAt: true,
        project: { select: { id: true, name: true, emoji: true } },
        assignee: { select: { name: true, initials: true, avatarColor: true } },
      },
    }),
  ]);
  const clientCalItems = [
    ...clientEvents.map((e) => eventToCalItem(e, session?.id, e.projectId ? `/proyectos/${e.projectId}` : null)),
    ...clientTasks.flatMap((t) => taskToCalItems(t)),
    // Resumen de los proyectos del cliente: inicio, entrega y fechas de entregables.
    ...projects.flatMap((p) => projectSummaryItems({ id: p.id, name: p.name, emoji: p.emoji, startDate: p.startDate, dueDate: p.dueDate, deliverables: p.deliverables })),
  ];

  // Cronograma acotado a ESTE cliente (conmutador Calendario/Cronograma de la pestaña).
  // Mismo constructor que /calendario y /timeline, recortado en la base por clientId.
  const clientTimeline = hasPermission(session, "ver_proyectos")
    ? await buildSessionTimeline(session, { clientId: id })
    : null;

  // ── Datos de la pestaña RESUMEN (lo más importante al entrar) ──
  // Todo se calcula aquí, en el servidor: una sola verdad de "hoy" y fechas ya formateadas (sin
  // desfases de zona horaria ni de hidratación). El color del cliente tiñe pestañas e índice.
  const accentHex = client.accentColor ? tone(client.accentColor).hex : undefined;
  // El entregable VENCIDO más urgente (el que lleva más tiempo esperando) para la alerta roja.
  const overdueDeliv = clientDeliverables
    .filter((d) => d.dueDate && d.dueDate.getTime() < nowMs && !DELIV_DONE.includes(d.status))
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())[0];
  const overdueInfo = overdueDeliv ? { name: overdueDeliv.project.name, label: formatShortDate(overdueDeliv.dueDate) ?? "" } : null;
  // La próxima entrega del cliente: el entregable con fecha más cercana por delante.
  const nextDeliv = clientDeliverables
    .filter((d) => d.dueDate && d.dueDate.getTime() >= nowMs)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())[0];
  const resumenRows: ResumenProyecto[] = projects.map((p) => {
    const meta = statusMeta(p.status);
    return {
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      statusLabel: meta.label,
      statusClass: meta.className,
      dueLabel: formatShortDate(p.dueDate),
      overdue: !!p.dueDate && p.dueDate.getTime() < nowMs && !DONE_PROY.includes(p.status),
      progress: p.progress,
      lead: p.lead ? { initials: p.lead.initials, color: p.lead.avatarColor } : null,
    };
  });
  // ── Plan de trabajo: brief + checklist de videos, por proyecto ──
  // El checklist se ARMA SOLO con los entregables reales (nada que mantener a mano): una pieza
  // cuenta como hecha cuando queda aprobada o entregada. Los dos textos del brief ya existían en
  // el proyecto (briefScope / briefDeliverables) y hasta ahora solo se veían dentro de él.
  const briefProyectos: BriefProyecto[] = projects
    .filter((p) => !DONE_PROY.includes(p.status))
    .map((p) => {
      const meta = statusMeta(p.status);
      const piezas = p.deliverables.map((d) => ({ id: d.id, name: d.name, done: DELIV_DONE.includes(d.status) }));
      return {
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        statusLabel: meta.label,
        statusClass: meta.className,
        scope: p.briefScope,
        special: p.briefDeliverables,
        piezas,
        hechas: piezas.filter((d) => d.done).length,
        // Espejo EXACTO del candado de updateProjectBrief (escritura + editar_proyectos): sin
        // el permiso, el botón «Editar brief» sería un botón que siempre falla.
        canEdit: canWriteProject(p, session) && hasPermission(session, "editar_proyectos"),
      };
    });
  // Compromiso de la cuenta: TODAS sus piezas (incluidas las de proyectos ya cerrados) y cuántas
  // están resueltas. Es el número que se pregunta el gerente al abrir el cliente.
  const videosTotal = clientDeliverables.length;
  const videosHechos = clientDeliverables.filter((d) => DELIV_DONE.includes(d.status)).length;

  // ── Pestaña PROYECTOS: la tarjeta/fila con MÁS información (aprobado por prototipo) ──
  // «Última actividad» sale de UNA consulta agregada (el máximo del log por proyecto), no de
  // traer los registros: es un timestamp, no una historia.
  const lastActs = projectIds.length
    ? await db.activityLog.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds } },
        _max: { createdAt: true },
      })
    : [];
  const lastActByProject = new Map(lastActs.map((a) => [a.projectId, a._max.createdAt]));
  const proyectosInfo: ProyectoInfo[] = projects.map((p) => {
    const meta = statusMeta(p.status);
    const ultima = lastActByProject.get(p.id) ?? null;
    return {
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      statusLabel: meta.label,
      statusClass: meta.className,
      progress: p.progress,
      dueLabel: formatShortDate(p.dueDate),
      overdue: !!p.dueDate && p.dueDate.getTime() < nowMs && !DONE_PROY.includes(p.status),
      videosTotal: p.deliverables.length,
      videosHechos: p.deliverables.filter((d) => DELIV_DONE.includes(d.status)).length,
      correcciones: p.deliverables.filter((d) => d.status === "CORRECCIONES").length,
      actividadLabel: ultima ? fechaRelativa(ultima.toISOString()) : null,
      lead: p.lead ? { name: p.lead.name, initials: p.lead.initials, color: p.lead.avatarColor } : null,
    };
  });

  // Proyectos que ESTE usuario puede mandar a la papelera desde Ciclo de vida: gestión del
  // proyecto + permiso de eliminar — el mismo candado que valida archiveProject en el servidor.
  const archivables: ProyectoArchivable[] = hasPermission(session, "eliminar_proyectos")
    ? gestionados.map((p) => {
        const meta = statusMeta(p.status);
        return { id: p.id, name: p.name, emoji: p.emoji, statusLabel: meta.label, statusClass: meta.className };
      })
    : [];

  const resumen = (
    <ClientResumen
      proyectos={resumenRows}
      activos={active}
      entregables={clientDeliverables.length}
      porFacturar={canBilling ? billingPorFacturar.length : null}
      proxLabel={formatShortDate(nextDeliv?.dueDate ?? null)}
      overdue={overdueInfo}
      accentHex={accentHex}
      videosTotal={videosTotal}
      videosHechos={videosHechos}
      brief={<ClientBrief proyectos={briefProyectos} />}
    />
  );

  // Tarjetas y lista viven en el MISMO componente con su conmutador (la antigua pestaña
  // «Lista» se pliega aquí — una pestaña menos en la barra).
  const proyectosNode = <ClientProyectos proyectos={proyectosInfo} tintHex={accentHex} />;

  return (
    <div className={`mx-auto max-w-7xl ${MARCO.tablero}`}>
      {/* Miembros del cliente en la BARRA superior (avatares → panel editable, se recoge al
          hacer clic fuera). Sustituye ahí al grupo global del equipo mientras estás en la ficha. */}
      <ClientTopbarPeople clientId={id} members={memberItems} addable={addable} canManage={canManage} />
      {/* Cabecera-portada tipo Notion (dirección «Cine»): la identidad del cliente al frente.
          `key` por portada: al cambiarla, la pieza se re-monta y su estado local (encuadre,
          override optimista) arranca limpio con los datos frescos del servidor. */}
      <ClientHero
        key={client.bannerUrl ?? "sin-portada"}
        name={client.name}
        company={client.company}
        description={client.description}
        emoji={client.emoji}
        photoUrl={client.photoUrl}
        logoUrl={client.logoUrl}
        logoBg={client.logoBg}
        color={client.accentColor}
        bannerUrl={client.bannerUrl}
        bannerPosY={client.bannerPosY}
        isActive={client.isActive}
        stats={{ proyectos: projects.length, activos: active, cotizaciones: client._count.quotes }}
        canEdit={canEdit}
        variant="ficha"
        onSave={saveClientAppearance.bind(null, client.id)}
        onClearCover={clearClientCover.bind(null, client.id)}
      />

      {!client.isActive ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Este cliente está desactivado y oculto de las listas. Reactívalo en Ajustes cuando llegue un proyecto nuevo.
        </div>
      ) : null}

      {/* Empujón de la carpeta «casi obligatoria»: solo a quien puede crearla, y con el disco listo. */}
      {galeriaOn && galeriaEscritura && puedeCarpeta && !client.galeriaFolder ? (
        <ClientGaleriaAviso clientId={id} clientName={client.name} />
      ) : null}

      <div className="mt-6">
        <ClientViewNav
          // v2 a propósito: estrena «Resumen» como entrada por defecto para todo el equipo (quien
          // tuviera guardada otra pestaña no vería la nueva). Su elección vuelve a mandar al tocar.
          storageKey={`cliente-view-v2`}
          accentHex={accentHex}
          groups={[
            {
              label: "Producción",
              views: [
                { key: "resumen", label: "Resumen", icon: <IconInicio />, node: resumen },
                { key: "proyectos", label: "Proyectos", badge: projects.length || undefined, icon: <IconProyectos />, node: proyectosNode },
                {
                  key: "calendario", label: "Calendario", icon: <IconCalendario />,
                  // Más alto que antes (se ven más horas de la semana) + columna derecha con
                  // «Próximo», capas y próximas entregas + conmutador Cronograma.
                  node: (
                    <div className="h-[78vh] min-h-[30rem]">
                      <CalendarBoard
                        items={clientCalItems}
                        onCreate={projects.length ? createMyEvent : undefined}
                        projectId={projects[0]?.id ?? null}
                        team={calTeam.map((u) => ({ id: u.id, name: u.name, initials: u.initials, color: u.avatarColor }))}
                        asideStats
                        timelineNode={clientTimeline ? (
                          <GlobalTimeline clients={clientTimeline.clients} milestones={clientTimeline.milestones} />
                        ) : null}
                      />
                    </div>
                  ),
                },
              ],
            },
            {
              label: "Material",
              views: [
                {
                  key: "entregables",
                  label: "Entregables",
                  badge: clientDeliverables.length || undefined,
                  icon: <IconEntregas />,
                  node: <ClientDeliverables deliverables={clientDeliverables} />,
                },
                // La pestaña exige ver_archivos. El backfill (ensureVerArchivosDefaults) ya se lo
                // concedió a todo rol que ve proyectos, así que nadie la pierde al desplegar.
                ...(hasPermission(session, "ver_archivos") ? [{
                  key: "archivos",
                  label: "Archivos",
                  badge: itemsArchivos.length || undefined,
                  icon: <IconArchivo />,
                  node: (
                    <ClientFilesPanel
                      clientId={id}
                      items={itemsArchivos}
                      ahora={ahoraMs()}
                      proyectosEscribibles={escribibles.map(proyectoRef)}
                      proyectosGestionados={gestionados.map(proyectoRef)}
                      canEdit={canEdit}
                      canChunked={canEdit && session?.role !== "demo"}
                    />
                  ),
                }] : []),
                // Notas del cliente: lo que se apunta de la cuenta (no de un proyecto suelto).
                ...(hasPermission(session, "ver_notas") ? [{
                  key: "notas",
                  label: "Notas",
                  badge: clientNotes.length || undefined,
                  icon: <IconNotas />,
                  node: <NotesTab notes={clientNotes} clientId={id} canWrite={hasPermission(session, "editar_notas") && session?.role !== "demo"} />,
                }] : []),
              ],
            },
            {
              label: "Comercial",
              views: [
            // Facturación + Propuestas UNIFICADAS (aprobado por prototipo): una sola pestaña
            // con sub-conmutador — la barra baja de 11 a 9 pestañas. Sin ver_finanzas, la
            // pestaña se reduce a Propuestas (el conmutador ni aparece).
            {
              key: "comercial",
              label: "Comercial",
              badge: (canBilling ? billingPorFacturar.length : 0) || proposals.length || undefined,
              icon: <IconFacturacion />,
              node: (
                <ClientComercial
                  facturacion={canBilling ? <ClientBilling porFacturar={billingPorFacturar} invoices={billingInvoices} canCreate={canCreateInvoice} /> : null}
                  facturacionCount={billingPorFacturar.length}
                  propuestasCount={proposals.length}
                  propuestas={proposals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin propuestas vinculadas. Vincúlalas desde el editor de la propuesta (Ajustes → Cliente vinculado).</p>
                  ) : (
                    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                      {proposals.map((p) => {
                        const st = effectiveStatus({ status: p.status as ProposalStatus, expiresAt: p.expiresAt });
                        const meta = STATUS_META[st];
                        const tpl = TEMPLATE_MAP[p.templateKey];
                        return (
                          <Link key={p.id} href={`/cotizaciones/propuestas/${p.id}`} className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/50">
                            <span className="text-lg">{tpl?.icon ?? "📄"}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{p.title}</p>
                              <p className="truncate text-xs text-muted-foreground">{tpl?.name ?? p.templateKey} · {p.code}</p>
                            </div>
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tone(meta.tone).chip}`}>{meta.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                />
              ),
            },
              ],
            },
            {
              label: "Gestión",
              views: [
            ...(canActividad ? [{
              key: "actividad",
              label: "Actividad",
              icon: <IconActividad />,
              node: (
                <ActivityFeed
                  items={activity.map((a) => ({
                    id: a.id,
                    action: a.action,
                    summary: a.summary,
                    createdAt: a.createdAt.toISOString(),
                    user: a.user ? { name: a.user.name, initials: a.user.initials, color: a.user.avatarColor } : null,
                    actorName: a.actorName,
                  }))}
                />
              ),
            }] : []),
            {
              key: "acceso",
              label: "Ajustes",
              icon: <IconConfiguracion />,
              // AJUSTES: índice a la izquierda + las secciones ABIERTAS (ver client-ajustes).
              // Antes eran cuatro acordeones cerrados: aterrizabas en puros títulos y abrías de a
              // uno. Ahora se ven todas y el índice salta con scroll suave. Las secciones que
              // dependen de un permiso (editar) simplemente no entran al arreglo.
              node: (
                <AjustesLayout
                  accentHex={accentHex}
                  secciones={[
                    ...(canEdit ? [{
                      id: "aj-presentacion",
                      titulo: "Presentación",
                      desc: "Cómo se ve el cliente en listas, cabeceras y su portal: color, foto, logo y portada.",
                      node: (
                        <div className="grid items-start gap-5 lg:grid-cols-2">
                          <ClientIdentity
                            name={client.name}
                            emoji={client.emoji}
                            color={client.accentColor}
                            photoUrl={client.photoUrl}
                            logoUrl={client.logoUrl}
                            logoBg={client.logoBg}
                            onSave={saveClientAppearance.bind(null, client.id)}
                            onClearImage={clearClientImage.bind(null, client.id)}
                          />
                          <ClientCover
                            bannerUrl={client.bannerUrl}
                            onSave={saveClientAppearance.bind(null, client.id)}
                            onClearCover={clearClientCover.bind(null, client.id)}
                          />
                        </div>
                      ),
                    }] : []),
                    {
                      id: "aj-informacion",
                      titulo: "Información y material",
                      desc: "Los datos de la cuenta y su carpeta de entregas en la Galería (con el color del cliente).",
                      node: (
                        <div className="grid items-start gap-5 lg:grid-cols-2">
                          {canEdit ? (
                            <ClientEdit
                              clientId={id}
                              name={client.name}
                              emoji={client.emoji}
                              company={client.company}
                              description={client.description}
                              notes={client.notes}
                            />
                          ) : (
                            <p className="text-sm text-muted-foreground">No tienes permiso para editar este cliente.</p>
                          )}
                          {galeriaOn ? (
                            <ClientGaleria
                              clientId={id}
                              clientName={client.name}
                              color={client.accentColor}
                              folder={client.galeriaFolder}
                              folderExists={carpetaExiste}
                              puedeEscribir={puedeCarpeta}
                              escrituraLista={galeriaEscritura}
                              disponibles={carpetasRaiz}
                            />
                          ) : null}
                        </div>
                      ),
                    },
                    {
                      id: "aj-personas",
                      titulo: "Personas y acceso",
                      desc: "Quién entra por el portal del cliente y qué parte del equipo ve esta cuenta.",
                      node: (
                        <div className="grid items-start gap-5 lg:grid-cols-2">
                          {clientUsers.length > 0 || isAdmin ? (
                            <ClientUsers clientId={id} users={clientUsers} canInvite={isAdmin} />
                          ) : null}
                          <ClientMembers clientId={id} members={memberItems} addable={addable} canManage={canManage} />
                        </div>
                      ),
                    },
                    ...(canEdit ? [{
                      id: "aj-ciclo",
                      titulo: "Ciclo de vida",
                      desc: "Activo o en el Archivo, archivar proyectos sueltos y, al final, la papelera (borrado suave, siempre reversible).",
                      node: (
                        <div className="grid items-start gap-5 lg:grid-cols-2">
                          <ClientStatus clientId={id} isActive={client.isActive} canArchive={session?.role === "admin"} />
                          <ClientProjectArchive proyectos={archivables} />
                        </div>
                      ),
                    }] : []),
                  ] as AjSeccion[]}
                />
              ),
            },
              ],
            },
          ]}
        />
      </div>
    </div>
  );
}

