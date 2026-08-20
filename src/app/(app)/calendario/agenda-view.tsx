"use client";

import * as React from "react";
import { useMemo } from "react";
import type { CalItem } from "./my-calendar";
import { itemSolid, personColor, emitCalendarDetail, type ColorBy } from "./calendar-detail";
import { cn } from "@/lib/utils";
import { EntityEmoji } from "@/components/icons/marks";
import { IconCalendario, IconEntregas, IconRodaje, IconHito } from "@/components/icons";

const pad = (n: number) => String(n).padStart(2, "0");

// Clave "YYYY-MM-DD" en horario LOCAL de una fecha (para la ventana y el "Hoy").
function localKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Etiqueta del encabezado de día a partir de la clave "YYYY-MM-DD".
function dayLabel(key: string): string {
  const [y, mo, da] = key.split("-").map(Number);
  const d = new Date(y, mo - 1, da);
  const s = d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Vista "Agenda" (lista tipo Google Calendar): próximos items agrupados por día.
// Respeta la convención de la app: el día de un item se saca de it.date.slice(0,10)
// (hora de pared en UTC), nunca de new Date(...).getDate().
// Emoji por tipo para el cuadrito de cada fila (mismo lenguaje visual que las capas del board).
// Los mismos íconos que el resto del calendario. Eran emoji, que además de mezclarse con los
// íconos vectoriales de al lado los dibuja cada sistema operativo a su manera.
// Los cuatro tonos de `estadoRonda`: sin tope · dentro · última incluida · pasado.
const TONO_NOTA: Record<string, string> = {
  neutro: "border-border text-muted-foreground",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  aviso: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  excedido: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const KIND_ICON: Record<CalItem["kind"], (p: { className?: string }) => React.ReactElement> = {
  event: IconCalendario, task: IconEntregas, shoot: IconRodaje, milestone: IconHito,
};

export function AgendaView({ items, anchor, days = 30, colorBy = "tipo" }: {
  items: CalItem[];
  anchor: Date;          // desde este día en adelante
  days?: number;         // ventana en días
  colorBy?: ColorBy;     // "tipo" | "persona"
}) {
  const todayKey = localKey(new Date());

  // Conjunto de claves de día permitidas: `days` días consecutivos desde anchor.
  const allowed = useMemo(() => {
    const set = new Set<string>();
    const base = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    for (let i = 0; i < days; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      set.add(localKey(d));
    }
    return set;
  }, [anchor, days]);

  // Agrupa por clave de día (solo items dentro de la ventana), ordenado ascendente.
  const groups = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    const within = items
      .filter((it) => allowed.has(it.date.slice(0, 10)))
      .sort((a, b) => a.date.localeCompare(b.date));
    for (const it of within) {
      const k = it.date.slice(0, 10);
      const arr = map.get(k) ?? [];
      arr.push(it);
      map.set(k, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items, allowed]);

  if (groups.length === 0) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-1 mt-4 rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No hay nada agendado en los próximos {days} días.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 p-1">
        {groups.map(([key, dayItems]) => (
          <div key={key}>
            <h3 className="sticky top-0 z-[1] bg-card/95 py-1 text-xs font-semibold backdrop-blur">
              {dayLabel(key)}
              {key === todayKey ? <span className="ml-1.5 text-primary">· Hoy</span> : null}
            </h3>
            <div className="space-y-1.5">
              {dayItems.map((it) => {
                const dot = colorBy === "persona" ? (personColor(it) ?? itemSolid(it)) : itemSolid(it);
                const timeLabel = it.time ?? (it.allDay || it.kind !== "event" ? "Todo el día" : "");
                return (
                  <button
                    key={it.id}
                    type="button"
                    // En la lista no hay «resaltar»: el clic simple abre el detalle directamente
                    // (antes solo respondía al doble clic y el clic normal no hacía nada).
                    onClick={() => emitCalendarDetail(it)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2 text-left shadow-sm transition-colors hover:bg-muted/40"
                    title={`${it.title} · clic para ver el detalle`}
                  >
                    {/* Cuadrito tintado con el ícono del tipo (aspecto del rediseño aprobado). */}
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg" style={{ background: `${dot}26` }}>
                      {React.createElement(KIND_ICON[it.kind], { className: "size-4" })}
                    </span>
                    <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">{timeLabel}</span>
                    <span className="truncate text-sm font-medium">{it.title}</span>
                    {/* La ronda pactada, junto a la pieza. El modo presentación ya la quitó del
                        dato, así que aquí no hay nada que decidir: si llega, se pinta. */}
                    {it.nota ? (
                      <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", TONO_NOTA[it.notaTono ?? "neutro"])}>
                        {it.nota}
                      </span>
                    ) : null}
                    {it.projectName ? (
                      <span className={cn("ml-auto shrink-0 truncate text-xs text-muted-foreground")}>
                        <EntityEmoji value={it.projectEmoji} fallback="🗂️" /> {it.projectName}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
