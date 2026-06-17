"use client";

import * as React from "react";
import { Plus, Trash2, Upload, Loader2, X } from "lucide-react";
import type { Block } from "@/lib/proposals/types";
import { PAISES, MESES } from "@/lib/proposals/calendar";
import { formatMoney } from "@/lib/ui";
import { internalCost, clientTotals, type BudgetSection } from "@/lib/proposals/budget";
import { uploadProposalImage } from "../actions";

const inputCls = "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";

// Campo de imagen: subir al NAS (devuelve URL pública) o pegar una URL externa.
function ImageField({ label, value, onChange, proposalId }: { label: string; value: string; onChange: (v: string) => void; proposalId: string }) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  async function upload(file: File) {
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("image", file);
      const res = await uploadProposalImage(proposalId, fd);
      if (res?.url) onChange(res.url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {value ? (
        <div className="relative mb-1.5 w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="max-h-24 rounded-md border border-border object-cover" />
          <button type="button" onClick={() => onChange("")} className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-background shadow ring-1 ring-border" title="Quitar"><X className="size-3" /></button>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Subir
          <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
        </label>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="o pega una URL…" className={inputCls} />
      </div>
      {err ? <span className="mt-0.5 block text-[11px] text-destructive">{err}</span> : null}
    </div>
  );
}

function Field({ label, value, onChange, area }: { label: string; value: string; onChange: (v: string) => void; area?: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {area ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={inputCls} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      )}
    </label>
  );
}

type FieldDef = { key: string; label: string; area?: boolean; num?: boolean; image?: boolean };

// Editor de una lista de objetos (tarjetas, pasos, ítems, etc.).
function ObjList({
  items,
  fields,
  onChange,
  addLabel,
  blank,
  proposalId,
}: {
  items: Record<string, unknown>[];
  fields: FieldDef[];
  onChange: (items: Record<string, unknown>[]) => void;
  addLabel: string;
  blank: Record<string, unknown>;
  proposalId?: string;
}) {
  const set = (i: number, key: string, v: unknown) => onChange(items.map((it, idx) => (idx === i ? { ...it, [key]: v } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, { ...blank }]);
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="rounded-lg border border-border bg-muted/20 p-2.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.key} className={f.area || f.image ? "sm:col-span-2" : ""}>
                {f.image && proposalId ? (
                  <ImageField label={f.label} proposalId={proposalId} value={String(it[f.key] ?? "")} onChange={(v) => set(i, f.key, v)} />
                ) : (
                  <Field
                    label={f.label}
                    area={f.area}
                    value={String(it[f.key] ?? "")}
                    onChange={(v) => set(i, f.key, f.num ? Number(v) || 0 : v)}
                  />
                )}
              </div>
            ))}
          </div>
          <button onClick={() => remove(i)} className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
            <Trash2 className="size-3.5" /> Quitar
          </button>
        </div>
      ))}
      <button onClick={add} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
        <Plus className="size-3.5" /> {addLabel}
      </button>
    </div>
  );
}

function StrList({ items, onChange, addLabel }: { items: string[]; onChange: (items: string[]) => void; addLabel: string }) {
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={it} onChange={(e) => onChange(items.map((x, idx) => (idx === i ? e.target.value : x)))} className={inputCls} />
          <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
        </div>
      ))}
      <button onClick={() => onChange([...items, ""])} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
        <Plus className="size-3.5" /> {addLabel}
      </button>
    </div>
  );
}

