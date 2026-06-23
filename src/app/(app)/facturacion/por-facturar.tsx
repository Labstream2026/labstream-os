import Link from "next/link";
import { formatMoney } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { SubmitButton } from "@/components/submit-button";
import { createInvoiceFromQuote } from "./actions";

// Una línea de la cola "Por facturar": un borrador que falta emitir, o una cotización
// aprobada cuyo proyecto terminó (o sin proyecto) que aún no se ha facturado.
export type PorFacturarItem = {
  key: string;
  clientName: string;
  clientEmoji: string | null;
  context: string; // proyecto o título de la cotización
  note: string; // sub-línea explicativa
  urgent?: boolean; // resalta la sub-línea (antigüedad)
  amount: number;
  currency: string;
  // Acción: emitir desde la cotización (crea la factura) o abrir el borrador existente.
  emit: { type: "quote"; quoteId: string } | { type: "open"; href: string };
};

export function PorFacturarList({
  items,
  canCreate,
  showClient = true,
}: {
  items: PorFacturarItem[];
  canCreate: boolean;
  showClient?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-sky-300/70 bg-card dark:border-sky-500/30">
      {items.map((it, i) => (
        <div
          key={it.key}
          className={cn(
            "flex flex-wrap items-center gap-3 px-4 py-3",
            i < items.length - 1 && "border-b border-border",
          )}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {showClient ? (
                <>
                  {it.clientEmoji ?? "🏢"} {it.clientName}
                  <span className="font-normal text-muted-foreground"> · {it.context}</span>
                </>
              ) : (
                it.context
              )}
            </p>
            <p className={cn("truncate text-xs", it.urgent ? "text-destructive" : "text-muted-foreground")}>
              {it.note}
            </p>
          </div>
          <span className="text-sm font-semibold whitespace-nowrap">{formatMoney(it.amount, it.currency)}</span>
          {it.emit.type === "quote" ? (
            canCreate ? (
              <form action={createInvoiceFromQuote.bind(null, it.emit.quoteId)}>
                <SubmitButton
                  pendingText="Generando…"
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Generar factura
                </SubmitButton>
              </form>
            ) : null
          ) : (
            <Link
              href={it.emit.href}
              className="rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              Revisar y emitir
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
