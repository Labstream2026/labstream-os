"use client";

import * as React from "react";
import { Check, Plus, Package, X, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/ui";
import { unitLabel } from "@/lib/quote-compose";
import { addCatalogItems, applyPackageToQuote, saveServicePackage, deleteServicePackage } from "../actions";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";

export type ComposerItem = { id: string; name: string; detail: string | null; unit: string; qty: number; unitPrice: number };
export type ComposerType = { key: string; label: string; icon: string; sections: { name: string; items: ComposerItem[] }[] };
export type ComposerPackage = { id: string; name: string; emoji: string | null; serviceType: string | null; itemCount: number };

// Arma un servicio tildando ítems del catálogo (con su cantidad) y los agrega como líneas
// a la cotización, sumando con el precio interno. Pensado para "1 vs 3 flashes", "día
// completo", "nº de comidas", "minutos de edición", etc.
export function ServiceComposer({
  quoteId, catalog, packages, currency, onDone,
}: {
  quoteId: string;
  catalog: ComposerType[];
  packages: ComposerPackage[];
  currency: string;
  onDone: () => void;
}) {
  const [typeKey, setTypeKey] = React.useState(catalog[0]?.key ?? "");
  // id → cantidad seleccionada (presente = incluido).
  const [sel, setSel] = React.useState<Record<string, number>>({});
  const [pending, start] = React.useTransition();
  const [savingPkg, setSavingPkg] = React.useState(false);
  const [pkgName, setPkgName] = React.useState("");
  const { confirm, dialog } = useConfirmDialog();

  const type = catalog.find((t) => t.key === typeKey);
  const itemsById = React.useMemo(() => {
    const m = new Map<string, ComposerItem>();
    for (const t of catalog) for (const s of t.sections) for (const it of s.items) m.set(it.id, it);
    return m;
  }, [catalog]);

  const toggle = (it: ComposerItem) =>
    setSel((cur) => {
      const next = { ...cur };
      if (it.id in next) delete next[it.id];
      else next[it.id] = it.qty || 1;
      return next;
    });
  const setQty = (id: string, q: number) => setSel((cur) => ({ ...cur, [id]: Math.max(0, q) }));

  const selectedIds = Object.keys(sel);
  const costSubtotal = selectedIds.reduce((n, id) => n + (sel[id] * (itemsById.get(id)?.unitPrice ?? 0)), 0);

  const add = () => {
    const selections = selectedIds.map((id) => ({ catalogItemId: id, quantity: sel[id] }));
    if (!selections.length) return;
    start(async () => { await addCatalogItems(quoteId, selections); onDone(); });
  };

  if (!catalog.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Aún no hay servicios en el catálogo. Ve a <a href="/cotizaciones?tab=servicios" className="text-primary hover:underline">Servicios y valores</a> para crearlos con sus precios.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-primary/30 bg-card shadow-sm">
      {dialog}
      {/* Tipo de servicio */}
      <div className="flex flex-wrap gap-1.5 border-b border-border bg-muted/30 p-2.5">
        {catalog.map((t) => (
          <button
            key={t.key}
            onClick={() => setTypeKey(t.key)}
            className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", t.key === typeKey ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent")}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Paquetes guardados: aplican su composición a la cotización de un clic */}
      {packages.length ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2.5 py-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground"><Package className="size-3.5" /> Paquetes:</span>
          {packages.map((p) => (
            <span key={p.id} className="group inline-flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-2 pr-1 text-xs">
              <button onClick={() => start(async () => { await applyPackageToQuote(quoteId, p.id); onDone(); })} disabled={pending} className="font-medium hover:text-primary disabled:opacity-50" title="Aplicar este paquete a la cotización">
                {p.emoji ?? "📦"} {p.name} <span className="text-muted-foreground">({p.itemCount})</span>
              </button>
              <button onClick={async () => { if (await confirm({ message: `¿Borrar el paquete «${p.name}»?`, confirmLabel: "Borrar", danger: true })) start(() => deleteServicePackage(quoteId, p.id)); }} className="rounded-full p-0.5 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100" title="Borrar paquete">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {/* Ítems del tipo seleccionado */}
      <div className="max-h-[26rem] overflow-y-auto overscroll-contain p-2">
        {type?.sections.map((s) => (
          <div key={s.name} className="mb-2">
            <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.name}</p>
            <div className="space-y-0.5">
              {s.items.map((it) => {
                const on = it.id in sel;
                return (
                  <div key={it.id} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5", on && "bg-primary/5")}>
                    <button
                      onClick={() => toggle(it)}
                      className={cn("flex size-5 shrink-0 items-center justify-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input hover:border-primary")}
                      title={on ? "Quitar" : "Agregar"}
                    >
                      {on ? <Check className="size-3.5" /> : <Plus className="size-3.5 opacity-50" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{it.name}</p>
                      {it.detail ? <p className="truncate text-[11px] text-muted-foreground">{it.detail}</p> : null}
                    </div>
                    {on ? (
                      <input
                        type="number" min={0} step="0.5" value={sel[it.id]}
                        onChange={(e) => setQty(it.id, Number(e.target.value) || 0)}
                        className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring"
                      />
                    ) : (
                      <span className="w-16 text-right text-xs text-muted-foreground">×{it.qty}</span>
                    )}
                    <span className="w-14 shrink-0 text-right text-[11px] text-muted-foreground">{unitLabel(it.unit, on ? sel[it.id] : it.qty)}</span>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{formatMoney(it.unitPrice, currency)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Guardar la selección como paquete reutilizable */}
      {savingPkg ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-3 py-2.5">
          <input
            autoFocus value={pkgName} onChange={(e) => setPkgName(e.target.value)}
            placeholder="Nombre del paquete (ej. Cubrimiento fotográfico día completo)"
            className="min-w-56 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => start(async () => {
              const r = await saveServicePackage(quoteId, pkgName, typeKey, selectedIds.map((id) => ({ catalogItemId: id, quantity: sel[id] })));
              if (r.ok) { setSavingPkg(false); setPkgName(""); } else alert(r.error);
            })}
            disabled={!pkgName.trim() || !selectedIds.length || pending}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Guardar paquete
          </button>
          <button onClick={() => setSavingPkg(false)} className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent">Cancelar</button>
        </div>
      ) : null}

      {/* Pie: resumen + agregar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-2.5">
        <span className="text-xs text-muted-foreground">
          {selectedIds.length ? <>{selectedIds.length} ítem(s) · costo {formatMoney(costSubtotal, currency)}</> : "Tilda los servicios que incluye este trabajo."}
        </span>
        <div className="flex items-center gap-2">
          {selectedIds.length && !savingPkg ? (
            <button onClick={() => setSavingPkg(true)} className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent" title="Guardar esta selección como paquete reutilizable">
              <Save className="size-3.5" /> Guardar como paquete
            </button>
          ) : null}
          <button onClick={onDone} className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">Cerrar</button>
          <button onClick={add} disabled={!selectedIds.length || pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {pending ? "Agregando…" : `Agregar ${selectedIds.length || ""} a la cotización`}
          </button>
        </div>
      </div>
    </div>
  );
}
