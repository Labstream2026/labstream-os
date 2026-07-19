"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Trash2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
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
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [newLabel, setNewLabel] = React.useState("");
  const [newColor, setNewColor] = React.useState("slate");
  const [err, setErr] = React.useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  // Ejecuta una acción y refresca al instante. Si la acción devuelve {ok:false} (o lanza), muestra
  // el error EN LÍNEA en vez de tumbar la página — nunca escapa un error al límite de la app.
  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null);
    start(async () => {
      try {
        const r = await fn();
        if (r && r.ok === false) { setErr(r.error ?? "No se pudo aplicar el cambio."); return; }
        router.refresh();
      } catch (e) {
        setErr("No se pudo aplicar el cambio. Reintenta.");
      }
    });
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 shadow-sm", pending && "opacity-80")}>
      {dialog}
      <h3 className="font-semibold">{title}</h3>
      <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{hint}</p>
      {err ? <p className="mb-2 text-xs text-destructive">{err}</p> : null}

      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
            {/* Vista previa del chip */}
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", tone(r.color).chip)}>
              {r.label || "—"}
            </span>

            {/* Renombrar (se guarda al salir del campo o con Enter) */}
            <input
              defaultValue={r.label}
              disabled={pending}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== r.label) {
                  const fd = new FormData();
                  fd.set("label", v);
                  run(() => renameLabel(r.id, fd));
                }
              }}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              className="w-full min-w-28 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
            />

            {/* Color */}
            <select
              value={r.color}
              disabled={pending}
              onChange={(e) => run(() => setLabelColor(r.id, e.target.value))}
              className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              title="Color"
            >
              {TONES.map((t) => (<option key={t.key} value={t.key}>{t.label}</option>))}
            </select>

            {/* Por defecto */}
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => setLabelDefault(r.id))}
              title={r.isDefault ? "Valor por defecto" : "Marcar como valor por defecto"}
              className={cn("rounded-md p-1.5", r.isDefault ? "text-amber-500" : "text-muted-foreground hover:text-foreground")}
            >
              <Star className={cn("size-4", r.isDefault && "fill-amber-400")} />
            </button>

            {/* Terminado (solo estados) */}
            {isStatus ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => toggleLabelDone(r.id))}
                title={r.isDone ? "Cuenta como terminada (sale de «Mis tareas»)" : "Marcar como estado de cierre"}
                className={cn("rounded-md px-2 py-1 text-[11px] font-medium", r.isDone ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-muted text-muted-foreground hover:text-foreground")}
              >
                {r.isDone ? "Terminada" : "Abierta"}
              </button>
            ) : null}

            {/* Reordenar */}
            <div className="flex items-center">
              <button type="button" disabled={pending || i === 0} onClick={() => run(() => moveLabel(r.id, -1))} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Subir"><ChevronUp className="size-4" /></button>
              <button type="button" disabled={pending || i === rows.length - 1} onClick={() => run(() => moveLabel(r.id, 1))} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Bajar"><ChevronDown className="size-4" /></button>
            </div>

            {/* Eliminar */}
            <button
              type="button"
              disabled={pending || rows.length <= 1}
              onClick={async () => { if (await confirm({ message: `¿Eliminar «${r.label}»? Las tareas que lo usaban pasan al valor por defecto.`, confirmLabel: "Eliminar", danger: true })) run(() => deleteLabel(r.id)); }}
              className="rounded-md p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-30"
              title="Eliminar"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Añadir */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = newLabel.trim();
          if (!v) return;
          const fd = new FormData();
          fd.set("label", v);
          fd.set("color", newColor);
          setNewLabel("");
          run(() => addLabel(kind, fd));
        }}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={isStatus ? "Nuevo estado" : "Nueva prioridad"} className="min-w-40 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <select value={newColor} onChange={(e) => setNewColor(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-xs">
          {TONES.map((t) => (<option key={t.key} value={t.key}>{t.label}</option>))}
        </select>
        <button type="submit" disabled={pending || !newLabel.trim()} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Añadir</button>
      </form>
    </div>
  );
}
