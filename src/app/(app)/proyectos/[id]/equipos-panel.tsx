"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Trash2, Search, Package, AlertTriangle, Check, X, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmojiSelect } from "@/components/emoji-select";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  createPlan, updatePlan, deletePlan, setPlanStatus, setPlanAssignee,
  addReservation, setReservationQuantity, removeReservation, togglePacked,
  applyKit, savePlanAsKit,
} from "./equipos-actions";

// ── Tipos serializables que llegan del servidor ──
export type EqItem = { rowId: string; name: string; category: string | null; brand: string | null; serial: string | null; photoUrl: string | null; tags: string[]; quantity: number };

// Etiqueta de modelo: marca + nombre (ej. "Sony" + "ZV-E1" = "Sony ZV-E1"), sin duplicar la
// marca si el nombre ya la incluye.
function modelLabel(it: { name: string; brand: string | null }): string {
  const b = it.brand?.trim();
  if (b && !it.name.toLowerCase().includes(b.toLowerCase())) return `${b} ${it.name}`;
  return it.name;
}
export type EqReservation = { id: string; rowId: string; quantity: number; packed: boolean };
export type EqPlan = {
  id: string;
  title: string | null;
  shootDate: string; // ISO
  status: string;
  assigneeId: string | null;
  reservations: EqReservation[];
  // rowId → unidades ya reservadas ESE día en otras grabaciones (para disponibilidad).
  reserved: Record<string, { qty: number; where: string[] }>;
};
export type EqKit = { id: string; name: string; emoji: string | null; itemCount: number };
export type EqMember = { id: string; name: string; initials: string | null; color: string | null };

const STATUSES: { key: string; label: string; cls: string }[] = [
  { key: "planeando", label: "Planeando", cls: "bg-muted text-muted-foreground" },
  { key: "listo", label: "Listo", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  { key: "entregado", label: "En grabación", cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  { key: "devuelto", label: "Devuelto", cls: "bg-slate-200 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300" },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
function dateInputValue(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function EquiposPanel({
  projectId, plans, inventory, tags, kits, team, canWrite,
}: {
  projectId: string;
  plans: EqPlan[];
  inventory: EqItem[];
  tags: { id: string; label: string; color: string }[];
  kits: EqKit[];
  team: EqMember[];
  canWrite: boolean;
}) {
  const [pending, startTransition] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  // Ejecuta una server action sin tumbar la página: startTransition NO atrapa los rechazos,
  // así que envolvemos en try/catch y mostramos el error en un aviso (p. ej. acción caducada
  // tras un deploy, o falta de permiso).
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      try { setErr(null); await fn(); }
      catch (e) { setErr(e instanceof Error ? e.message : "No se pudo completar la acción."); }
    });
  const itemsByRow = React.useMemo(() => Object.fromEntries(inventory.map((i) => [i.rowId, i])), [inventory]);

  return (
    <div className="space-y-5">
      {err ? (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{err}</span>
          <button onClick={() => setErr(null)} className="shrink-0 font-medium hover:underline">Cerrar</button>
        </div>
      ) : null}
      <div>
        <p className="text-sm text-muted-foreground">
          Arma las <strong>grabaciones</strong> del proyecto con su fecha y elige del{" "}
          <Link href="/wiki/inventario" className="text-primary hover:underline">inventario</Link> qué equipos llevar.
          Verás cuáles están <strong>libres ese día</strong> y podrás asignar a alguien la preparación.
        </p>
      </div>

      {/* Nueva grabación */}
      {canWrite ? (
        <form
          action={createPlan.bind(null, projectId)}
          className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3 shadow-sm"
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Nombre (opcional)
            <input name="title" placeholder="Ej. Grabación reels — locación norte" className="min-w-56 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Fecha de grabación
            <input name="shootDate" type="date" required className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            + Nueva grabación
          </button>
        </form>
      ) : null}

      {plans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <Package className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">Aún no hay grabaciones con equipos. Crea una arriba con su fecha.</p>
        </div>
      ) : null}

      <div className="space-y-4">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} itemsByRow={itemsByRow} inventory={inventory} tags={tags} kits={kits} team={team} canWrite={canWrite} run={run} pending={pending} />
        ))}
      </div>
    </div>
  );
}

