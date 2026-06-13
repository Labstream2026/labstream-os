"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatMoney, quoteTotals } from "@/lib/ui";
import { addItem, removeItem, updateItem } from "../actions";

type Item = { id: string; description: string; quantity: number; unitPrice: number };

export function QuoteEditor({
  quoteId,
  initialItems,
  taxRate,
  currency,
  canEdit,
}: {
  quoteId: string;
  initialItems: Item[];
  taxRate: number;
  currency: string;
  canEdit: boolean;
}) {
  const [items, setItems] = React.useState<Item[]>(initialItems);
  const [pending, start] = React.useTransition();

  // sincroniza si el servidor revalida (añadir/quitar líneas)
  React.useEffect(() => setItems(initialItems), [initialItems]);

  const patch = (id: string, field: keyof Item, value: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? { ...it, [field]: field === "description" ? value : Number(value.replace(/[^\d.]/g, "")) || 0 }
          : it,
      ),
    );
  };

  const commit = (it: Item) => {
    updateItem(it.id, { description: it.description, quantity: it.quantity, unitPrice: it.unitPrice });
  };

  const { subtotal, tax, total } = quoteTotals(items, taxRate);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Descripción</th>
            <th className="w-20 px-2 py-2.5 text-right font-medium">Cant.</th>
            <th className="w-36 px-2 py-2.5 text-right font-medium">Precio unit.</th>
            <th className="w-36 px-4 py-2.5 text-right font-medium">Importe</th>
            {canEdit ? <th className="w-10" /> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-border last:border-0">
              <td className="px-4 py-1.5">
                <input
                  value={it.description}
                  disabled={!canEdit}
                  onChange={(e) => patch(it.id, "description", e.target.value)}
                  onBlur={() => commit(it)}
                  placeholder="Concepto…"
                  className="w-full rounded-md bg-transparent px-2 py-1 outline-none focus:bg-accent/50 disabled:opacity-70"
                />
              </td>
              <td className="px-2 py-1.5">
                <input
                  value={it.quantity}
                  disabled={!canEdit}
                  inputMode="decimal"
                  onChange={(e) => patch(it.id, "quantity", e.target.value)}
                  onBlur={() => commit(it)}
                  className="w-full rounded-md bg-transparent px-2 py-1 text-right tabular-nums outline-none focus:bg-accent/50 disabled:opacity-70"
                />
              </td>
              <td className="px-2 py-1.5">
                <input
                  value={it.unitPrice}
                  disabled={!canEdit}
                  inputMode="numeric"
                  onChange={(e) => patch(it.id, "unitPrice", e.target.value)}
                  onBlur={() => commit(it)}
                  className="w-full rounded-md bg-transparent px-2 py-1 text-right tabular-nums outline-none focus:bg-accent/50 disabled:opacity-70"
                />
              </td>
              <td className="px-4 py-1.5 text-right font-medium tabular-nums">
                {formatMoney(it.quantity * it.unitPrice, currency)}
              </td>
              {canEdit ? (
                <td className="px-2 py-1.5">
                  <button
                    onClick={() => start(() => removeItem(it.id))}
                    disabled={pending}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    title="Quitar línea"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      {canEdit ? (
        <button
          onClick={() => start(() => addItem(quoteId))}
          disabled={pending}
          className="flex w-full items-center gap-1.5 border-t border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent/50 disabled:opacity-50"
        >
          <Plus className="size-4" /> Añadir línea
        </button>
      ) : null}

      <div className="space-y-1 border-t border-border bg-muted/30 px-4 py-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatMoney(subtotal, currency)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>IVA ({taxRate}%)</span>
          <span className="tabular-nums">{formatMoney(tax, currency)}</span>
        </div>
        <div className="flex justify-between pt-1 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatMoney(total, currency)}</span>
        </div>
      </div>
    </div>
  );
}
