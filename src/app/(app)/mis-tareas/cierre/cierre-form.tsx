"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Minus, Plus, Sparkles } from "lucide-react";
import { EntityEmoji } from "@/components/icons/marks";
import type { TareaDelDia } from "@/lib/cierre/datos";
import { cn } from "@/lib/utils";

// El reparto editable del cierre: cada tarea con su sugerencia (y el PORQUÉ), pasos de
// ±15 min, total vivo contra lo que falta, y un solo botón que anota todo.

const PASO = 15;

function fmt(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export function CierreForm({ tareas, restanteMin, conSensor, accion }: {
  tareas: TareaDelDia[];
  restanteMin: number;
  conSensor: boolean;
  accion: (fd: FormData) => Promise<{ ok: boolean; error?: string; resumen?: string }>;
}) {
  const router = useRouter();
  const [min, setMin] = React.useState<Record<string, number>>(
    () => Object.fromEntries(tareas.map((t) => [t.id, t.sugeridoMin])),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [listo, setListo] = React.useState<string | null>(null);
  const [pendiente, arranca] = React.useTransition();

  const total = Object.values(min).reduce((s, m) => s + (m || 0), 0);
  const pone = (id: string, v: number) => setMin((m) => ({ ...m, [id]: Math.max(0, Math.min(720, Math.round(v))) }));

  const enviar = () => {
    setError(null);
    const fd = new FormData();
    for (const [id, m] of Object.entries(min)) if (m > 0) fd.set(`min-${id}`, String(m));
    arranca(async () => {
      const r = await accion(fd);
      if (!r.ok) { setError(r.error ?? "No se pudo anotar."); return; }
      setListo(r.resumen ?? "Anotado.");
      router.refresh();
    });
  };

  if (listo) {
    return (
      <div className="rounded-xl border border-emerald-300/60 bg-emerald-50 p-8 text-center dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <Check className="mx-auto size-8 text-emerald-600 dark:text-emerald-400" />
        <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{listo}</p>
        <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">
          Quedó en el parte de horas de cada tarea, como lo del cronómetro.
        </p>
      </div>
    );
  }

  if (tareas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No tienes tareas abiertas ni completadas hoy donde anotar horas.
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {tareas.map((t, i) => (
          <div key={t.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3", i > 0 && "border-t border-border")}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {t.completadaHoy ? <span title="completada hoy" className="mr-1 text-emerald-600 dark:text-emerald-400">✓</span> : null}
                {t.titulo}
                {t.venceHoy && !t.completadaHoy ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">entrega hoy</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t.proyecto ? <><EntityEmoji value={t.emoji} fallback="🎬" /> {t.proyecto}{t.cliente ? ` · ${t.cliente}` : ""}</> : "Tarea personal"}
                {t.yaMin > 0 ? <span className="text-emerald-600 dark:text-emerald-400"> · ya llevas {fmt(t.yaMin)} hoy</span> : null}
              </p>
              {t.motivo ? (
                <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-sky-600 dark:text-sky-400">
                  <Sparkles className="size-3 shrink-0" /> sugerido: {t.motivo}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Quitar 15 minutos"
                onClick={() => pone(t.id, (min[t.id] || 0) - PASO)}
                className="rounded-md border border-input p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-40"
                disabled={(min[t.id] || 0) <= 0}
              >
                <Minus className="size-3.5" />
              </button>
              <div className="w-20 text-center">
                <input
                  type="number"
                  min={0}
                  max={720}
                  step={5}
                  value={min[t.id] || 0}
                  onChange={(e) => pone(t.id, Number(e.target.value) || 0)}
                  aria-label={`Minutos para ${t.titulo}`}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-center text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">{(min[t.id] || 0) > 0 ? fmt(min[t.id]) : "—"}</p>
              </div>
              <button
                type="button"
                aria-label="Sumar 15 minutos"
                onClick={() => pone(t.id, (min[t.id] || 0) + PASO)}
                className="rounded-md border border-input p-1.5 text-muted-foreground hover:bg-accent"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* El total vivo contra lo que falta. Pasarse NO es error: el sensor no ve reuniones ni rodajes. */}
      <div className="mt-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Total a anotar</span>
          <span className="font-bold tabular-nums">{fmt(total)}{conSensor && restanteMin > 0 ? <span className="font-normal text-muted-foreground"> de {fmt(restanteMin)} medidas</span> : null}</span>
        </div>
        {conSensor && restanteMin > 0 ? (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", total > restanteMin ? "bg-sky-500" : "bg-emerald-500")}
              style={{ width: `${Math.min(100, Math.round((total / restanteMin) * 100))}%` }}
            />
          </div>
        ) : null}
        {conSensor && total > restanteMin ? (
          <p className="mt-2 text-xs text-sky-600 dark:text-sky-400">
            Vas a anotar más de lo que midió el sensor — normal si hubo rodaje, reuniones o trabajo fuera del PC.
          </p>
        ) : null}
        {error ? <p className="mt-2 text-xs font-medium text-destructive">{error}</p> : null}
        <button
          type="button"
          onClick={enviar}
          disabled={pendiente || total <= 0}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Anotar el día
        </button>
      </div>
    </div>
  );
}
