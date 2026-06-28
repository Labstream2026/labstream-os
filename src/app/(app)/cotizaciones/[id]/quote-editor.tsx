"use client";

import * as React from "react";
import { Plus, Trash2, Sparkles, GripVertical } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatMoney } from "@/lib/ui";
import { composeQuoteTotals, clientLineValue } from "@/lib/quote-compose";
import { addItem, removeItem, updateItem, reorderQuoteItems } from "../actions";
import { ServiceComposer, type ComposerType, type ComposerPackage } from "./service-composer";

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
  packages,
}: {
  quoteId: string;
  initialItems: Item[];
  taxRate: number;
  contingencyPct: number;
  currency: string;
  canEdit: boolean;
  catalog: ComposerType[];
  packages: ComposerPackage[];
}) {
  const [items, setItems] = React.useState<Item[]>(initialItems);
  const [pending, start] = React.useTransition();
  const [composing, setComposing] = React.useState(false);
  // Error de guardado visible: ANTES `commit` era fire-and-forget y un fallo (sin permiso,
  // cotización ya enviada, red caída) perdía el cambio de PRECIO en silencio. Ahora se avisa.
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => setItems(initialItems), [initialItems]);

  const patch = (id: string, field: keyof Item, value: string) => {
    const numeric = field === "quantity" || field === "unitPrice";
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: numeric ? Number(value.replace(/[^\d.]/g, "")) || 0 : value } : it)),
    );
  };

  // Guarda una línea y, si falla, lo dice claramente. El valor editado sigue en pantalla para
  // que se pueda reintentar (volviendo a salir del campo) sin perder lo escrito.
  const commit = (it: Item) => {
    setSaveError(null);
    start(async () => {
      try {
        await updateItem(it.id, { section: it.section, description: it.description, unit: it.unit, quantity: it.quantity, unitPrice: it.unitPrice });
      } catch (e) {
        setSaveError(`No se pudo guardar «${it.description || "la línea"}»: ${e instanceof Error ? e.message : "error desconocido"}. Tu cambio sigue en pantalla; reintenta saliendo del campo de nuevo.`);
      }
    });
  };

  // Igual para quitar/reordenar: si fallan, se avisa en vez de quedar en un estado inconsistente.
  const safeRemove = (id: string) => {
    setSaveError(null);
    start(async () => {
      try { await removeItem(id); } catch (e) { setSaveError(`No se pudo quitar la línea: ${e instanceof Error ? e.message : "error"}.`); }
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Táctil: arrastrar para reordenar líneas con el dedo sin bloquear el scroll.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    // Accesibilidad: reordenar con teclado (Espacio para tomar, flechas para mover, Espacio para soltar).
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    const prev = items;
    const next = arrayMove(items, from, to);
    setItems(next);
    setSaveError(null);
    start(async () => {
      try {
        await reorderQuoteItems(quoteId, next.map((i) => i.id));
      } catch (e) {
        setItems(prev); // revertir el orden si el servidor lo rechaza
        setSaveError(`No se pudo reordenar: ${e instanceof Error ? e.message : "error"}.`);
      }
    });
  };

  const { costSubtotal, contingency, clientSubtotal, tax, total } = composeQuoteTotals(items, { taxRate, contingencyPct });

  // Subtotales por sección (a costo) — ayuda al armar trabajos con muchos conceptos.
  const sectionTotals = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) {
      const s = it.section.trim() || "Sin sección";
      m.set(s, (m.get(s) ?? 0) + it.quantity * it.unitPrice);
    }
    return [...m.entries()];
  }, [items]);

  const sectionSuggestions = Array.from(
    new Set([...items.map((i) => i.section).filter(Boolean), "Preproducción", "Rodaje", "Postproducción", "Equipo y logística", "Otros"]),
  );

  const colCount = canEdit ? 7 : 5;

  return (
    <div className="space-y-3">
      {saveError ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span className="flex-1">{saveError}</span>
          <button type="button" onClick={() => setSaveError(null)} className="shrink-0 text-lg leading-none text-destructive/70 hover:text-destructive" aria-label="Descartar aviso">×</button>
        </div>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setComposing((v) => !v)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Sparkles className="size-4" /> Componer desde el catálogo
          </button>
          <span className="text-xs text-muted-foreground">Elige los servicios y se suman solos con su precio interno.</span>
        </div>
      ) : null}

      {composing ? (
        <ServiceComposer quoteId={quoteId} catalog={catalog} packages={packages} currency={currency} onDone={() => setComposing(false)} />
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <datalist id="quote-sections">{sectionSuggestions.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="quote-units">{UNIT_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                {canEdit ? <th className="w-6" /> : null}
                <th className="w-32 px-3 py-2.5 font-medium">Sección</th>
                <th className="px-4 py-2.5 font-medium">Descripción</th>
                <th className="w-20 px-2 py-2.5 font-medium">Unidad</th>
                <th className="w-16 px-2 py-2.5 text-right font-medium">Cant.</th>
                <th className="w-32 px-2 py-2.5 text-right font-medium">Precio unit.</th>
                <th className="w-32 px-4 py-2.5 text-right font-medium">Importe</th>
                {canEdit ? <th className="w-10" /> : null}
              </tr>
            </thead>
            <DndContext id="quote-items" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={colCount} className="px-4 py-6 text-center text-sm text-muted-foreground">Sin conceptos todavía. Compón desde el catálogo o añade una línea.</td></tr>
                  ) : null}
                  {items.map((it) => (
                    <SortableRow key={it.id} it={it} canEdit={canEdit} pending={pending} currency={currency} patch={patch} commit={commit} onRemove={() => safeRemove(it.id)} />
                  ))}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
        </div>

        {canEdit ? (
          <button onClick={() => start(() => addItem(quoteId))} disabled={pending} className="flex w-full items-center gap-1.5 border-t border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent/50 disabled:opacity-50">
            <Plus className="size-4" /> Añadir línea
          </button>
        ) : null}

        {/* Desglose: el equipo ve costo + imprevisto; el cliente solo verá el "Precio al cliente" + IVA. */}
        <div className="space-y-1 border-t border-border bg-muted/30 px-4 py-3 text-sm">
          {sectionTotals.length > 1 ? (
            <div className="mb-2 space-y-0.5 border-b border-border/60 pb-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Por sección (costo)</p>
              {sectionTotals.map(([name, val]) => (
                <div key={name} className="flex justify-between text-xs text-muted-foreground">
                  <span>{name}</span>
                  <span className="tabular-nums">{formatMoney(val, currency)}</span>
                </div>
              ))}
            </div>
          ) : null}
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

function SortableRow({
  it, canEdit, pending, currency, patch, commit, onRemove,
}: {
  it: Item;
  canEdit: boolean;
  pending: boolean;
  currency: string;
  patch: (id: string, field: keyof Item, value: string) => void;
  commit: (it: Item) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: it.id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <tr ref={setNodeRef} style={style} className="border-b border-border last:border-0">
      {canEdit ? (
        <td className="pl-1.5 align-middle">
          <button className="cursor-grab touch-none text-muted-foreground/30 hover:text-muted-foreground active:cursor-grabbing" title="Arrastra para reordenar" {...attributes} {...listeners}>
            <GripVertical className="size-4" />
          </button>
        </td>
      ) : null}
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
          <button onClick={onRemove} disabled={pending} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" title="Quitar línea">
            <Trash2 className="size-4" />
          </button>
        </td>
      ) : null}
    </tr>
  );
}