function BudgetEditor({ block, patch }: { block: Block; patch: (k: string, v: unknown) => void }) {
  const sections = (Array.isArray(block.sections) ? block.sections : []) as BudgetSection[];
  const iva = Number(block.iva) || 0;
  const cur = String(block.cur || "COP");
  const price = Number(block.price) || 0;
  const discountPct = Number(block.discountPct) || 0;
  const contingencyPct = Number(block.contingencyPct) || 0;
  const cost = internalCost(sections, contingencyPct);
  const basePrice = price > 0 ? price : cost.total; // compat: si no hay precio, usa el costo
  const client = clientTotals({ price: basePrice, discountPct, iva });
  const margin = basePrice - cost.total;
  const setSections = (s: BudgetSection[]) => patch("sections", s);

  const setItem = (si: number, ii: number, key: string, v: unknown) =>
    setSections(sections.map((sec, s) => (s !== si ? sec : { ...sec, items: sec.items.map((it, i) => (i !== ii ? it : { ...it, [key]: v })) })));
  const rmItem = (si: number, ii: number) => setSections(sections.map((sec, s) => (s !== si ? sec : { ...sec, items: sec.items.filter((_, i) => i !== ii) })));
  const addItem = (si: number) => setSections(sections.map((sec, s) => (s !== si ? sec : { ...sec, items: [...sec.items, { t: "Concepto", d: "", u: "servicio", q: 1, v: 0 }] })));
  const rmSec = (si: number) => setSections(sections.filter((_, s) => s !== si));
  const addSec = () => setSections([...sections, { s: "Nueva sección", items: [] }]);

  return (
    <div className="space-y-3">
      {/* Precio AL CLIENTE — lo único que ve el cliente. */}
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-semibold">Precio al cliente <span className="font-normal text-muted-foreground">· esto ve el cliente</span></p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Field label="Precio" value={String(price)} onChange={(v) => patch("price", Number(v) || 0)} />
          <Field label="Descuento (%)" value={String(discountPct)} onChange={(v) => patch("discountPct", Number(v) || 0)} />
          <Field label="IVA (%)" value={String(iva)} onChange={(v) => patch("iva", Number(v) || 0)} />
          <Field label="Moneda" value={cur} onChange={(v) => patch("cur", v)} />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={block.showIncluded !== false} onChange={(e) => patch("showIncluded", e.target.checked)} className="size-4 rounded border-input" />
          Mostrar al cliente la lista de servicios incluidos (solo nombres, sin precios)
        </label>
        <p className="text-xs text-muted-foreground">Total al cliente: <strong className="tabular-nums text-foreground">{formatMoney(client.total, cur)}</strong>{price === 0 ? " · (sin precio: usa el costo interno; pon un precio arriba)" : ""}</p>
      </div>

      {/* Costo INTERNO — del catálogo, NO se muestra al cliente. */}
      <div className="rounded-lg border border-dashed border-amber-300/60 bg-amber-50/50 p-3 text-xs dark:bg-amber-500/5">
        <p className="font-semibold text-amber-800 dark:text-amber-300">🔒 Costo interno (no lo ve el cliente)</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
          <span>Servicios: <strong className="tabular-nums text-foreground">{formatMoney(cost.items, cur)}</strong></span>
          <label className="inline-flex items-center gap-1">Transporte/imprevistos
            <input type="number" value={contingencyPct} onChange={(e) => patch("contingencyPct", Number(e.target.value) || 0)} className="w-12 rounded border border-input bg-background px-1.5 py-0.5 text-right" />%
            <span className="tabular-nums">= {formatMoney(cost.contingency, cur)}</span>
          </label>
          <span>Costo total: <strong className="tabular-nums text-foreground">{formatMoney(cost.total, cur)}</strong></span>
          <span>Margen: <strong className={margin >= 0 ? "tabular-nums text-emerald-600 dark:text-emerald-400" : "tabular-nums text-destructive"}>{formatMoney(margin, cur)}</strong></span>
        </div>
      </div>
      {sections.map((sec, si) => (
        <div key={si} className="rounded-lg border border-border p-2.5">
          <div className="flex items-center gap-2">
            <input value={sec.s} onChange={(e) => setSections(sections.map((x, s) => (s === si ? { ...x, s: e.target.value } : x)))} className={inputCls + " font-medium"} />
            <button onClick={() => rmSec(si)} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
          </div>
          <div className="mt-2 space-y-2">
            {sec.items.map((it, ii) => (
              <div key={ii} className="grid grid-cols-12 items-center gap-1.5">
                <input value={it.t} onChange={(e) => setItem(si, ii, "t", e.target.value)} placeholder="Concepto" className={inputCls + " col-span-4"} />
                <input value={it.d} onChange={(e) => setItem(si, ii, "d", e.target.value)} placeholder="Detalle" className={inputCls + " col-span-3"} />
                <input type="number" value={it.q} onChange={(e) => setItem(si, ii, "q", Number(e.target.value) || 0)} className={inputCls + " col-span-1 text-right"} />
                <input value={it.u} onChange={(e) => setItem(si, ii, "u", e.target.value)} placeholder="ud" className={inputCls + " col-span-1"} />
                <input type="number" value={it.v} onChange={(e) => setItem(si, ii, "v", Number(e.target.value) || 0)} className={inputCls + " col-span-2 text-right"} />
                <button onClick={() => rmItem(si, ii)} className="col-span-1 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
              </div>
            ))}
            <button onClick={() => addItem(si)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Plus className="size-3.5" /> Añadir ítem</button>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button onClick={addSec} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"><Plus className="size-3.5" /> Añadir sección</button>
        <span className="text-xs text-muted-foreground">Costo interno: <strong className="text-sm font-semibold tabular-nums text-foreground">{formatMoney(cost.total, cur)}</strong></span>
      </div>
      <Field label="Nota al pie" value={String(block.note || "")} onChange={(v) => patch("note", v)} area />
    </div>
  );
}

function PlanEditor({ block, patch }: { block: Block; patch: (k: string, v: unknown) => void }) {
  const cols = (Array.isArray(block.cols) ? block.cols : []) as string[];
  const rows = (Array.isArray(block.rows) ? block.rows : []) as string[][];
  const setRow = (ri: number, ci: number, v: string) => patch("rows", rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? v : c)) : r)));
  return (
    <div className="space-y-3">
      <Field label="Título" value={String(block.title || "")} onChange={(v) => patch("title", v)} />
      <Field label="Subtítulo" value={String(block.sub || "")} onChange={(v) => patch("sub", v)} />
      <div>
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Columnas (separadas por coma)</span>
        <input value={cols.join(", ")} onChange={(e) => patch("cols", e.target.value.split(",").map((s) => s.trim()))} className={inputCls} />
      </div>
      <div className="space-y-1.5">
        {rows.map((r, ri) => (
          <div key={ri} className="flex items-center gap-1.5">
            {cols.map((_, ci) => (
              <input key={ci} value={r[ci] ?? ""} onChange={(e) => setRow(ri, ci, e.target.value)} className={inputCls} />
            ))}
            <button onClick={() => patch("rows", rows.filter((_, i) => i !== ri))} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
          </div>
        ))}
        <button onClick={() => patch("rows", [...rows, cols.map(() => "")])} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"><Plus className="size-3.5" /> Añadir fila</button>
      </div>
    </div>
  );
}

