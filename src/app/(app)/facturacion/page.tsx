import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { invoiceStatusMeta, quoteTotals, formatMoney, formatShortDate } from "@/lib/ui";
import { billableQuoteWhere, quoteBillTotal, daysSince, effectiveInvoiceStatus } from "@/lib/billing";
import { IconFacturacion } from "@/components/icons";
import { EntityEmoji, emojiToText } from "@/components/icons/marks";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { siigoEnabled, datosSiigo } from "@/lib/siigo";
import { PanelSiigo, BarraSiigo, FalloSiigo } from "./siigo-panel";
import { PanelResumen } from "./resumen-panel";
import { PanelGastos, type GastoFila } from "./gastos-panel";
import { PorFacturarList, type PorFacturarItem } from "./por-facturar";

export const dynamic = "force-dynamic";

// ── El centro Finanzas ────────────────────────────────────────────────────────
// Con Siigo conectado, /facturacion es el tablero financiero completo: Resumen (cifras y
// gráficos), Facturas y Movimientos (Siigo, solo lectura), Gastos (registro propio +
// compras contables) y Por facturar (la cola interna de siempre) — con Cotizaciones a un
// clic. Sin credenciales de Siigo, la página interna clásica, sin ruido nuevo.

const MES_LARGO = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", month: "long", year: "numeric" });

function mesActualBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit" }).format(new Date()); // YYYY-MM
}

