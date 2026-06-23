import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { invoiceStatusMeta, quoteTotals, formatMoney, formatShortDate } from "@/lib/ui";
import { billableQuoteWhere, quoteBillTotal, daysSince, effectiveInvoiceStatus } from "@/lib/billing";
import { PorFacturarList, type PorFacturarItem } from "./por-facturar";

export const dynamic = "force-dynamic";

export default async function FacturacionPage() {
  const session = await getSession();
  // Los valores y resúmenes de cobro son sensibles: requieren el permiso de finanzas.
  if (!hasPermission(session, "ver_finanzas")) redirect("/");
  const canCreate = hasPermission(session, "crear_cotizaciones");

  const [invoices, billableQuotes] = await Promise.all([
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
      context: q.project ? `${q.project.emoji ?? "🎬"} ${q.project.name}` : q.title,
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
          <p className="mt-1 text-sm text-muted-foreground">Lo que falta facturar, lo que está por cobrar y el estado de cada factura.</p>
        </div>
        <Link href="/cotizaciones" className="text-sm font-medium text-primary hover:underline">Ver cotizaciones →</Link>
      </div>

      {/* Resumen: primero lo accionable (por facturar / por cobrar / vencido), luego lo cobrado */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground">
          Aún no hay facturas emitidas. {canCreate ? "Emite una desde la cola «Por facturar» o desde una cotización aprobada." : ""}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Factura</th>
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                <th className="px-4 py-2.5 font-medium">Emitida</th>
                <th className="px-4 py-2.5 font-medium">Vence</th>
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
                    <td className="px-4 py-2.5">{r.client.emoji} {r.client.name}</td>
                    <td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}>{meta.label}</span></td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatMoney(r.total, r.currency)}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatShortDate(r.issueDate)}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatShortDate(r.dueDate) ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Money({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone ?? ""}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
