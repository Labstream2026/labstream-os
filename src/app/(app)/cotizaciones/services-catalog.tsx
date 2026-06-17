"use client";

import * as React from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/ui";
import type { CatalogGroup } from "@/lib/services-catalog";
import { createServiceItem, updateServiceItem, deleteServiceItem, addServiceSection, setQuoteSettings } from "./servicios-actions";

type Settings = { iva: number; contingencyPct: number; contingencyLabel: string };

const inputCls = "rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";

export function ServicesCatalog({ groups, settings, canEdit }: { groups: CatalogGroup[]; settings: Settings; canEdit: boolean }) {
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<void>) => start(() => { void fn(); });

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
        🔒 Catálogo <strong>interno</strong>: estos valores son nuestros costos y <strong>no se muestran al cliente</strong>. En la propuesta, el cliente solo ve el precio con <strong>% de descuento</strong> e <strong>IVA</strong>.
      </p>

      {/* Ajustes globales: transporte/imprevistos e IVA por defecto */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
        <Field label="IVA por defecto (%)">
          <input type="number" min={0} max={100} defaultValue={settings.iva} disabled={!canEdit}
            onBlur={(e) => run(() => setQuoteSettings({ iva: Number(e.target.value) }))} className={inputCls} />
        </Field>
        <Field label="Transporte e imprevistos — etiqueta">
          <input defaultValue={settings.contingencyLabel} disabled={!canEdit}
            onBlur={(e) => run(() => setQuoteSettings({ contingencyLabel: e.target.value }))} className={inputCls} />
        </Field>
        <Field label="Transporte e imprevistos (%)">
          <input type="number" min={0} max={100} step="0.5" defaultValue={settings.contingencyPct} disabled={!canEdit}
            onBlur={(e) => run(() => setQuoteSettings({ contingencyPct: Number(e.target.value) }))} className={inputCls} />
        </Field>
      </div>

      {groups.map((g) => (
        <section key={g.key} className="overflow-hidden rounded-xl border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
            <span className="text-lg">{g.icon}</span>
            <h3 className="text-sm font-semibold">{g.label}</h3>
          </header>
          <div className="divide-y divide-border">
            {g.sections.map((sec) => (
              <div key={sec.name} className="px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{sec.name}</p>
                  {canEdit ? (
                    <button onClick={() => run(() => createServiceItem(g.key, sec.name))} disabled={pending}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-accent disabled:opacity-50">
                      <Plus className="size-3" /> Servicio
                    </button>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  {sec.items.map((it) => (
                    <div key={it.id} className="flex flex-wrap items-center gap-2">
                      <input defaultValue={it.name} disabled={!canEdit} title="Servicio"
                        onBlur={(e) => e.target.value !== it.name && run(() => updateServiceItem(it.id, { name: e.target.value }))}
                        className={`${inputCls} min-w-44 flex-1 font-medium`} />
                      <input defaultValue={it.unit} disabled={!canEdit} title="Unidad"
                        onBlur={(e) => e.target.value !== it.unit && run(() => updateServiceItem(it.id, { unit: e.target.value }))}
                        className={`${inputCls} w-24`} />
                      <span className="text-xs text-muted-foreground">valor</span>
                      <input type="number" min={0} defaultValue={it.unitPrice} disabled={!canEdit} title="Costo unitario interno (COP)"
                        onBlur={(e) => Number(e.target.value) !== it.unitPrice && run(() => updateServiceItem(it.id, { unitPrice: Number(e.target.value) }))}
                        className={`${inputCls} w-32 text-right tabular-nums`} />
                      <span className="w-24 text-right text-xs tabular-nums text-muted-foreground">{formatMoney(it.unitPrice)}</span>
                      {canEdit ? (
                        <button onClick={() => run(() => deleteServiceItem(it.id))} disabled={pending} title="Eliminar"
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">
                          <Trash2 className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {canEdit ? <AddSection serviceType={g.key} onAdd={(name) => run(() => addServiceSection(g.key, name))} /> : null}
          </div>
        </section>
      ))}

      {pending ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Guardando…</p>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function AddSection({ onAdd }: { serviceType: string; onAdd: (name: string) => void }) {
  const [name, setName] = React.useState("");
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) { onAdd(name.trim()); setName(""); } }}
      className="flex items-center gap-2 px-4 py-2.5"
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva sección…" className={`${inputCls} w-48`} />
      <button type="submit" disabled={!name.trim()} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50">
        <Plus className="size-3" /> Sección
      </button>
    </form>
  );
}
