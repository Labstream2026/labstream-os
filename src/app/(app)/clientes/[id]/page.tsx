import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { canAccessClient, canManageClient } from "@/lib/client-access";
import { ClientMembers } from "./client-members";
import { ClientEdit } from "./client-edit";
import { ClientHeader } from "./client-header";
import { saveClientAppearance, clearClientImage } from "../actions";
import { ProjectCard } from "@/components/project-card";
import { Badge } from "@/components/ui/badge";
import { statusMeta, formatShortDate } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { ViewTabs } from "@/app/(app)/proyectos/[id]/view-tabs";
import { CalendarBoard } from "@/app/(app)/calendario/calendar-board";
import { eventToCalItem, taskToCalItems, projectSummaryItems } from "@/app/(app)/calendario/build-items";
import { createMyEvent } from "@/app/(app)/calendario/actions";
import { ActivityFeed } from "@/app/(app)/proyectos/[id]/activity-feed";
import { ClientDeliverables, type ClientDeliverable } from "./client-deliverables";
import { ClientStatus } from "./client-status";
import { ClientBilling, type ClientInvoiceRow } from "./client-billing";
import { billableQuoteWhere, quoteBillTotal, daysSince, effectiveInvoiceStatus } from "@/lib/billing";
import { quoteTotals } from "@/lib/ui";
import { type PorFacturarItem } from "@/app/(app)/facturacion/por-facturar";
import { tone } from "@/lib/colors";
import { effectiveStatus, STATUS_META, type ProposalStatus } from "@/lib/proposals/types";
import { TEMPLATE_MAP } from "@/lib/proposals/templates";

export const dynamic = "force-dynamic";

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
      members: { include: { user: { select: { id: true, name: true, initials: true, avatarColor: true } } } },
      projects: {
        where: { archivedAt: null },
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

  // Solo proyectos visibles para el usuario.
  const projects = client.projects.filter((p) => canAccessProject(p, session));
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

  // Actividad del cliente: cambios del propio cliente + de sus proyectos.
  const activity = await db.activityLog.findMany({
    where: { OR: [{ clientId: id }, { projectId: { in: projectIds.length ? projectIds : ["__none__"] } }] },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: { user: { select: { name: true, initials: true, avatarColor: true } } },
  });

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
  const memberItems = client.members.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    initials: m.user.initials,
    color: m.user.avatarColor,
  }));
  const team = canManage
    ? await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, initials: true, avatarColor: true } })
    : [];
  const memberIds = new Set(memberItems.map((m) => m.id));
  const addable = team
    .filter((u) => !memberIds.has(u.id))
    .map((u) => ({ id: u.id, name: u.name, initials: u.initials, color: u.avatarColor }));

  // Calendario colaborativo del cliente: citas + tareas de sus proyectos visibles.
  const calWindowStart = new Date(new Date().setMonth(new Date().getMonth() - 1));
  const safeProjectIds = projectIds.length ? projectIds : ["__none__"];
  const [clientEvents, clientTasks, calTeam] = await Promise.all([
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
        id: true, title: true, dueDate: true, shootDate: true,
        project: { select: { id: true, name: true, emoji: true } },
        assignee: { select: { name: true, initials: true, avatarColor: true } },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, initials: true, avatarColor: true } }),
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
                <td className="px-3 py-2"><Link href={`/proyectos/${p.id}`} className="font-medium hover:underline">{p.emoji} {p.name}</Link></td>
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
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <ClientHeader
        name={client.name}
        description={client.description}
        photoUrl={client.photoUrl}
        logoUrl={client.logoUrl}
        color={client.accentColor}
        projectsCount={projects.length}
        canEdit={canEdit}
        onSave={saveClientAppearance.bind(null, client.id)}
        onClearImage={clearClientImage.bind(null, client.id)}
      />

      {!client.isActive ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">Inactivo</span>
          Este cliente está desactivado y oculto de las listas. Reactívalo en Ajustes cuando llegue un proyecto nuevo.
        </div>
      ) : null}

      <div className="mt-8 grid grid-cols-3 gap-4">
        <Stat value={projects.length} label="Proyectos" />
        <Stat value={active} label="Activos" />
        <Stat value={client._count.quotes} label="Cotizaciones" />
      </div>

      <div className="mt-8">
        <ViewTabs
          storageKey={`cliente-view`}
          views={[
            { key: "proyectos", label: "Proyectos", icon: "🗂️", node: board },
            { key: "lista", label: "Lista", icon: "☰", node: list },
            {
              key: "calendario", label: "Calendario", icon: "📅",
              node: (
                <div className="h-[72vh]">
                  <CalendarBoard
                    items={clientCalItems}
                    onCreate={projects.length ? createMyEvent : undefined}
                    projectId={projects[0]?.id ?? null}
                    team={calTeam.map((u) => ({ id: u.id, name: u.name, initials: u.initials, color: u.avatarColor }))}
                  />
                </div>
              ),
            },
            {
              key: "entregables",
              label: clientDeliverables.length ? `Entregables · ${clientDeliverables.length}` : "Entregables",
              icon: "📦",
              node: <ClientDeliverables deliverables={clientDeliverables} />,
            },
            ...(canBilling ? [{
              key: "facturacion",
              label: billingPorFacturar.length ? `Facturación · ${billingPorFacturar.length}` : "Facturación",
              icon: "🧾",
              node: <ClientBilling porFacturar={billingPorFacturar} invoices={billingInvoices} canCreate={canCreateInvoice} />,
            }] : []),
            {
              key: "propuestas",
              label: "Propuestas",
              icon: "✦",
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
            ...(canActividad ? [{
              key: "actividad",
              label: "Actividad",
              icon: "📝",
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
              icon: "⚙️",
              node: (
                // Diagramación en dos columnas: la información/personalización del cliente a la
                // izquierda (columna principal) y el acceso del equipo a la derecha, SIEMPRE
                // visible sin tener que bajar. En móvil se apilan.
                <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
                  <div className="space-y-5">
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
                    {canEdit ? (
                      <ClientStatus clientId={id} isActive={client.isActive} canArchive={session?.role === "admin"} />
                    ) : null}
                  </div>
                  <div className="space-y-4 lg:sticky lg:top-4">
                    <ClientMembers clientId={id} members={memberItems} addable={addable} canManage={canManage} />
                    {/* La apariencia (foto, logo, color y portada) se edita en la cabecera de arriba. */}
                    <div className="rounded-xl border border-dashed border-border bg-card/60 p-4">
                      <p className="mb-1 text-sm font-semibold">🎨 Apariencia del cliente</p>
                      <p className="text-xs text-muted-foreground">
                        La <strong>foto</strong>, el <strong>logo</strong>, el <strong>color</strong> y la <strong>portada</strong> se editan directamente en la cabecera de arriba (pasa el cursor sobre ella).
                      </p>
                    </div>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}

function Stat({ value, label, hint }: { value: number; label: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm font-medium">{label}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
