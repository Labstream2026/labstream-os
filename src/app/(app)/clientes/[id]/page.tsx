import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canAccessProject, canWriteProject, canManageProject, accessibleProjectWhere } from "@/lib/project-access";
import { isEditableOffice } from "@/lib/onlyoffice";
import { ahoraMs, type ArchivoItem } from "@/lib/archivos/tipos";
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
import { saveClientAppearance, clearClientImage, clearClientCover } from "../actions";
import { ProjectCard } from "@/components/project-card";
import { Badge } from "@/components/ui/badge";
import { statusMeta, formatShortDate } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { CalendarBoard } from "@/app/(app)/calendario/calendar-board";
import { eventToCalItem, taskToCalItems, projectSummaryItems } from "@/app/(app)/calendario/build-items";
import { createMyEvent } from "@/app/(app)/calendario/actions";
import { ActivityFeed } from "@/app/(app)/proyectos/[id]/activity-feed";
import { ClientDeliverables, type ClientDeliverable } from "./client-deliverables";
import { ClientStatus } from "./client-status";
import { ClientBilling, type ClientInvoiceRow } from "./client-billing";
import { ClientFilesPanel } from "./client-files";
import { EntityEmoji } from "@/components/icons/marks";
import { billableQuoteWhere, quoteBillTotal, daysSince, effectiveInvoiceStatus } from "@/lib/billing";
import { quoteTotals } from "@/lib/ui";
import { type PorFacturarItem } from "@/app/(app)/facturacion/por-facturar";
import { tone } from "@/lib/colors";
import { effectiveStatus, STATUS_META, type ProposalStatus } from "@/lib/proposals/types";
import { TEMPLATE_MAP } from "@/lib/proposals/templates";
import { IconProyectos, IconLista, IconCalendario, IconEntregas, IconArchivo, IconFacturacion, IconPropuestas, IconActividad, IconConfiguracion, IconNotas } from "@/components/icons";
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
          lead: { select: { initials: true, avatarColor: true } },
          members: { select: { userId: true, role: true } },
          deliverables: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
              dueDate: true,
              versions: { orderBy: { number: "desc" }, take: 1, select: { number: true } },
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

  // Entregables de TODOS los proyectos visibles del cliente, aplanados con su proyecto
  // de origen, para la pestaña «Entregables» (vista agregada por cliente, agrupada por estado).
  const clientDeliverables: ClientDeliverable[] = projects.flatMap((p) =>
    p.deliverables.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      status: d.status,
      dueDate: d.dueDate,
      versionNumber: d.versions[0]?.number ?? null,
      project: { id: p.id, name: p.name, emoji: p.emoji },
    })),
  );

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
  const clientePara = { members: client.members };
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
  // Notas de la cuenta (las que se apuntaron del cliente, no de un proyecto suelto).
  const clientNotes = session && hasPermission(session, "ver_notas") ? await notesFor(session, { clientId: id }) : [];

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
        id: true, title: true, dueDate: true, dueTime: true, shootDate: true,
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

  const board = projects.length === 0 ? (
    <p className="text-sm text-muted-foreground">Este cliente aún no tiene proyectos.</p>
  ) : (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={{ id: p.id, name: p.name, emoji: p.emoji, status: p.status, progress: p.progress, dueDate: p.dueDate, lead: p.lead ? { initials: p.lead.initials, color: p.lead.avatarColor } : null }}
          tintColor={client.accentColor}
        />
      ))}
    </div>
  );

  const list = (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Proyecto</th>
            <th className="px-3 py-2 font-medium">Estado</th>
            <th className="px-3 py-2 font-medium">Progreso</th>
            <th className="px-3 py-2 font-medium">Entrega</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const st = statusMeta(p.status);
            return (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-3 py-2"><Link href={`/proyectos/${p.id}`} className="font-medium hover:underline"><EntityEmoji value={p.emoji} /> {p.name}</Link></td>
                <td className="px-3 py-2"><Badge className={cn("text-[10px]", st.className)}>{st.label}</Badge></td>
                <td className="px-3 py-2"><span className="text-xs text-muted-foreground">{p.progress}%</span></td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{formatShortDate(p.dueDate) ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-7">
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
          storageKey={`cliente-view`}
          groups={[
            {
              label: "Producción",
              views: [
                { key: "proyectos", label: "Proyectos", icon: <IconProyectos />, node: board },
                { key: "lista", label: "Lista", icon: <IconLista />, node: list },
                {
                  key: "calendario", label: "Calendario", icon: <IconCalendario />,
                  node: (
                    <div className="h-[72vh] min-h-[26rem]">
                      <CalendarBoard
                        items={clientCalItems}
                        onCreate={projects.length ? createMyEvent : undefined}
                        projectId={projects[0]?.id ?? null}
                        team={calTeam.map((u) => ({ id: u.id, name: u.name, initials: u.initials, color: u.avatarColor }))}
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
            ...(canBilling ? [{
              key: "facturacion",
              label: "Facturación",
              badge: billingPorFacturar.length || undefined,
              icon: <IconFacturacion />,
              node: <ClientBilling porFacturar={billingPorFacturar} invoices={billingInvoices} canCreate={canCreateInvoice} />,
            }] : []),
            {
              key: "propuestas",
              label: "Propuestas",
              badge: proposals.length || undefined,
              icon: <IconPropuestas />,
              node: proposals.length === 0 ? (
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
              node: (
                // AJUSTES POR SECCIONES, ahora PLEGADAS: cuatro bloques —Presentación ·
                // Información y material · Personas y acceso · Ciclo de vida— que se abren de
                // uno en uno. Cada bloque agrupa lo que se toca junto; la zona de peligro CIERRA
                // la página (nadie la pisa por accidente buscando otra cosa).
                //
                // Las píldoras de salto que había arriba se retiran: ahora los cuatro títulos
                // caben en pantalla y SON la navegación, así que repetirlos era ruido —y encima
                // saltar a una sección cerrada no habría enseñado nada.
                <div className="space-y-3">
                  {canEdit ? (
                    <AjustesSeccion
                      id="aj-presentacion"
                      titulo="Presentación"
                      desc="Cómo se ve el cliente en listas, cabeceras y su portal: color, foto, logo y portada."
                    >
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
                    </AjustesSeccion>
                  ) : null}

                  <AjustesSeccion
                    id="aj-informacion"
                    titulo="Información y material"
                    desc="Los datos de la cuenta y su carpeta de entregas en la Galería (con el color del cliente)."
                  >
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
                  </AjustesSeccion>

                  <AjustesSeccion
                    id="aj-personas"
                    titulo="Personas y acceso"
                    desc="Quién entra por el portal del cliente y qué parte del equipo ve esta cuenta."
                  >
                    <div className="grid items-start gap-5 lg:grid-cols-2">
                      {clientUsers.length > 0 || isAdmin ? (
                        <ClientUsers clientId={id} users={clientUsers} canInvite={isAdmin} />
                      ) : null}
                      <ClientMembers clientId={id} members={memberItems} addable={addable} canManage={canManage} />
                    </div>
                  </AjustesSeccion>

                  {canEdit ? (
                    <AjustesSeccion
                      id="aj-ciclo"
                      titulo="Ciclo de vida"
                      desc="Activo o en el Archivo; al final, la papelera (borrado suave, siempre reversible)."
                    >
                      <div className="grid items-start gap-5 lg:grid-cols-2">
                        <ClientStatus clientId={id} isActive={client.isActive} canArchive={session?.role === "admin"} />
                      </div>
                    </AjustesSeccion>
                  ) : null}
                </div>
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

// Bloque titulado de la pestaña Ajustes: ancla (para las píldoras de salto), título y
// descripción cortos, y dentro la rejilla que cada sección decida. scroll-mt deja aire
// para la barra superior cuando se llega por ancla.
// Cada bloque de Ajustes se PLIEGA. Antes eran cuatro secciones encadenadas y abiertas: para
// cambiar el color del cliente había que pasar por delante de sus datos, de su gente y de la
// zona de peligro. Ahora se ven cuatro títulos y se abre el que toca. Es un <details> nativo
// —sin `data-autoclose`, que eso es para los menús: un acordeón no se cierra al clicar fuera—,
// así que funciona sin una línea de JavaScript.
function AjustesSeccion({ id, titulo, desc, children }: { id: string; titulo: string; desc: string; children: ReactNode }) {
  return (
    <details id={id} className="group scroll-mt-24 rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-start gap-3 rounded-xl p-4 hover:bg-muted/40">
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold tracking-tight">{titulo}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{desc}</span>
        </span>
        <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}
