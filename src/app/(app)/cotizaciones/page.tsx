import Link from "next/link";
import { SectionChatCard } from "@/components/chat/section-chat-card";
import { redirect } from "next/navigation";
import { Plus, FileText, Sparkles, Eye } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { formatMoney, quoteStatusMeta, formatShortDate, quoteTotals } from "@/lib/ui";
import { composeQuoteTotals } from "@/lib/quote-compose";
import { effectiveInvoiceStatus } from "@/lib/billing";
import { Gauge, Legend, POS, WARN, NEG } from "@/components/charts";
import { tone } from "@/lib/colors";
import { effectiveStatus, STATUS_META, type ProposalStatus } from "@/lib/proposals/types";
import { TEMPLATE_MAP } from "@/lib/proposals/templates";
import { ViewTabs } from "@/app/(app)/proyectos/[id]/view-tabs";
import { ensureServiceCatalog, getServiceCatalog, getQuoteSettings } from "@/lib/services-catalog";
import { ServicesCatalog } from "./services-catalog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { EntityEmoji } from "@/components/icons/marks";

export const dynamic = "force-dynamic";

// Tarjeta del balance de facturación (resumen de cobro).
function Money({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}

export default async function CotizacionesPage() {
  const session = await getSession();
  if (!hasPermission(session, "ver_finanzas")) redirect("/");
  const canCreate = hasPermission(session, "crear_cotizaciones");

  // Las cotizaciones se filtran por los clientes a los que el usuario tiene acceso
  // (un editor/colaborador no debe ver el precio de clientes ajenos).
  const [quotes, proposals, invoices] = await Promise.all([
    db.quote.findMany({
      where: { client: accessibleClientWhere(session) },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { name: true, emoji: true } },
        items: { select: { quantity: true, unitPrice: true } },
      },
    }),
    // Las propuestas son documentos de equipo (visibles para todo el equipo).
    db.proposal.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, code: true, title: true, status: true, expiresAt: true, views: true, templateKey: true, updatedAt: true },
    }),
    // Facturas (solo lo necesario para el balance de cobro de esta ventana de Facturación).
    db.invoice.findMany({
      where: { client: accessibleClientWhere(session) },
      select: { status: true, dueDate: true, taxRate: true, currency: true, items: { select: { quantity: true, unitPrice: true } } },
    }),
  ]);

  // Catálogo interno de servicios (lista de precios) + ajustes (% e IVA). Se siembra la
  // primera vez. Es interno: no se muestra al cliente.
  await ensureServiceCatalog();
  const [catalog, qSettings] = await Promise.all([getServiceCatalog(), getQuoteSettings()]);

  // Balance de facturación (resumen de cobro), recuperado en la ventana unificada.
  const inv = invoices.map((i) => ({ status: effectiveInvoiceStatus(i.status, i.dueDate), total: quoteTotals(i.items, i.taxRate).total }));
  const sumInv = (pred: (r: (typeof inv)[number]) => boolean) => inv.filter(pred).reduce((n, r) => n + r.total, 0);
  const facturado = sumInv((r) => r.status !== "ANULADA");
  const cobrado = sumInv((r) => r.status === "PAGADA");
  const porCobrar = sumInv((r) => r.status === "ENVIADA" || r.status === "VENCIDA");
  const vencido = sumInv((r) => r.status === "VENCIDA");
  const invCurrency = invoices[0]?.currency ?? "COP";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title="Facturación"
        description={`${proposals.length} propuestas · ${quotes.length} cotizaciones`}
        actions={canCreate ? (
          <>
            <Link href="/cotizaciones/nueva" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">
              <Plus className="size-4" /> Cotización rápida
            </Link>
            <Link href="/cotizaciones/propuestas/nueva" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Sparkles className="size-4" /> Nueva propuesta
            </Link>
          </>
        ) : undefined}
      />
      <div className="-mt-2 mb-6"><SectionChatCard section="cotizaciones" /></div>

      {/* Balance de facturación: medidor de % cobrado + reparto cobrado / por cobrar / vencido. */}
      {facturado > 0 ? (
        <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
          <Gauge pct={(cobrado / facturado) * 100} label="cobrado" />
          <div className="min-w-56 flex-1 space-y-2.5">
            <div className="flex h-3.5 overflow-hidden rounded-full" style={{ background: "hsl(var(--muted))" }}>
              <div className="h-full" style={{ width: `${(cobrado / facturado) * 100}%`, background: POS }} />
              <div className="h-full" style={{ width: `${(Math.max(0, porCobrar - vencido) / facturado) * 100}%`, background: WARN }} />
              <div className="h-full" style={{ width: `${(vencido / facturado) * 100}%`, background: NEG }} />
            </div>
            <Legend items={[{ label: "Cobrado", value: formatMoney(cobrado, invCurrency), color: POS }, { label: "Por cobrar", value: formatMoney(Math.max(0, porCobrar - vencido), invCurrency), color: WARN }, { label: "Vencido", value: formatMoney(vencido, invCurrency), color: NEG }]} />
          </div>
        </div>
      ) : null}

      {/* Balance de facturación (cifras exactas) */}
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Money label="Facturado" value={formatMoney(facturado, invCurrency)} />
        <Money label="Cobrado" value={formatMoney(cobrado, invCurrency)} valueClass="text-emerald-600 dark:text-emerald-400" />
        <Money label="Por cobrar" value={formatMoney(porCobrar, invCurrency)} valueClass="text-amber-600 dark:text-amber-400" />
        <Money label="Vencido" value={formatMoney(vencido, invCurrency)} valueClass={vencido > 0 ? "text-destructive" : undefined} />
      </div>

      <div className="mt-6">
      <ViewTabs
        storageKey="cotizaciones-view"
        views={[
          { key: "propuestas", label: "Propuestas", icon: "✨", node: (
      <>
      {/* Propuestas interactivas */}
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Sparkles className="size-4" /> Propuestas con asistente
      </h2>
      {proposals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card/50 p-10 text-center">
          <Sparkles className="size-6 text-muted-foreground" />
          <p className="font-medium">Crea propuestas interactivas con el asistente</p>
          <p className="text-sm text-muted-foreground">Portada, plan, calendario de contenido e inversión, listo para enviar al cliente.</p>
          {canCreate ? (
            <Link href="/cotizaciones/propuestas/nueva" className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Sparkles className="size-4" /> Nueva propuesta
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {proposals.map((p) => {
            const st = effectiveStatus({ status: p.status as ProposalStatus, expiresAt: p.expiresAt });
            const meta = STATUS_META[st];
            const tpl = TEMPLATE_MAP[p.templateKey];
            return (
              <Link key={p.id} href={`/cotizaciones/propuestas/${p.id}`} className="flex items-center gap-4 p-4 transition-colors hover:bg-accent/50">
                <span className="text-xl">{tpl?.icon ?? "📄"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {tpl?.name ?? p.templateKey} · {p.code}
                  </p>
                </div>
                {p.views > 0 ? (
                  <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex"><Eye className="size-3.5" /> {p.views}</span>
                ) : null}
                <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${tone(meta.tone).chip}`}>{meta.label}</span>
              </Link>
            );
          })}
        </div>
      )}

      </>
          ) },
          { key: "cotizaciones", label: "Cotizaciones rápidas", icon: "📄", node: (
      <>
      {/* Cotizaciones rápidas (itemizadas) */}
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <FileText className="size-4" /> Cotizaciones rápidas
      </h2>
      {quotes.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Aún no hay cotizaciones rápidas"
          description="Una tabla simple de conceptos y precios para un cliente."
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {quotes.map((q) => {
            const meta = quoteStatusMeta(q.status);
            // Total que ve el cliente: incluye el imprevisto oculto, igual que el documento.
            const { total } = composeQuoteTotals(q.items, { taxRate: q.taxRate, contingencyPct: q.contingencyPct });
            return (
              <Link key={q.id} href={`/cotizaciones/${q.id}`} className="flex items-center gap-4 p-4 transition-colors hover:bg-accent/50">
                <span className="font-mono text-xs text-muted-foreground">{q.code}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{q.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <EntityEmoji value={q.client.emoji} /> {q.client.name}
                    {q.validUntil ? ` · vence ${formatShortDate(q.validUntil)}` : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{formatMoney(total, q.currency)}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>
              </Link>
            );
          })}
        </div>
      )}
      </>
          ) },
          { key: "servicios", label: "Servicios y valores", icon: "🧾", node: (
            <ServicesCatalog groups={catalog} settings={qSettings} canEdit={canCreate} />
          ) },
        ]}
      />
      </div>
    </div>
  );
}