function mesVecino(m: string, delta: number): string {
  let anio = Number(m.slice(0, 4));
  let mes = Number(m.slice(5, 7)) + delta;
  while (mes < 1) { mes += 12; anio--; }
  while (mes > 12) { mes -= 12; anio++; }
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

// Rango [desde, hasta) del mes en UTC. Los gastos se guardan anclados a mediodía UTC del
// día elegido, así que los bordes de mes en UTC coinciden con el mes de calendario.
function rangoMes(m: string): { desde: Date; hasta: Date } {
  return { desde: new Date(`${m}-01T00:00:00Z`), hasta: new Date(`${mesVecino(m, 1)}-01T00:00:00Z`) };
}

type Tab = "resumen" | "facturas" | "movs" | "gastos" | "interno";

export default async function FacturacionPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; f?: string; c?: string; mes?: string }>;
}) {
  const session = await getSession();
  // Los valores y resúmenes de cobro son sensibles: requieren el permiso de finanzas.
  if (!hasPermission(session, "ver_finanzas")) redirect("/");
  const canCreate = hasPermission(session, "crear_cotizaciones");

  const { t, f, c, mes: mesParam } = await searchParams;
  const siigoOn = siigoEnabled();
  // «siigo» queda como alias de «facturas» (enlaces viejos y avisos ya repartidos).
  const pestana: Tab = !siigoOn
    ? "interno"
    : t === "interno"
      ? "interno"
      : t === "movs"
        ? "movs"
        : t === "facturas" || t === "siigo"
          ? "facturas"
          : t === "gastos"
            ? "gastos"
            : "resumen";
  const filtro: "saldo" | "todas" = f === "todas" ? "todas" : "saldo";
  const filtroCliente = typeof c === "string" && c.trim() ? c.trim().slice(0, 80) : null;

  const mesActual = mesActualBogota();
  const mesSel = typeof mesParam === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesParam) && mesParam <= mesActual ? mesParam : mesActual;
  const rangoSel = rangoMes(mesSel);

  const [invoices, billableQuotes, siigo, org, gastosSel] = await Promise.all([
    db.invoice.findMany({
      where: { client: accessibleClientWhere(session) },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { name: true, emoji: true } },
        project: { select: { name: true, emoji: true } },
        items: { select: { quantity: true, unitPrice: true } },
      },
    }),
    // Cotizaciones aprobadas que ya toca facturar (proyecto terminado o sin proyecto) y
    // que aún no tienen factura: el caso "terminé el proyecto y falta emitir".
    db.quote.findMany({
      where: { client: accessibleClientWhere(session), ...billableQuoteWhere() },
      orderBy: { approvedAt: "asc" },
      include: {
        client: { select: { name: true, emoji: true } },
        project: { select: { name: true, emoji: true } },
        items: { select: { quantity: true, unitPrice: true } },
      },
    }),
    // La lectura de Siigo va en paralelo con la base: con caché caliente no cuesta nada.
    siigoOn ? datosSiigo() : Promise.resolve(null),
    siigoOn ? db.orgSettings.findUnique({ where: { id: "default" }, select: { metaFacturacion: true } }).catch(() => null) : Promise.resolve(null),
    // Gastos del mes que se está mirando en la pestaña Gastos (mundo de la APP, sin Siigo).
    siigoOn
      ? db.gasto.findMany({
          where: { fecha: { gte: rangoSel.desde, lt: rangoSel.hasta } },
          orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
          include: { creadoPor: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const rows = invoices.map((inv) => ({
    id: inv.id,
    code: inv.code,
    client: inv.client,
    rawStatus: inv.status,
    status: effectiveInvoiceStatus(inv.status, inv.dueDate),
    currency: inv.currency,
    taxRate: inv.taxRate,
    items: inv.items,
    project: inv.project,
    total: quoteTotals(inv.items, inv.taxRate).total,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
  }));

  // ── Cola "Por facturar": borradores sin emitir + cotizaciones aprobadas sin factura ──
  const drafts: PorFacturarItem[] = rows
    .filter((r) => r.rawStatus === "BORRADOR")
    .map((r) => ({
      key: `inv-${r.id}`,
      clientName: r.client.name,
      clientEmoji: r.client.emoji,
      context: r.project?.name ? `${r.code} · ${r.project.name}` : r.code,
      note: "Borrador creado, falta emitir",
      amount: r.total,
      currency: r.currency,
      emit: { type: "open", href: `/facturacion/${r.id}` },
    }));

  const fromQuotes: PorFacturarItem[] = billableQuotes.map((q) => {
    const d = daysSince(q.approvedAt);
    return {
      key: `q-${q.id}`,
      clientName: q.client.name,
      clientEmoji: q.client.emoji,
      context: q.project ? `${emojiToText(q.project.emoji, "🎬")} ${q.project.name}` : q.title,
      note: q.project
        ? `Proyecto terminado · sin factura${d != null ? ` · aprobada hace ${d} d` : ""}`
        : `Sin proyecto · cobro directo${d != null ? ` · aprobada hace ${d} d` : ""}`,
      urgent: d != null && d >= 15,
      amount: quoteBillTotal(q),
      currency: q.currency,
      emit: { type: "quote", quoteId: q.id },
    };
  });

  const porFacturar = [...fromQuotes, ...drafts];
  const porFacturarTotal = porFacturar.reduce((n, it) => n + it.amount, 0);

  // Facturas ya emitidas (todo lo que no es borrador): tabla de seguimiento de cobro.
  const emitted = rows.filter((r) => r.rawStatus !== "BORRADOR");
  const sum = (pred: (r: (typeof emitted)[number]) => boolean) => emitted.filter(pred).reduce((n, r) => n + r.total, 0);
  const porCobrar = sum((r) => r.status === "ENVIADA" || r.status === "VENCIDA");
  const vencido = sum((r) => r.status === "VENCIDA");
  const cobrado = sum((r) => r.status === "PAGADA");
  const currency = rows[0]?.currency ?? "COP";

  // ── Piezas para las pestañas nuevas ──
  const gastosFilas: GastoFila[] = gastosSel.map((g) => ({
    id: g.id,
    fecha: g.fecha.toISOString().slice(0, 10),
    concepto: g.concepto,
    categoria: g.categoria,
    monto: g.monto,
    nota: g.nota,
    creadoPor: g.creadoPor.name,
  }));
  const mesLabel = MES_LARGO.format(new Date(`${mesSel}-15T12:00:00Z`));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        icon={<IconFacturacion />}
        title="Facturación"
        description={siigoOn ? "El centro financiero: Siigo en solo lectura, tus gastos y tu cola interna." : "Cotizaciones y facturas de tus clientes."}
        actions={siigoOn ? undefined : <Link href="/cotizaciones" className="text-sm font-medium text-primary hover:underline">Ver cotizaciones →</Link>}
      />

      {/* Las píldoras, en DOS mundos rotulados y separados (pedido del usuario): lo contable
          de Siigo (solo lectura) y lo propio de la app — que ni se leen ni se mezclan. La de
          Cotizaciones es el conmutador dinámico hacia la otra página. */}
      {siigoOn ? (
        <div className="mb-5 flex flex-wrap items-center gap-x-1.5 gap-y-2">
          <span className="mr-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Siigo</span>
          <Pestana href="/facturacion" activa={pestana === "resumen"}>Resumen</Pestana>
          <Pestana href="/facturacion?t=facturas" activa={pestana === "facturas"}>Facturas</Pestana>
          <Pestana href="/facturacion?t=movs" activa={pestana === "movs"}>Movimientos</Pestana>
          <span className="mx-2 h-5 w-px bg-border" aria-hidden />
          <span className="mr-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">La app</span>
          <Pestana href="/facturacion?t=gastos" activa={pestana === "gastos"}>Gastos</Pestana>
          <Pestana href="/facturacion?t=interno" activa={pestana === "interno"}>Por facturar{porFacturar.length > 0 ? ` · ${porFacturar.length}` : ""}</Pestana>
          <Link
            href="/cotizaciones"
            className="rounded-full border border-dashed border-border px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            title="Cambiar a Cotizaciones (allá hay una píldora de vuelta)"
          >
            Cotizaciones ⇄
          </Link>
        </div>
      ) : null}

      {siigoOn && pestana === "resumen" && siigo ? (
        siigo.ok ? (
          <>
            <BarraSiigo min={siigo.minDesdeLectura} aviso={siigo.aviso} />
            <PanelResumen datos={siigo.datos} meta={org?.metaFacturacion ?? null} />
          </>
        ) : (
          <FalloSiigo error={siigo.error} />
        )
      ) : null}

      {siigoOn && (pestana === "facturas" || pestana === "movs") && siigo ? (
        <PanelSiigo
          resultado={siigo}
          vista={pestana === "movs" ? "movs" : "facturas"}
          filtro={filtro}
          filtroCliente={filtroCliente}
          minDesdeLectura={siigo.ok ? siigo.minDesdeLectura : 0}
        />
      ) : null}

      {siigoOn && pestana === "gastos" ? (
        <PanelGastos
          gastos={gastosFilas}
          mesLabel={mesLabel}
          hrefMesAnterior={`/facturacion?t=gastos&mes=${mesVecino(mesSel, -1)}`}
          hrefMesSiguiente={mesSel === mesActual ? null : `/facturacion?t=gastos&mes=${mesVecino(mesSel, 1)}`}
          esMesActual={mesSel === mesActual}
        />
      ) : null}

      {pestana === "interno" ? (
        <>
      {/* Resumen: primero lo accionable (por facturar / por cobrar / vencido), luego lo cobrado */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Money label="Por facturar" value={formatMoney(porFacturarTotal, currency)} tone="text-sky-600 dark:text-sky-400" hint={`${porFacturar.length} pendiente${porFacturar.length === 1 ? "" : "s"}`} />
        <Money label="Por cobrar" value={formatMoney(porCobrar, currency)} tone="text-amber-600 dark:text-amber-400" />
        <Money label="Vencido" value={formatMoney(vencido, currency)} tone={vencido > 0 ? "text-destructive" : undefined} />
        <Money label="Cobrado" value={formatMoney(cobrado, currency)} tone="text-emerald-600 dark:text-emerald-400" />
      </div>

      {/* Cola "Por facturar" */}
      {porFacturar.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-sky-700 dark:text-sky-300">
            Por facturar <span className="font-normal text-muted-foreground">— falta emitir la factura ({porFacturar.length})</span>
          </h2>
          <PorFacturarList items={porFacturar} canCreate={canCreate} />
        </section>
      ) : null}

      {/* Tabla de facturas emitidas */}
      <h2 className="mt-8 mb-2 text-sm font-semibold">Facturas emitidas</h2>
      {emitted.length === 0 ? (
        <EmptyState
          icon={<IconFacturacion />}
          title="Aún no hay facturas emitidas"
          description={canCreate ? "Emítela desde la cola «Por facturar» o desde una cotización aprobada." : "Cuando el equipo emita una factura, aparecerá aquí."}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[420px] text-sm sm:min-w-[680px]">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Factura</th>
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Emitida</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Vence</th>
              </tr>
            </thead>
            <tbody>
              {emitted.map((r) => {
                const meta = invoiceStatusMeta(r.status);
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <Link href={`/facturacion/${r.id}`} className="font-mono text-xs font-medium hover:underline">{r.code}</Link>
                    </td>
                    <td className="px-4 py-2.5"><EntityEmoji value={r.client.emoji} /> {r.client.name}</td>
                    <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}>{meta.label}</span></td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatMoney(r.total, r.currency)}</td>
                    <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">{formatShortDate(r.issueDate)}</td>
                    <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">{formatShortDate(r.dueDate) ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
        </>
      ) : null}
    </div>
  );
}

function Pestana({ href, activa, children }: { href: string; activa: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
        activa ? "bg-primary text-primary-foreground shadow-sm" : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function Money({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone ?? ""}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