// Panel de edición según el tipo de bloque. Muta una copia y llama onChange.
export function BlockEditPanel({ block, onChange, proposalId }: { block: Block; onChange: (b: Block) => void; proposalId: string }) {
  const patch = (k: string, v: unknown) => onChange({ ...block, [k]: v });
  const items = (Array.isArray(block.items) ? block.items : []) as Record<string, unknown>[];

  switch (block.type) {
    case "hero":
      return (
        <div className="space-y-3">
          <Field label="Título" value={String(block.title || "")} onChange={(v) => patch("title", v)} />
          <Field label="Subtítulo" value={String(block.subtitle || "")} onChange={(v) => patch("subtitle", v)} area />
          <ImageField label="Imagen de fondo (opcional)" proposalId={proposalId} value={String(block.bg || "")} onChange={(v) => patch("bg", v)} />
        </div>
      );
    case "text":
      return (
        <div className="space-y-3">
          <Field label="Título" value={String(block.title || "")} onChange={(v) => patch("title", v)} />
          <Field label="Contenido (admite HTML simple)" value={String(block.body || "")} onChange={(v) => patch("body", v)} area />
        </div>
      );
    case "cards":
      return (
        <div className="space-y-3">
          <Field label="Título" value={String(block.title || "")} onChange={(v) => patch("title", v)} />
          <ObjList items={items} onChange={(it) => patch("items", it)} addLabel="Añadir tarjeta" blank={{ icon: "✦", t: "Elemento", d: "Descripción." }}
            fields={[{ key: "icon", label: "Icono" }, { key: "t", label: "Título" }, { key: "d", label: "Descripción", area: true }]} />
        </div>
      );
    case "stats":
      return (
        <div className="space-y-3">
          <Field label="Título" value={String(block.title || "")} onChange={(v) => patch("title", v)} />
          <ObjList items={items} onChange={(it) => patch("items", it)} addLabel="Añadir dato" blank={{ n: "00%", p: "frase", f: "Fuente" }}
            fields={[{ key: "n", label: "Número" }, { key: "f", label: "Fuente" }, { key: "p", label: "Frase", area: true }]} />
        </div>
      );
    case "timeline":
      return (
        <div className="space-y-3">
          <Field label="Título" value={String(block.title || "")} onChange={(v) => patch("title", v)} />
          <ObjList items={(Array.isArray(block.steps) ? block.steps : []) as Record<string, unknown>[]} onChange={(it) => patch("steps", it)} addLabel="Añadir fase" blank={{ phase: "Fase", dur: "Semana", desc: "Descripción." }}
            fields={[{ key: "phase", label: "Fase" }, { key: "dur", label: "Duración" }, { key: "desc", label: "Descripción", area: true }]} />
        </div>
      );
    case "pricing":
      return (
        <div className="space-y-3">
          <Field label="Título" value={String(block.title || "")} onChange={(v) => patch("title", v)} />
          <ObjList items={(Array.isArray(block.rows) ? block.rows : []) as Record<string, unknown>[]} onChange={(it) => patch("rows", it)} addLabel="Añadir línea" blank={{ c: "Concepto", d: "Detalle", p: "$" }}
            fields={[{ key: "c", label: "Concepto" }, { key: "p", label: "Precio" }, { key: "d", label: "Detalle", area: true }]} />
          <Field label="Total" value={String(block.total || "")} onChange={(v) => patch("total", v)} />
          <Field label="Nota" value={String(block.note || "")} onChange={(v) => patch("note", v)} />
        </div>
      );
    case "budget":
      return (
        <div className="space-y-3">
          <Field label="Título" value={String(block.title || "")} onChange={(v) => patch("title", v)} />
          <Field label="Subtítulo" value={String(block.sub || "")} onChange={(v) => patch("sub", v)} />
          <BudgetEditor block={block} patch={patch} />
        </div>
      );
    case "plan":
      return <PlanEditor block={block} patch={patch} />;
    case "calendar":
      return (
        <div className="space-y-3">
          <Field label="Título" value={String(block.title || "")} onChange={(v) => patch("title", v)} />
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">País</span>
              <select value={String(block.pais || "Colombia")} onChange={(e) => patch("pais", e.target.value)} className={inputCls}>
                {PAISES.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Mes</span>
              <select value={String(block.mes || "Enero")} onChange={(e) => patch("mes", e.target.value)} className={inputCls}>
                {MESES.map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </label>
          </div>
        </div>
      );
    case "cta":
      return (
        <div className="space-y-3">
          <Field label="Título" value={String(block.title || "")} onChange={(v) => patch("title", v)} />
          <Field label="Subtítulo" value={String(block.sub || "")} onChange={(v) => patch("sub", v)} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Texto del botón" value={String(block.btn || "")} onChange={(v) => patch("btn", v)} />
            <Field label="Email de contacto" value={String(block.email || "")} onChange={(v) => patch("email", v)} />
          </div>
        </div>
      );
    case "video":
      return (
        <div className="space-y-3">
          <Field label="URL del video (YouTube, Vimeo o MP4)" value={String(block.url || "")} onChange={(v) => patch("url", v)} />
          <Field label="Descripción" value={String(block.caption || "")} onChange={(v) => patch("caption", v)} />
        </div>
      );
    case "fullvideo":
      return (
        <div className="space-y-3">
          <Field label="Título" value={String(block.title || "")} onChange={(v) => patch("title", v)} />
          <Field label="URL del video" value={String(block.url || "")} onChange={(v) => patch("url", v)} />
        </div>
      );
    case "carousel":
      return (
        <div className="space-y-3">
          <Field label="Título" value={String(block.title || "")} onChange={(v) => patch("title", v)} />
          <Field label="Subtítulo" value={String(block.sub || "")} onChange={(v) => patch("sub", v)} />
          <ObjList items={items} proposalId={proposalId} onChange={(it) => patch("items", it)} addLabel="Añadir slide" blank={{ img: "", t: "Slide", d: "Descripción." }}
            fields={[{ key: "img", label: "Imagen", image: true }, { key: "t", label: "Título" }, { key: "d", label: "Descripción", area: true }]} />
        </div>
      );
    case "acc":
      return (
        <div className="space-y-3">
          <Field label="Título" value={String(block.title || "")} onChange={(v) => patch("title", v)} />
          <ObjList items={items} onChange={(it) => patch("items", it)} addLabel="Añadir pregunta" blank={{ q: "Pregunta", a: "Respuesta." }}
            fields={[{ key: "q", label: "Pregunta" }, { key: "a", label: "Respuesta", area: true }]} />
        </div>
      );
    case "logos":
      return (
        <div className="space-y-3">
          <Field label="Título" value={String(block.title || "")} onChange={(v) => patch("title", v)} />
          <StrList items={(Array.isArray(block.items) ? block.items : []) as string[]} onChange={(it) => patch("items", it)} addLabel="Añadir marca" />
        </div>
      );
    case "styles":
      return (
        <div className="space-y-3">
          <Field label="Título" value={String(block.title || "")} onChange={(v) => patch("title", v)} />
          <ObjList items={items} onChange={(it) => patch("items", it)} addLabel="Añadir estilo" blank={{ icon: "🎥", t: "Estilo", d: "Descripción.", url: "" }}
            fields={[{ key: "icon", label: "Icono" }, { key: "t", label: "Título" }, { key: "d", label: "Descripción", area: true }, { key: "url", label: "URL de video" }]} />
        </div>
      );
    default:
      return <p className="text-sm text-muted-foreground">Este bloque no tiene edición rápida.</p>;
  }
}
