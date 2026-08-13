"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleDashed, Clapperboard, Pencil, X } from "lucide-react";
import { updateProjectBrief } from "@/app/(app)/proyectos/[id]/actions";
import { EntityEmoji } from "@/components/icons/marks";
import { cn } from "@/lib/utils";

// ── Plan de trabajo por proyecto, dentro del Resumen del cliente ──
// Responde «¿qué le prometimos a esta cuenta y cómo va?» sin entrar a cada proyecto. Los dos
// textos NO son campos nuevos: el proyecto ya tenía `briefScope` («lo que se va a hacer») y
// `briefDeliverables` en la base, pero solo se veían dentro del proyecto. Aquí suben al cliente,
// que es donde se mira el conjunto, y se editan en el sitio con la MISMA acción de siempre
// (`updateProjectBrief`), así que no hay dos caminos para lo mismo.
//
// El checklist de videos se ARMA SOLO con los entregables reales del proyecto: nadie lo mantiene
// a mano y por tanto nunca miente. Una pieza se marca cuando queda aprobada o entregada.

export type BriefPieza = { id: string; name: string; done: boolean };
export type BriefProyecto = {
  id: string;
  name: string;
  emoji: string | null;
  statusLabel: string;
  statusClass: string;
  scope: string | null;
  special: string | null;
  piezas: BriefPieza[];
  hechas: number;
  canEdit: boolean;
};

function Campo({ label, value, vacio }: { label: string; value: string | null; vacio: string }) {
  return (
    <div className={cn("rounded-lg border p-2.5", value ? "border-border bg-background" : "border-dashed border-border bg-background")}>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{label}</p>
      <p className={cn("text-xs leading-relaxed", value ? "text-muted-foreground" : "text-muted-foreground/60")}>{value || vacio}</p>
    </div>
  );
}

function Editor({ p, onDone }: { p: BriefProyecto; onDone: () => void }) {
  const [pending, start] = React.useTransition();
  const router = useRouter();
  return (
    <form
      // refresh(): la acción revalida la página del PROYECTO, no esta ficha — sin refrescar el
      // router aquí, el texto recién guardado no se vería hasta recargar a mano.
      action={(fd) => start(async () => { await updateProjectBrief(p.id, fd); onDone(); router.refresh(); })}
      className="grid gap-3 p-3 sm:grid-cols-2"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Qué se va a hacer</span>
        <textarea
          name="briefScope"
          defaultValue={p.scope ?? ""}
          rows={4}
          placeholder="8 reels verticales de educación, grabados en consultorio…"
          className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Algo especial del proyecto</span>
        <textarea
          name="briefDeliverables"
          defaultValue={p.special ?? ""}
          rows={4}
          placeholder="Solo graba martes en la mañana. El logo va abajo a la derecha…"
          className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <div className="flex items-center gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={onDone} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <X className="size-3.5" /> Cancelar
        </button>
      </div>
    </form>
  );
}

function Tarjeta({ p }: { p: BriefProyecto }) {
  const [editando, setEditando] = React.useState(false);
  const total = p.piezas.length;
  const pct = total ? Math.round((p.hechas / total) * 100) : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2.5">
        <Clapperboard className="size-4 shrink-0 text-primary" />
        <Link href={`/proyectos/${p.id}`} className="min-w-0 flex-1 truncate text-[13px] font-semibold hover:underline">
          {p.emoji ? <><EntityEmoji value={p.emoji} /> </> : null}{p.name}
        </Link>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", p.statusClass)}>{p.statusLabel}</span>
        {p.canEdit && !editando ? (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium hover:bg-accent"
          >
            <Pencil className="size-3" /> Editar brief
          </button>
        ) : null}
      </div>

      {editando ? (
        <Editor p={p} onDone={() => setEditando(false)} />
      ) : (
        <div className="grid gap-3 p-3 sm:grid-cols-2">
          <Campo label="Qué se va a hacer" value={p.scope} vacio="Sin brief todavía. Escríbelo para que el equipo sepa qué se entrega." />
          <Campo label="Algo especial del proyecto" value={p.special} vacio="Sin indicaciones especiales." />

          {total > 0 ? (
            <div className="rounded-lg border border-border bg-background p-2.5 sm:col-span-2">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                Checklist de videos · {p.hechas} de {total}
              </p>
              <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
                {p.piezas.map((d) => (
                  <span key={d.id} className={cn("flex items-center gap-2 py-1 text-xs", d.done ? "text-muted-foreground/60 line-through" : "text-foreground")}>
                    {d.done ? <CircleCheck className="size-4 shrink-0 text-emerald-500" /> : <CircleDashed className="size-4 shrink-0 text-muted-foreground/50" />}
                    <span className="truncate">{d.name}</span>
                  </span>
                ))}
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function ClientBrief({ proyectos }: { proyectos: BriefProyecto[] }) {
  if (proyectos.length === 0) return null;
  return (
    <div className="space-y-2.5">
      <h3 className="text-[13px] font-semibold">Plan de trabajo por proyecto</h3>
      {proyectos.map((p) => <Tarjeta key={p.id} p={p} />)}
    </div>
  );
}
