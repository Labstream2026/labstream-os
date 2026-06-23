import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { QuoteDocument } from "@/components/quote-document";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function ImprimirCotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!hasPermission(session, "ver_finanzas")) redirect("/");

  const quote = await db.quote.findUnique({
    where: { id },
    include: {
      client: { select: { name: true, company: true } },
      project: { select: { name: true } },
      items: { orderBy: { position: "asc" } },
    },
  });
  if (!quote) notFound();

  return (
    <div className="min-h-screen bg-neutral-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between px-4 print:hidden">
        <Link href={`/cotizaciones/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Volver a la cotización
        </Link>
        <PrintButton />
      </div>

      <QuoteDocument
        quote={{
          code: quote.code,
          title: quote.title,
          status: quote.status,
          currency: quote.currency,
          taxRate: quote.taxRate,
          contingencyPct: quote.contingencyPct,
          notes: quote.notes,
          scope: quote.scope,
          deliverables: quote.deliverables,
          validUntil: quote.validUntil,
          createdAt: quote.createdAt,
          clientName: quote.client.name,
          clientCompany: quote.client.company,
          recipientName: quote.recipientName,
          recipientCity: quote.recipientCity,
          intro: quote.intro,
          projectName: quote.project?.name ?? null,
          items: quote.items.map((i) => ({ section: i.section, description: i.description, unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice })),
        }}
      />
    </div>
  );
}
