import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { invoiceStatusMeta, quoteTotals, formatMoney, formatShortDate } from "@/lib/ui";

export const dynamic = "force-dynamic";

// Estado efectivo: una factura ENVIADA cuyo vencimiento ya pasó se considera VENCIDA
// (sin necesidad de un cron).
function effectiveStatus(status: string, dueDate: Date | null): string {
  if (status === "ENVIADA" && dueDate && new Date(dueDate) < new Date()) return "VENCIDA";
  return status;
}

export default async function FacturacionPage() {
  const session = await getSession();
  if (!hasPermission(session, "ver_cotizaciones")) redirect("/");
  const canCreate = hasPermission(session, "crear_cotizaciones");

  const invoices = await db.invoice.findMany({
    where: { client: accessibleClientWhere(session) },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { name: true, emoji: true } },
      items: { select: { quantity: true, unitPrice: true } },
    },
  });

  const rows = invoices.map((inv) => ({
    id: inv.id,
    code: inv.code,
    client: inv.client,
    status: effectiveStatus(inv.status, inv.dueDate),
    currency: inv.currency,
    total: quoteTotals(inv.items, inv.taxRate).total,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
  }));

  const sum = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).reduce((n, r) => n + r.total, 0);
  const facturado = sum((r) => r.status !== "ANULADA");
  const cobrado = sum((r) => r.status === "PAGADA");
  const porCobrar = sum((r) => r.status === "ENVIADA" || r.status === "VENCIDA");
  const vencido = sum((r) => r.status === "VENCIDA");
  const currency = rows[0]?.currency ?? "COP";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Facturación</h1>
          <p className="mt-1 text-sm text-muted-foreground">Facturas generadas desde cotizaciones y su estado de cobro.</p>
        </div>
        <Link href="/cotizaciones" className="text-sm font-medium text-primary hover:underline">Ver cotizaciones →</Link>
      </div>

      {/* Resumen de cobro */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Money label="Facturado" value={formatMoney(facturado, currency)} />
        <Money label="Cobrado" value={formatMoney(cobrado, currency)} tone="text-emerald-600 dark:text-emerald-400" />
        <Money label="Por cobrar" value={formatMoney(porCobrar, currency)} tone="text-amber-600 dark:text-amber-400" />
        <Money label="Vencido" value={formatMoney(vencido, currency)} tone={vencido > 0 ? "text-destructive" : undefined} />
      </div>

      {/* Tabla */}
      {rows.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center text-sm text-muted-foreground">
          Aún no hay facturas. {canCreate ? "Genera una desde una cotización aprobada." : ""}
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
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
              {rows.map((r) => {
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

function Money({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