function PlanCard({
  plan, itemsByRow, inventory, tags, kits, team, canWrite, run, pending,
}: {
  plan: EqPlan;
  itemsByRow: Record<string, EqItem>;
  inventory: EqItem[];
  tags: { id: string; label: string; color: string }[];
  kits: EqKit[];
  team: EqMember[];
  canWrite: boolean;
  run: (fn: () => Promise<unknown>) => void;
  pending: boolean;
}) {
  const [adding, setAdding] = React.useState(false);
  const [savingKit, setSavingKit] = React.useState(false);
  const [openSerial, setOpenSerial] = React.useState<string | null>(null); // id de reserva con el serial visible
  const { confirm, dialog } = useConfirmDialog();
  const status = STATUSES.find((s) => s.key === plan.status) ?? STATUSES[0];
  const reservedRows = new Set(plan.reservations.map((r) => r.rowId));
  const packedCount = plan.reservations.filter((r) => r.packed).length;

  // Disponibilidad ese día para un equipo: total − reservado en otras grabaciones.
  const availOf = (it: EqItem) => it.quantity - (plan.reserved[it.rowId]?.qty ?? 0);
  // Reservado en ESTE plan por equipo (el mapa de conflictos solo cuenta OTROS planes):
  // sin esto, agregas las 3 luces y el contador seguía diciendo «3 de 3 libres».
  const ownQty = new Map<string, number>();
  for (const res of plan.reservations) ownQty.set(res.rowId, (ownQty.get(res.rowId) ?? 0) + res.quantity);
  const freeOf = (it: EqItem) => Math.max(0, availOf(it) - (ownQty.get(it.rowId) ?? 0));

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {dialog}
      {/* Cabecera del plan */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <div className="min-w-0 flex-1">
          {canWrite ? (
            <input
              defaultValue={plan.title ?? ""}
              placeholder="Sin título"
              onBlur={(e) => { if (e.target.value !== (plan.title ?? "")) { const fd = new FormData(); fd.set("title", e.target.value); run(() => updatePlan(plan.id, fd)); } }}
              className="w-full truncate rounded-md bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:bg-muted focus:bg-muted"
            />
          ) : (
            <p className="truncate px-1 text-sm font-semibold">{plan.title || "Grabación"}</p>
          )}
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            {canWrite ? (
              <input
                type="date"
                defaultValue={dateInputValue(plan.shootDate)}
                onChange={(e) => { if (e.target.value) { const fd = new FormData(); fd.set("shootDate", e.target.value); fd.set("title", plan.title ?? ""); run(() => updatePlan(plan.id, fd)); } }}
                className="rounded bg-transparent text-xs outline-none hover:bg-muted"
              />
            ) : (
              <span>📅 {fmtDate(plan.shootDate)}</span>
            )}
            <span>· {plan.reservations.length} equipos · {packedCount}/{plan.reservations.length} listos</span>
          </div>
        </div>

        {/* Estado */}
        <select
          value={plan.status}
          disabled={!canWrite || pending}
          onChange={(e) => run(() => setPlanStatus(plan.id, e.target.value))}
          className={cn("cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium outline-none disabled:opacity-60", status.cls)}
        >
          {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        {/* Responsable */}
        <select
          value={plan.assigneeId ?? ""}
          disabled={!canWrite || pending}
          onChange={(e) => run(() => setPlanAssignee(plan.id, e.target.value))}
          title="Responsable de tener los equipos listos"
          className="cursor-pointer rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        >
          <option value="">👤 Sin responsable</option>
          {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>

        {canWrite ? (
          <button
            type="button"
            onClick={async () => { if (await confirm({ title: "Eliminar grabación", message: "¿Eliminar esta grabación y su checklist de equipos?", confirmLabel: "Eliminar", danger: true })) run(() => deletePlan(plan.id)); }}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Eliminar grabación"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>

      {/* Checklist de equipos */}
      <div className="divide-y divide-border">
        {plan.reservations.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">Sin equipos. Agrega abajo según lo que necesites.</p>
        ) : (
          plan.reservations.map((r) => {
            const it = itemsByRow[r.rowId];
            if (!it) return null;
            const avail = availOf(it);
            const conflict = r.quantity > avail;
            const where = plan.reserved[r.rowId]?.where ?? [];
            return (
              <div key={r.id} className="flex items-center gap-3 p-2.5">
                <button
                  type="button"
                  onClick={() => run(() => togglePacked(r.id, !r.packed))}
                  className={cn("flex size-5 shrink-0 items-center justify-center rounded border", r.packed ? "border-emerald-500 bg-emerald-500 text-white" : "border-input hover:border-primary")}
                  title={r.packed ? "Listo / empacado" : "Marcar como listo"}
                >
                  {r.packed ? <Check className="size-3.5" /> : null}
                </button>

                <div className="min-w-0 flex-1">
                  {/* Clic en el nombre → muestra/oculta el serial del equipo. */}
                  <button
                    type="button"
                    onClick={() => setOpenSerial((cur) => (cur === r.id ? null : r.id))}
                    className={cn("block max-w-full truncate text-left text-sm font-medium hover:underline", r.packed && "text-muted-foreground line-through")}
                    title="Ver serial"
                  >
                    {modelLabel(it)}
                  </button>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {it.category ? <span className="rounded bg-muted px-1.5 py-0.5">{it.category}</span> : null}
                    {conflict ? (
                      <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive">
                        <AlertTriangle className="size-3" /> Solo {Math.max(0, avail)} libre(s) ese día{where.length ? ` · ya en ${where.join(", ")}` : ""}
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">{freeOf(it)} libre(s) de {it.quantity}{(ownQty.get(it.rowId) ?? 0) > 0 ? ` · ${ownQty.get(it.rowId)} en este plan` : ""}</span>
                    )}
                  </div>
                  {openSerial === r.id ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Serial: <span className="font-mono">{it.serial || "—"}</span></p>
                  ) : null}
                </div>

                {/* Cantidad */}
                <div className="flex items-center gap-1">
                  <button type="button" disabled={!canWrite || r.quantity <= 1} onClick={() => run(() => setReservationQuantity(r.id, r.quantity - 1))} className="size-6 rounded border border-input text-sm leading-none hover:bg-muted disabled:opacity-40">−</button>
                  <span className="w-6 text-center text-sm tabular-nums">{r.quantity}</span>
                  <button type="button" disabled={!canWrite} onClick={() => run(() => setReservationQuantity(r.id, r.quantity + 1))} className="size-6 rounded border border-input text-sm leading-none hover:bg-muted disabled:opacity-40">+</button>
                </div>

                {canWrite ? (
                  <button type="button" onClick={() => run(() => removeReservation(r.id))} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Quitar">
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {/* Acciones del plan */}
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 p-2.5">
          <button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-3.5" /> Agregar equipos
          </button>

          {kits.length ? (
            <select
              defaultValue=""
              onChange={(e) => { if (e.target.value) { const id = e.target.value; e.currentTarget.value = ""; run(() => applyKit(plan.id, id)); } }}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none"
              title="Aplicar un kit guardado"
            >
              <option value="">📦 Aplicar kit…</option>
              {kits.map((k) => <option key={k.id} value={k.id}>{k.emoji ?? "🎒"} {k.name} ({k.itemCount})</option>)}
            </select>
          ) : null}

          {plan.reservations.length ? (
            <button type="button" onClick={() => setSavingKit((v) => !v)} className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <Save className="size-3.5" /> Guardar como kit
            </button>
          ) : null}
        </div>
      ) : null}

      {savingKit ? <SaveKitForm planId={plan.id} onDone={() => setSavingKit(false)} /> : null}

      {/* Selector de inventario */}
      {adding ? (
        <AddPicker
          plan={plan}
          inventory={inventory}
          tags={tags}
          reservedRows={reservedRows}
          availOf={availOf}
          ownQty={ownQty}
          onAdd={(rowId) => run(() => addReservation(plan.id, rowId, 1))}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </div>
  );
}

function SaveKitForm({ planId, onDone }: { planId: string; onDone: () => void }) {
  const [error, setError] = React.useState<string | null>(null);
  return (
    <form
      action={async (fd) => { const res = await savePlanAsKit(planId, fd); if (res.ok) onDone(); else setError(res.error ?? "No se pudo guardar."); }}
      className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 p-2.5"
    >
      <EmojiSelect name="emoji" defaultValue="🎒" fallback="🎒" />
      <input name="name" autoFocus placeholder="Nombre del kit (ej. Kit Reels)" className="min-w-48 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
      <button className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Guardar kit</button>
      <button type="button" onClick={onDone} className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted">Cancelar</button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </form>
  );
}

function AddPicker({
  plan, inventory, tags, reservedRows, availOf, ownQty, onAdd, onClose,
}: {
  plan: EqPlan;
  inventory: EqItem[];
  tags: { id: string; label: string; color: string }[];
  reservedRows: Set<string>;
  availOf: (it: EqItem) => number;
  ownQty: Map<string, number>;
  onAdd: (rowId: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = React.useState("");
  const [activeTags, setActiveTags] = React.useState<string[]>([]);
  const query = q.trim().toLowerCase();

  const filtered = inventory.filter((it) => {
    if (query && !(`${it.name} ${it.category ?? ""} ${it.brand ?? ""} ${it.tags.join(" ")}`.toLowerCase().includes(query))) return false;
    if (activeTags.length && !activeTags.every((t) => it.tags.includes(t))) return false;
    return true;
  });

  return (
    <div className="border-t border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="Buscar equipo…" className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <button type="button" onClick={onClose} className="rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted">Cerrar</button>
      </div>

      {/* Filtro por tags (grupos: streaming, grabación, reels…) */}
      {tags.length ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const on = activeTags.includes(t.label);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTags((cur) => (on ? cur.filter((x) => x !== t.label) : [...cur, t.label]))}
                className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent")}
              >
                #{t.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="max-h-72 space-y-1 overflow-y-auto overscroll-contain">
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Sin equipos. {inventory.length === 0 ? <>Agrega equipos en el <Link href="/wiki/inventario" className="text-primary hover:underline">inventario</Link>.</> : "Prueba con otra búsqueda o tag."}
          </p>
        ) : (
          filtered.map((it) => {
            const already = reservedRows.has(it.rowId);
            const avail = availOf(it);
            const where = plan.reserved[it.rowId]?.where ?? [];
            return (
              <button
                key={it.rowId}
                type="button"
                disabled={already}
                onClick={() => onAdd(it.rowId)}
                className={cn("flex w-full items-center gap-3 rounded-lg border border-transparent p-2 text-left hover:border-border hover:bg-card disabled:opacity-50", already && "cursor-default")}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                  <Package className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{modelLabel(it)}</p>
                  <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    {it.category ? <span>{it.category}</span> : null}
                    {it.serial ? <span className="font-mono">· {it.serial}</span> : null}
                    {it.tags.slice(0, 3).map((t) => <span key={t} className="rounded bg-muted px-1 py-0.5">#{t}</span>)}
                  </div>
                </div>
                <span className={cn("shrink-0 text-[11px] font-medium", avail - (ownQty.get(it.rowId) ?? 0) <= 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                  {(() => {
                    const own = ownQty.get(it.rowId) ?? 0;
                    const free = Math.max(0, avail - own);
                    if (free <= 0) return own > 0 ? `0/${it.quantity} · ${own} en este plan` : where.length ? `ocupado · ${where[0]}` : "ocupado ese día";
                    return `${free}/${it.quantity} libres${own > 0 ? ` · ${own} en este plan` : ""}`;
                  })()}
                </span>
                {already ? <Check className="size-4 shrink-0 text-emerald-500" /> : <Plus className="size-4 shrink-0 text-muted-foreground" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
