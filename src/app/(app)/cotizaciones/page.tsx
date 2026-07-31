import Link from "next/link";
import { SectionChatCard } from "@/components/chat/section-chat-card";
import { redirect } from "next/navigation";
import { ChevronRight, Eye, Plus, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { formatMoney, quoteStatusMeta, formatShortDate, quoteTotals } from "@/lib/ui";
import { composeQuoteTotals } from "@/lib/quote-compose";
import { effectiveInvoiceStatus } from "@/lib/billing";
import { POS, WARN, NEG } from "@/components/charts";
import { tone } from "@/lib/colors";
import { effectiveStatus, STATUS_META, type ProposalStatus } from "@/lib/proposals/types";
import { TEMPLATE_MAP } from "@/lib/proposals/templates";
import { ViewTabs } from "@/app/(app)/proyectos/[id]/view-tabs";
import { ensureServiceCatalog, getServiceCatalog, getQuoteSettings } from "@/lib/services-catalog";
import { ServicesCatalog } from "./services-catalog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { IconCotizacion, IconPropuestas, IconComercial } from "@/components/icons";
import { EntityEmoji } from "@/components/icons/marks";

export const dynamic = "force-dynamic";

// ── Cotizaciones, con el idioma del centro Finanzas ───────────────────────────
// Rediseño aprobado por mock: el medidor gigante se vuelve UNA franja compacta, las
// sub-pestañas ganan contador, las filas son fichas (identidad del cliente, estado de
// color, valor a la derecha) y lo dormido (vencidas, no aprobadas) se pliega al final.
// Los flujos no cambian: mismos botones, mismas URLs, mismo portal público.

// Identidad de color estable por cliente (mismo truco del panel lateral): su nombre
// siempre pinta el mismo tono, aunque no tenga nada configurado.
const HEX_CLIENTE = ["#6366f1", "#f43f5e", "#f59e0b", "#10b981", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#3b82f6"];

function hexDe(nombre: string): string {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) | 0;
  return HEX_CLIENTE[Math.abs(h) % HEX_CLIENTE.length];
}

function inicialesDe(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function AvatarCliente({ nombre, emoji }: { nombre: string; emoji: string | null }) {
  if (emoji) {
    return (
      <span className="grid size-7 shrink-0 place-items-center rounded-lg text-sm" style={{ background: `${hexDe(nombre)}22` }}>
        <EntityEmoji value={emoji} />
      </span>
    );
  }
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white" style={{ background: hexDe(nombre) }}>
      {inicialesDe(nombre)}
    </span>
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
      select: { id: true, code: true, title: true, status: true, expiresAt: true, views: true, templateKey: true, updatedAt: true, acceptedByName: true },
    }),
    // Facturas (solo lo necesario para la franja de balance de esta ventana).
    db.invoice.findMany({
      where: { client: accessibleClientWhere(session) },
      select: { status: true, dueDate: true, taxRate: true, currency: true, items: { select: { quantity: true, unitPrice: true } } },
    }),
  ]);

  // Catálogo interno de servicios (lista de precios) + ajustes (% e IVA). Se siembra la
  // primera vez. Es interno: no se muestra al cliente.
  await ensureServiceCatalog();
  const [catalog, qSettings] = await Promise.all([getServiceCatalog(), getQuoteSettings()]);

  // Balance de cobro: una franja, no media pantalla. Las cifras exactas van en el title
  // de cada tramo y en la línea compacta de la derecha.
  const inv = invoices.map((i) => ({ status: effectiveInvoiceStatus(i.status, i.dueDate), total: quoteTotals(i.items, i.taxRate).total }));
  const sumInv = (pred: (r: (typeof inv)[number]) => boolean) => inv.filter(pred).reduce((n, r) => n + r.total, 0);
  const facturado = sumInv((r) => r.status !== "ANULADA");
  const cobrado = sumInv((r) => r.status === "PAGADA");
  const porCobrar = sumInv((r) => r.status === "ENVIADA" || r.status === "VENCIDA");
  const vencido = sumInv((r) => r.status === "VENCIDA");
  const invCurrency = invoices[0]?.currency ?? "COP";
  const pctCobrado = facturado > 0 ? Math.round((cobrado / facturado) * 100) : 0;

  // Propuestas: las vivas a la vista, las dormidas (vencidas / no aprobadas) plegadas.
  const conEstado = proposals.map((p) => ({ ...p, st: effectiveStatus({ status: p.status as ProposalStatus, expiresAt: p.expiresAt }) }));
  const propuestasVivas = conEstado.filter((p) => p.st !== "VENCIDA" && p.st !== "RECHAZADA");
  const propuestasDormidas = conEstado.filter((p) => p.st === "VENCIDA" || p.st === "RECHAZADA");

  // Cotizaciones rápidas: mismo reparto.
  const DORMIDAS_Q = new Set(["RECHAZADA", "VENCIDA", "ANULADA"]);
  const quotesVivas = quotes.filter((q) => !DORMIDAS_Q.has(q.status));
  const quotesDormidas = quotes.filter((q) => DORMIDAS_Q.has(q.status));

  const filaPropuesta = (p: (typeof conEstado)[number]) => {
    const meta = STATUS_META[p.st];
    const tpl = TEMPLATE_MAP[p.templateKey];
    return (
      <Link key={p.id} href={`/cotizaciones/propuestas/${p.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-base">{tpl?.icon ?? "📄"}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{p.title}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {tpl?.name ?? p.templateKey} · {p.code}
            {p.st === "ACEPTADA" && p.acceptedByName ? ` · aceptada por ${p.acceptedByName}` : ""}
          </span>
        </span>
        {p.views > 0 ? (
          <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
            <Eye className="size-3.5" /> {p.views}
          </span>
        ) : null}
        <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">{formatShortDate(p.updatedAt)}</span>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tone(meta.tone).chip}`}>{meta.label}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
      </Link>
    );
  };

  const filaQuote = (q: (typeof quotes)[number]) => {
    const meta = quoteStatusMeta(q.status);
    // Total que ve el cliente: incluye el imprevisto oculto, igual que el documento.
    const { total } = composeQuoteTotals(q.items, { taxRate: q.taxRate, contingencyPct: q.contingencyPct });
    return (
      <Link key={q.id} href={`/cotizaciones/${q.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50">
        <AvatarCliente nombre={q.client.name} emoji={q.client.emoji} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{q.title}</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {q.client.name} · <span className="font-mono">{q.code}</span>
            {q.validUntil ? ` · vence ${formatShortDate(q.validUntil)}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(total, q.currency)}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${meta.className}`}>{meta.label}</span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        icon={<IconCotizacion />}
        title="Cotizaciones"
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
      {/* Conmutador con el centro Finanzas: la píldora gemela de la de /facturacion. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Link
          href="/facturacion"
          className="rounded-full border border-dashed border-border px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          title="Cambiar al centro Finanzas"
        >
          Finanzas ⇄
        </Link>
        <span className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground shadow-sm">Cotizaciones</span>
      </div>
      <div className="-mt-2 mb-4"><SectionChatCard section="cotizaciones" /></div>

      {/* El balance de cobro en UNA franja: barra segmentada + % + cifras compactas.
          (El medidor y las cuatro tarjetas de antes contaban esto mismo en media pantalla;
          las cifras completas viven en el title de cada tramo y en el centro Finanzas.) */}
      {facturado > 0 ? (
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-4 py-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Balance</span>
          <div className="flex h-2.5 min-w-44 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full" style={{ width: `${(cobrado / facturado) * 100}%`, background: POS }} title={`Cobrado: ${formatMoney(cobrado, invCurrency)}`} />
            <div className="h-full" style={{ width: `${(Math.max(0, porCobrar - vencido) / facturado) * 100}%`, background: WARN }} title={`Por cobrar: ${formatMoney(Math.max(0, porCobrar - vencido), invCurrency)}`} />
            <div className="h-full" style={{ width: `${(vencido / facturado) * 100}%`, background: NEG }} title={`Vencido: ${formatMoney(vencido, invCurrency)}`} />
          </div>
          <span className="text-xs text-muted-foreground">
            <b className="font-semibold text-foreground">{pctCobrado} %</b> cobrado
          </span>
          <span className="hidden text-[11px] tabular-nums text-muted-foreground md:block">
            {formatMoney(cobrado, invCurrency)} · {formatMoney(Math.max(0, porCobrar - vencido), invCurrency)} ·{" "}
            <span className={vencido > 0 ? "font-medium text-destructive" : undefined}>{formatMoney(vencido, invCurrency)}</span>
          </span>
        </div>
      ) : null}

      <ViewTabs
        storageKey="cotizaciones-view"
        views={[
          { key: "propuestas", label: `Propuestas · ${proposals.length}`, icon: <IconPropuestas />, node: (
      <>
      {propuestasVivas.length === 0 && propuestasDormidas.length === 0 ? (
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
        <>
          {propuestasVivas.length === 0 ? (
            <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              Nada en juego ahora mismo: lo viejo está plegado abajo.
            </p>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              {propuestasVivas.map(filaPropuesta)}
            </div>
          )}
          {propuestasDormidas.length > 0 ? (
            <details className="group/dorm mt-2">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3.5 transition-transform group-open/dorm:rotate-90" />
                Vencidas y no aprobadas · {propuestasDormidas.length}
              </summary>
              <div className="mt-1 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card opacity-75">
                {propuestasDormidas.map(filaPropuesta)}
              </div>
            </details>
          ) : null}
        </>
      )}
      </>
          ) },
          { key: "cotizaciones", label: `Cotizaciones rápidas · ${quotes.length}`, icon: <IconCotizacion />, node: (
      <>
      {quotesVivas.length === 0 && quotesDormidas.length === 0 ? (
        <EmptyState
          icon={<IconCotizacion />}
          title="Aún no hay cotizaciones rápidas"
          description="Una tabla simple de conceptos y precios para un cliente."
        />
      ) : (
        <>
          {quotesVivas.length === 0 ? (
            <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              Nada en juego ahora mismo: lo viejo está plegado abajo.
            </p>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              {quotesVivas.map(filaQuote)}
            </div>
          )}
          {quotesDormidas.length > 0 ? (
            <details className="group/dormq mt-2">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3.5 transition-transform group-open/dormq:rotate-90" />
                Rechazadas, vencidas y anuladas · {quotesDormidas.length}
              </summary>
              <div className="mt-1 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card opacity-75">
                {quotesDormidas.map(filaQuote)}
              </div>
            </details>
          ) : null}
        </>
      )}
      </>
          ) },
          { key: "servicios", label: "Servicios y valores", icon: <IconComercial />, node: (
            <ServicesCatalog groups={catalog} settings={qSettings} canEdit={canCreate} />
          ) },
        ]}
      />
    </div>
  );
}
