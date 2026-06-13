import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, FileText } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { formatMoney, quoteStatusMeta, quoteTotals, formatShortDate } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function CotizacionesPage() {
  const session = await getSession();
  if (!hasPermission(session, "ver_cotizaciones")) redirect("/");
  const canCreate = hasPermission(session, "crear_cotizaciones");

  const quotes = await db.quote.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { name: true, emoji: true } },
      items: { select: { quantity: true, unitPrice: true } },
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cotizaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">{quotes.length} cotizaciones</p>
        </div>
        {canCreate ? (
          <Link
            href="/cotizaciones/nueva"
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Nueva cotización
          </Link>
        ) : null}
      </div>

      {quotes.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <FileText className="size-7 text-muted-foreground" />
          <p className="font-medium">Aún no hay cotizaciones</p>
          <p className="text-sm text-muted-foreground">Crea la primera para un cliente o proyecto.</p>
        </div>
      ) : (
        <div className="mt-8 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {quotes.map((q) => {
            const meta = quoteStatusMeta(q.status);
            const { total } = quoteTotals(q.items, q.taxRate);
            return (
              <Link
                key={q.id}
                href={`/cotizaciones/${q.id}`}
                className="flex items-center gap-4 p-4 transition-colors hover:bg-accent/50"
              >
                <span className="font-mono text-xs text-muted-foreground">{q.code}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{q.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {q.client.emoji} {q.client.name}
                    {q.validUntil ? ` · vence ${formatShortDate(q.validUntil)}` : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{formatMoney(total, q.currency)}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>
                  {meta.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
