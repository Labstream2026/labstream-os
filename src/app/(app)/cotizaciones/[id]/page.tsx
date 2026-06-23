import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Printer, Copy } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanAccessClient } from "@/lib/client-access";
import { quoteStatusMeta, formatShortDate } from "@/lib/ui";
import { signQuoteToken } from "@/lib/quote-token";
import { updateQuoteMeta, copyQuoteBriefToProject, duplicateQuote } from "../actions";
import { getServiceCatalog, getServicePackages } from "@/lib/services-catalog";
import { createInvoiceFromQuote } from "../../facturacion/actions";
import { InvoiceView } from "../../facturacion/invoice-view";
import { ViewTabs } from "@/app/(app)/proyectos/[id]/view-tabs";
import { QuoteEditor } from "./quote-editor";
import { QuoteStatusActions } from "./quote-status";
import { ShareQuote } from "./share-quote";

export const dynamic = "force-dynamic";

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!hasPermission(session, "ver_finanzas")) redirect("/");
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
      // Factura generada desde esta cotización (la más reciente) para la pestaña "Facturado".
      invoices: { orderBy: { createdAt: "desc" }, take: 1, include: { items: { orderBy: { position: "asc" } } } },
    },
  });
  if (!quote) notFound();
  // No basta el permiso global: hay que poder ver el cliente de la cotización.
  if (!(await userCanAccessClient(quote.clientId, session))) redirect("/facturacion");

  const meta = quoteStatusMeta(quote.status);
  const validUntilValue = quote.validUntil ? new Date(quote.validUntil).toISOString().slice(0, 10) : "";
  const publicPath = `/cotizacion/${signQuoteToken(quote.id)}`;
  const [catalog, packages] = canEdit ? await Promise.all([getServiceCatalog(), getServicePackages()]) : [[], []];

  const inv = quote.invoices[0] ?? null;
  const invoiceForView = inv
    ? { id: inv.id, code: inv.code, status: inv.status, currency: inv.currency, taxRate: inv.taxRate, notes: inv.notes, issueDate: inv.issueDate, dueDate: inv.dueDate, paidAt: inv.paidAt, quote: null, items: inv.items }
    : null;

  // ── Pestaña "Servicios y valores": datos editables + conceptos (el editor de la cotización) ──
  const serviciosNode = (
    <div className="space-y-6">
      {canEdit ? (
        <form action={updateQuoteMeta.bind(null, quote.id)} className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Título</span>
            <input name="title" defaultValue={quote.title} className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">IVA (%)</span>
            <input name="taxRate" type="number" min={0} max={100} defaultValue={quote.taxRate} className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Imprevisto (%) <span className="font-normal text-muted-foreground">· oculto al cliente</span></span>
            <input name="contingencyPct" type="number" min={0} max={100} step="0.5" defaultValue={quote.contingencyPct} className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Válida hasta</span>
            <input name="validUntil" type="date" defaultValue={validUntilValue} className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Qué se va a hacer <span className="font-normal text-muted-foreground">· lo ve el cliente y el equipo</span></span>
            <textarea name="scope" rows={3} defaultValue={quote.scope ?? ""} placeholder="Describe el servicio: cómo se ejecutará, fechas, locaciones, alcance…" className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Entregables <span className="font-normal text-muted-foreground">· qué recibe el cliente</span></span>
            <textarea name="deliverables" rows={3} defaultValue={quote.deliverables ?? ""} placeholder="p. ej. 1 video de 60s en 4K, 20 fotos editadas, 3 reels verticales, galería online…" className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Persona de contacto</span>
            <input name="recipientName" defaultValue={quote.recipientName ?? ""} placeholder={`p. ej. ${quote.client.name}`} className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Ciudad del destinatario</span>
            <input name="recipientCity" defaultValue={quote.recipientCity ?? ""} placeholder="Ciudad" className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Texto de introducción</span>
            <textarea name="intro" rows={2} defaultValue={quote.intro ?? ""} placeholder="A continuación relacionamos el desglose de… (si lo dejas vacío se genera automáticamente)" className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Nota / información adicional</span>
            <textarea name="notes" rows={2} defaultValue={quote.notes ?? ""} placeholder="Condiciones, forma de pago, descuentos, etc." className="w-full rounded-md border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">Guardar datos</button>
            {quote.project ? (
              <button formAction={copyQuoteBriefToProject.bind(null, quote.id)} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent" title="Copia el alcance y los entregables al proyecto, para que el equipo los vea (sin valores)">
                Enviar alcance/entregables al proyecto →
              </button>
            ) : null}
          </div>
        </form>
      ) : quote.notes ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">{quote.notes}</p>
      ) : null}

      <div>
        <h2 className="mb-2 text-sm font-semibold">Conceptos</h2>
        <QuoteEditor
          quoteId={quote.id}
          initialItems={quote.items.map((i) => ({ id: i.id, section: i.section ?? "", description: i.description, unit: i.unit ?? "", quantity: i.quantity, unitPrice: i.unitPrice }))}
          taxRate={quote.taxRate}
          contingencyPct={quote.contingencyPct}
          currency={quote.currency}
          canEdit={canEdit}
          catalog={catalog.map((g) => ({ key: g.key, label: g.label, icon: g.icon, sections: g.sections.map((s) => ({ name: s.name, items: s.items.map((it) => ({ id: it.id, name: it.name, detail: it.detail, unit: it.unit, qty: it.qty, unitPrice: it.unitPrice })) })) }))}
          packages={packages.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji, serviceType: p.serviceType, itemCount: p.itemCount }))}
        />
      </div>
    </div>
  );

  // ── Pestaña "Facturado": la factura generada (o el botón para generarla) ──
  const facturadoNode = invoiceForView ? (
    <InvoiceView invoice={invoiceForView} canEdit={canEdit} canApprove={canApprove} />
  ) : (
    <div className="rounded-xl border border-dashed border-border p-8 text-center">
      <p className="text-sm text-muted-foreground">Aún no se ha generado la factura de esta cotización.</p>
      {canEdit && quote.status === "APROBADA" ? (
        <form action={createInvoiceFromQuote.bind(null, quote.id)} className="mt-3">
          <button className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">🧾 Generar factura</button>
        </form>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Aprueba la cotización para poder facturar.</p>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/cotizaciones" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Facturación
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

      {/* Acciones de documento: imprimir/PDF + enlace público al cliente */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link href={`/cotizaciones/${quote.id}/imprimir`} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">
          <Printer className="size-4" /> Imprimir / PDF
        </Link>
        {canEdit ? <ShareQuote path={publicPath} /> : null}
        {canEdit ? (
          <form action={duplicateQuote.bind(null, quote.id)}>
            <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent" title="Crear una copia editable de esta cotización">
              <Copy className="size-4" /> Duplicar
            </button>
          </form>
        ) : null}
      </div>

      {quote.status === "APROBADA" && quote.approvedBy ? (
        <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
          Aprobada por {quote.approvedBy.name}
          {quote.approvedAt ? ` · ${formatShortDate(quote.approvedAt)}` : ""}
        </p>
      ) : null}

      <div className="mt-6">
        <ViewTabs
          storageKey="factura-doc-view"
          views={[
            { key: "servicios", label: "Servicios y valores", icon: "🧾", node: serviciosNode },
            { key: "facturado", label: "Facturado", icon: "📄", node: facturadoNode },
          ]}
        />
      </div>
    </div>
  );
}
