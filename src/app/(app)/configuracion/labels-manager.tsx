"use client";

import { ChevronDown, ChevronUp, Trash2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONES, tone } from "@/lib/colors";
import {
  addLabel,
  renameLabel,
  setLabelColor,
  setLabelDefault,
  toggleLabelDone,
  moveLabel,
  deleteLabel,
} from "./workflow-actions";

type Row = { id: string; key: string; label: string; color: string; isDefault: boolean; isDone: boolean };
type Kind = "TASK_STATUS" | "TASK_PRIORITY";

export function LabelsManager({ kind, title, hint, rows }: { kind: Kind; title: string; hint: string; rows: Row[] }) {
  const isStatus = kind === "TASK_STATUS";
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{hint}</p>

      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
            {/* Vista previa del chip */}
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", tone(r.color).chip)}>
              {r.label || "—"}
            </span>

            {/* Renombrar */}
            <form action={renameLabel.bind(null, r.id)} className="flex-1">
              <input
                name="label"
                defaultValue={r.label}
                onBlur={(e) => { if (e.target.value.trim() && e.target.value !== r.label) e.target.form?.requestSubmit(); }}
                className="w-full min-w-28 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </form>

            {/* Color */}
            <select
              defaultValue={r.color}
              onChange={(e) => setLabelColor(r.id, e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              title="Color"
            >
              {TONES.map((t) => (<option key={t.key} value={t.key}>{t.label}</option>))}
            </select>

            {/* Por defecto */}
            <form action={setLabelDefault.bind(null, r.id)}>
              <button
                title={r.isDefault ? "Valor por defecto" : "Marcar como valor por defecto"}
                className={cn("rounded-md p-1.5", r.isDefault ? "text-amber-500" : "text-muted-foreground hover:text-foreground")}
              >
                <Star className={cn("size-4", r.isDefault && "fill-amber-400")} />
              </button>
            </form>

            {/* Terminado (solo estados) */}
            {isStatus ? (
              <form action={toggleLabelDone.bind(null, r.id)}>
                <button
                  title={r.isDone ? "Cuenta como terminada (sale de «Mis tareas»)" : "Marcar como estado de cierre"}
                  className={cn("rounded-md px-2 py-1 text-[11px] font-medium", r.isDone ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted text-muted-foreground hover:text-foreground")}
                >
                  {r.isDone ? "Terminada" : "Abierta"}
                </button>
              </form>
            ) : null}

            {/* Reordenar */}
            <div className="flex items-center">
              <form action={moveLabel.bind(null, r.id, -1)}>
                <button disabled={i === 0} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Subir"><ChevronUp className="size-4" /></button>
              </form>
              <form action={moveLabel.bind(null, r.id, 1)}>
                <button disabled={i === rows.length - 1} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Bajar"><ChevronDown className="size-4" /></button>
              </form>
            </div>

            {/* Eliminar */}
            <form action={deleteLabel.bind(null, r.id)}>
              <button
                disabled={rows.length <= 1}
                className="rounded-md p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-30"
                title="Eliminar"
              >
                <Trash2 className="size-4" />
              </button>
            </form>
          </div>
        ))}
      </div>

      {/* Añadir */}
      <form action={addLabel.bind(null, kind)} className="mt-3 flex flex-wrap items-center gap-2">
        <input name="label" required placeholder={isStatus ? "Nuevo estado" : "Nueva prioridad"} className="min-w-40 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <select name="color" defaultValue="slate" className="rounded-md border border-input bg-background px-2 py-1.5 text-xs">
          {TONES.map((t) => (<option key={t.key} value={t.key}>{t.label}</option>))}
        </select>
        <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Añadir</button>
      </form>
    </div>
  );
}
