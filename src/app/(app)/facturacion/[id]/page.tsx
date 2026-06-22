import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanAccessClient } from "@/lib/client-access";
import { InvoiceView } from "../invoice-view";

export const dynamic = "force-dynamic";

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

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/facturacion" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Facturación
      </Link>

      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Factura {invoice.code}</h1>
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

      <InvoiceView invoice={invoice} canEdit={canEdit} canApprove={canApprove} />
    </div>
  );
}
