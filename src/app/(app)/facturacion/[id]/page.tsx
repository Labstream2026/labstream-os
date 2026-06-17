import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanAccessClient } from "@/lib/client-access";
import { invoiceStatusMeta, quoteTotals, formatMoney, formatShortDate } from "@/lib/ui";
import { updateInvoiceMeta } from "../actions";
import { InvoiceStatusActions } from "./invoice-status";

export const dynamic = "force-dynamic";

function effectiveStatus(status: string, dueDate: Date | null): string {
  if (status === "ENVIADA" && dueDate && new Date(dueDate) < new Date()) return "VENCIDA";
  return status;
}
const toInput = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");

export default async function FacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!hasPermission(session, "ver_cotizaciones")) redirect("/");
  const canEdit = hasPermission(session, "crear_cotizaciones");
  const canApprove = hasPermission(session, "aprobar_cotizaciones");

  const invoice = await db.invoice.findUnique({
    where: { id },
    include: {
      client: { select: { name: true, emoji: true } },
      project: { select: { id: true, name: true, code: true } },
      quote: { select: { id: true, code: true } },
      createdBy: { select: { name: true } },
      items: { orderBy: { position: "asc" } },
    },
  });
  if (!invoice) notFound();
  if (!(await userCanAccessClient(invoice.clientId, session))) redirect("/facturacion");

  const status = effectiveStatus(invoice.status, invoice.dueDate);
  const meta = invoiceStatusMeta(status);
  const totals = quoteTotals(invoice.items, invoice.taxRate);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/facturacion" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Facturación
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{invoice.code}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Factura {invoice.code}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {invoice.client.emoji} {invoice.client.name}
            {invoice.project ? (
              <> · <Link href={`/proyectos/${invoice.project.id}`} className="hover:underline">{invoice.project.code} · {invoice.project.name}</Link></>
            ) : null}
            {invoice.quote ? (
              <> · desde <Link href={`/cotizaciones/${invoice.quote.id}`} className="hover:underline">{invoice.quote.code}</Link></>
            ) : null}
          </p>
        </div>
        <InvoiceStatusActions invoiceId={invoice.id} status={invoice.status} canApprove={canApprove} />
      </div>

      {invoice.status === "PAGADA" && invoice.paidAt ? (
        <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          Pagada el {formatShortDate(invoice.paidAt)}
        </p>
      ) : status === "VENCIDA" ? (
        <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          Vencida el {formatShortDate(invoice.dueDate)} — pendiente de cobro.
        </p>
      ) : null}

      {/* Datos editables */}
      {canEdit ? (
        <form action={updateInvoiceMeta.bind(null, invoice.id)} className="mt-6 grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-3">
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
      <h2 className="mb-2 mt-6 text-sm font-semibold">Conceptos</h2>
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
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

      {/* Totales */}
      <div className="mt-4 flex justify-end">
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}
