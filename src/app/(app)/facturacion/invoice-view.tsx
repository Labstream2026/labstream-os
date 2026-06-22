import { invoiceStatusMeta, quoteTotals, formatMoney, formatShortDate } from "@/lib/ui";
import { updateInvoiceMeta } from "./actions";
import { InvoiceStatusActions } from "./[id]/invoice-status";

// Vista reutilizable de una FACTURA (cuerpo completo: estado + datos editables + conceptos +
// totales). La usan tanto la página /facturacion/[id] como la pestaña "Facturado" del detalle
// de cotización (documento unificado). No incluye el enlace "volver" ni el contenedor de
// página: eso lo pone quien la renderiza.

export type InvoiceForView = {
  id: string;
  code: string;
  status: string;
  currency: string;
  taxRate: number;
  notes: string | null;
  issueDate: Date;
  dueDate: Date | null;
  paidAt: Date | null;
  quote: { code: string } | null;
  items: { id: string; section: string | null; description: string; quantity: number; unitPrice: number }[];
};

function effectiveStatus(status: string, dueDate: Date | null): string {
  if (status === "ENVIADA" && dueDate && new Date(dueDate) < new Date()) return "VENCIDA";
  return status;
}
const toInput = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

export function InvoiceView({ invoice, canEdit, canApprove }: { invoice: InvoiceForView; canEdit: boolean; canApprove: boolean }) {
  const status = effectiveStatus(invoice.status, invoice.dueDate);
  const meta = invoiceStatusMeta(status);
  const totals = quoteTotals(invoice.items, invoice.taxRate);

  return (
    <div className="space-y-4">
      {/* Estado + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{invoice.code}</span>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>
          {invoice.quote ? <span className="text-xs text-muted-foreground">desde {invoice.quote.code}</span> : null}
        </div>
        <InvoiceStatusActions invoiceId={invoice.id} status={invoice.status} canApprove={canApprove} />
      </div>

      {invoice.status === "PAGADA" && invoice.paidAt ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          Pagada el {formatShortDate(invoice.paidAt)}
        </p>
      ) : status === "VENCIDA" ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          Vencida el {formatShortDate(invoice.dueDate)} — pendiente de cobro.
        </p>
      ) : null}

      {/* Datos editables */}
      {canEdit ? (
        <form action={updateInvoiceMeta.bind(null, invoice.id)} className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Fecha de emisión</span>
            <input name="issueDate" type="date" defaultValue={toInput(invoice.issueDate)} className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Vencimiento</span>
            <input name="dueDate" type="date" defaultValue={toInput(invoice.dueDate)} className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">IVA (%)</span>
            <input name="taxRate" type="number" min={0} max={100} defaultValue={invoice.taxRate} className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm sm:col-span-3">
            <span className="mb-1 block font-medium">Notas</span>
            <textarea name="notes" rows={2} defaultValue={invoice.notes ?? ""} placeholder="Forma de pago, datos bancarios, etc." className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <div className="sm:col-span-3">
            <button className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">Guardar datos</button>
          </div>
        </form>
      ) : null}

      {/* Conceptos (snapshot de la cotización) */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">Conceptos</h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Concepto</th>
                <th className="px-4 py-2.5 text-right font-medium">Cant.</th>
                <th className="px-4 py-2.5 text-right font-medium">Precio</th>
                <th className="px-4 py-2.5 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Sin conceptos.</td></tr>
              ) : (
                invoice.items.map((i) => (
                  <tr key={i.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2.5">
                      {i.section ? <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{i.section}</span> : null}
                      {i.description}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{i.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{formatMoney(i.unitPrice, invoice.currency)}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatMoney(i.quantity * i.unitPrice, invoice.currency)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totales */}
      <div className="flex justify-end">
        <div className="w-full max-w-xs space-y-1.5 text-sm">
          <Row label="Subtotal" value={formatMoney(totals.subtotal, invoice.currency)} />
          <Row label={`IVA (${invoice.taxRate}%)`} value={formatMoney(totals.tax, invoice.currency)} />
          <div className="flex items-center justify-between border-t border-border pt-1.5 text-base font-bold">
            <span>Total</span>
            <span>{formatMoney(totals.total, invoice.currency)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
