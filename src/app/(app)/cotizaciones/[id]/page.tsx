import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { quoteStatusMeta, formatShortDate } from "@/lib/ui";
import { updateQuoteMeta } from "../actions";
import { QuoteEditor } from "./quote-editor";
import { QuoteStatusActions } from "./quote-status";

export const dynamic = "force-dynamic";

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!hasPermission(session, "ver_cotizaciones")) redirect("/");
  const canEdit = hasPermission(session, "crear_cotizaciones");
  const canApprove = hasPermission(session, "aprobar_cotizaciones");

  const quote = await db.quote.findUnique({
    where: { id },
    include: {
      client: { select: { name: true, emoji: true } },
      project: { select: { id: true, name: true, code: true } },
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      items: { orderBy: { position: "asc" } },
    },
  });
  if (!quote) notFound();

  const meta = quoteStatusMeta(quote.status);
  const validUntilValue = quote.validUntil ? new Date(quote.validUntil).toISOString().slice(0, 10) : "";

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link href="/cotizaciones" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Cotizaciones
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{quote.code}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>{meta.label}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{quote.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {quote.client.emoji} {quote.client.name}
            {quote.project ? (
              <>
                {" · "}
                <Link href={`/proyectos/${quote.project.id}`} className="hover:underline">
                  {quote.project.code} · {quote.project.name}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <QuoteStatusActions quoteId={quote.id} status={quote.status} canEdit={canEdit} canApprove={canApprove} />
      </div>

      {quote.status === "APROBADA" && quote.approvedBy ? (
        <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          Aprobada por {quote.approvedBy.name}
          {quote.approvedAt ? ` · ${formatShortDate(quote.approvedAt)}` : ""}
        </p>
      ) : null}

      {/* Datos editables */}
      {canEdit ? (
        <form action={updateQuoteMeta.bind(null, quote.id)} className="mt-6 grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Título</span>
            <input name="title" defaultValue={quote.title} className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">IVA (%)</span>
            <input name="taxRate" type="number" min={0} max={100} defaultValue={quote.taxRate} className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Válida hasta</span>
            <input name="validUntil" type="date" defaultValue={validUntilValue} className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Notas</span>
            <textarea name="notes" rows={2} defaultValue={quote.notes ?? ""} placeholder="Condiciones, forma de pago, etc." className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <div className="sm:col-span-2">
            <button className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">Guardar datos</button>
          </div>
        </form>
      ) : quote.notes ? (
        <p className="mt-6 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">{quote.notes}</p>
      ) : null}

      {/* Líneas */}
      <h2 className="mb-2 mt-6 text-sm font-semibold">Conceptos</h2>
      <QuoteEditor
        quoteId={quote.id}
        initialItems={quote.items.map((i) => ({ id: i.id, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice }))}
        taxRate={quote.taxRate}
        currency={quote.currency}
        canEdit={canEdit}
      />
    </div>
  );
}
