import Link from "next/link";
import { formatMoney, invoiceStatusMeta } from "@/lib/ui";
import { PorFacturarList, type PorFacturarItem } from "@/app/(app)/facturacion/por-facturar";

export type ClientInvoiceRow = {
  id: string;
  code: string;
  status: string; // estado efectivo
  total: number;
  currency: string;
  projectName: string | null;
};

// Facturación de UN cliente: lo que falta facturar + sus facturas emitidas, con KPIs.
// Vive pegada al cliente, así que aparece aunque no tenga proyectos activos.
export function ClientBilling({
  porFacturar,
  invoices,
  canCreate,
}: {
  porFacturar: PorFacturarItem[];
  invoices: ClientInvoiceRow[];
  canCreate: boolean;
}) {
  if (porFacturar.length === 0 && invoices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <p className="text-3xl">🧾</p>
        <p className="mt-2 text-sm font-medium">Este cliente aún no tiene facturación</p>
        <p className="text-sm text-muted-foreground">Las facturas se generan desde una cotización aprobada.</p>
      </div>
    );
  }

  const porFacturarTotal = porFacturar.reduce((n, it) => n + it.amount, 0);
  const sum = (pred: (r: ClientInvoiceRow) => boolean) => invoices.filter(pred).reduce((n, r) => n + r.total, 0);
  const porCobrar = sum((r) => r.status === "ENVIADA" || r.status === "VENCIDA");
  const vencido = sum((r) => r.status === "VENCIDA");
  const cobrado = sum((r) => r.status === "PAGADA");
  const currency = invoices[0]?.currency ?? porFacturar[0]?.currency ?? "COP";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Por facturar" value={formatMoney(porFacturarTotal, currency)} tone="text-sky-600 dark:text-sky-400" />
        <Kpi label="Por cobrar" value={formatMoney(porCobrar, currency)} tone="text-amber-600 dark:text-amber-400" />
        <Kpi label="Vencido" value={formatMoney(vencido, currency)} tone={vencido > 0 ? "text-destructive" : undefined} />
        <Kpi label="Cobrado" value={formatMoney(cobrado, currency)} tone="text-emerald-600 dark:text-emerald-400" />
      </div>

      {porFacturar.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-sky-700 dark:text-sky-300">
            Por facturar <span className="font-normal text-muted-foreground">({porFacturar.length})</span>
          </h3>
          <PorFacturarList items={porFacturar} canCreate={canCreate} showClient={false} />
        </section>
      ) : null}

      {invoices.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Facturas</h3>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {invoices.map((r) => {
              const meta = invoiceStatusMeta(r.status);
              return (
                <Link
                  key={r.id}
                  href={`/facturacion/${r.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{r.projectName ?? "Sin proyecto"}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}>{meta.label}</span>
                  <span className="shrink-0 text-sm font-medium">{formatMoney(r.total, r.currency)}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
