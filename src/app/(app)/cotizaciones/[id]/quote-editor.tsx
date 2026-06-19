"use client";

import * as React from "react";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { formatMoney } from "@/lib/ui";
import { composeQuoteTotals, clientLineValue } from "@/lib/quote-compose";
import { addItem, removeItem, updateItem } from "../actions";
import { ServiceComposer, type ComposerType } from "./service-composer";

type Item = { id: string; section: string; description: string; unit: string; quantity: number; unitPrice: number };

const UNIT_SUGGESTIONS = ["día", "hora", "minuto", "unidad", "evento", "mes", "noche", "servicio"];

export function QuoteEditor({
  quoteId,
  initialItems,
  taxRate,
  contingencyPct,
  currency,
  canEdit,
  catalog,
}: {
  quoteId: string;
  initialItems: Item[];
  taxRate: number;
  contingencyPct: number;
  currency: string;
  canEdit: boolean;
  catalog: ComposerType[];
}) {
  const [items, setItems] = React.useState<Item[]>(initialItems);
  const [pending, start] = React.useTransition();
  const [composing, setComposing] = React.useState(false);

  React.useEffect(() => setItems(initialItems), [initialItems]);

  const patch = (id: string, field: keyof Item, value: string) => {
    const numeric = field === "quantity" || field === "unitPrice";
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: numeric ? Number(value.replace(/[^\d.]/g, "")) || 0 : value } : it)),
    );
  };

  const commit = (it: Item) => {
    updateItem(it.id, { section: it.section, description: it.description, unit: it.unit, quantity: it.quantity, unitPrice: it.unitPrice });
  };

  const { costSubtotal, contingency, clientSubtotal, tax, total } = composeQuoteTotals(items, { taxRate, contingencyPct });

  const sectionSuggestions = Array.from(
    new Set([...items.map((i) => i.section).filter(Boolean), "Preproducción", "Rodaje", "Postproducción", "Equipo y logística", "Otros"]),
  );

  return (
    <div className="space-y-3">
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setComposing((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Sparkles className="size-4" /> Componer desde el catálogo
          </button>
          <span className="text-xs text-muted-foreground">Elige los servicios y se suman solos con su precio interno.</span>
        </div>
      ) : null}

      {composing ? (
        <ServiceComposer quoteId={quoteId} catalog={catalog} currency={currency} onDone={() => setComposing(false)} />
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <datalist id="quote-sections">{sectionSuggestions.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="quote-units">{UNIT_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="w-32 px-3 py-2.5 font-medium">Sección</th>
                <th className="px-4 py-2.5 font-medium">Descripción</th>
                <th className="w-20 px-2 py-2.5 font-medium">Unidad</th>
                <th className="w-16 px-2 py-2.5 text-right font-medium">Cant.</th>
                <th className="w-32 px-2 py-2.5 text-right font-medium">Precio unit.</th>
                <th className="w-32 px-4 py-2.5 text-right font-medium">Importe</th>
                {canEdit ? <th className="w-10" /> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5">
                    <input value={it.section} disabled={!canEdit} onChange={(e) => patch(it.id, "section", e.target.value)} onBlur={() => commit(it)} placeholder="—" list="quote-sections" className="w-full rounded-md bg-transparent px-2 py-1 text-xs text-muted-foreground outline-none focus:bg-accent/50 disabled:opacity-70" />
                  </td>
                  <td className="px-4 py-1.5">
                    <input value={it.description} disabled={!canEdit} onChange={(e) => patch(it.id, "description", e.target.value)} onBlur={() => commit(it)} placeholder="Concepto…" className="w-full rounded-md bg-transparent px-2 py-1 outline-none focus:bg-accent/50 disabled:opacity-70" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={it.unit} disabled={!canEdit} onChange={(e) => patch(it.id, "unit", e.target.value)} onBlur={() => commit(it)} placeholder="—" list="quote-units" className="w-full rounded-md bg-transparent px-2 py-1 text-xs text-muted-foreground outline-none focus:bg-accent/50 disabled:opacity-70" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={it.quantity} disabled={!canEdit} inputMode="decimal" onChange={(e) => patch(it.id, "quantity", e.target.value)} onBlur={() => commit(it)} className="w-full rounded-md bg-transparent px-2 py-1 text-right tabular-nums outline-none focus:bg-accent/50 disabled:opacity-70" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={it.unitPrice} disabled={!canEdit} inputMode="numeric" onChange={(e) => patch(it.id, "unitPrice", e.target.value)} onBlur={() => commit(it)} className="w-full rounded-md bg-transparent px-2 py-1 text-right tabular-nums outline-none focus:bg-accent/50 disabled:opacity-70" />
                  </td>
                  <td className="px-4 py-1.5 text-right font-medium tabular-nums">{formatMoney(it.quantity * it.unitPrice, currency)}</td>
                  {canEdit ? (
                    <td className="px-2 py-1.5">
                      <button onClick={() => start(() => removeItem(it.id))} disabled={pending} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" title="Quitar línea">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {canEdit ? (
          <button onClick={() => start(() => addItem(quoteId))} disabled={pending} className="flex w-full items-center gap-1.5 border-t border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent/50 disabled:opacity-50">
            <Plus className="size-4" /> Añadir línea
          </button>
        ) : null}

        {/* Desglose: el equipo ve costo + imprevisto; el cliente solo verá el "Precio al cliente" + IVA. */}
        <div className="space-y-1 border-t border-border bg-muted/30 px-4 py-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal (costo)</span>
            <span className="tabular-nums">{formatMoney(costSubtotal, currency)}</span>
          </div>
          {contingency > 0 ? (
            <div className="flex justify-between text-amber-600 dark:text-amber-400">
              <span>Imprevisto ({contingencyPct}%) · interno, no visible al cliente</span>
              <span className="tabular-nums">{formatMoney(contingency, currency)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-medium text-foreground">
            <span>Precio al cliente {contingency > 0 ? <span className="font-normal text-muted-foreground">(con imprevisto incluido)</span> : null}</span>
            <span className="tabular-nums">{formatMoney(clientSubtotal, currency)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>IVA ({taxRate}%)</span>
            <span className="tabular-nums">{formatMoney(tax, currency)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(total, currency)}</span>
          </div>
        </div>
      </div>

      {canEdit && contingency > 0 && items.length > 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          El cliente verá cada línea ya ajustada (p. ej. {formatMoney(clientLineValue(items[0], contingencyPct), currency)} en vez de {formatMoney(items[0].quantity * items[0].unitPrice, currency)}), sumando al precio al cliente. Nunca ve la línea del imprevisto.
        </p>
      ) : null}
    </div>
  );
}
