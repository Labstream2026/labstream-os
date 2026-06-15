"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { tone } from "@/lib/colors";

export type CalProject = {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  clientName: string;
  startDate: string | null;
  dueDate: string | null;
  deliverables: { name: string; dueDate: string | null }[];
};

type Ev = { projectId: string; name: string; emoji: string | null; color: string | null; kind: string; label: string };

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function dayKey(d: string | null): string | null {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

// Calendario de proyectos: marca inicio del proyecto y cada fecha de entrega
// (proyecto y entregables) con el color del proyecto. Clic → abre el proyecto.
export function ProjectsCalendar({ projects }: { projects: CalProject[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<Ev | null>(null); // evento abierto en el popover

  const byDay = useMemo(() => {
    const map = new Map<string, Ev[]>();
    const add = (k: string | null, ev: Ev) => { if (!k) return; (map.get(k) ?? map.set(k, []).get(k)!).push(ev); };
    for (const p of projects) {
      add(dayKey(p.startDate), { projectId: p.id, name: p.name, emoji: p.emoji, color: p.color, kind: "start", label: `Inicio · ${p.name}` });
      add(dayKey(p.dueDate), { projectId: p.id, name: p.name, emoji: p.emoji, color: p.color, kind: "due", label: `Entrega · ${p.name}` });
      for (const d of p.deliverables) add(dayKey(d.dueDate), { projectId: p.id, name: p.name, emoji: p.emoji, color: p.color, kind: "deliverable", label: `${d.name} · ${p.name}` });
    }
    return map;
  }, [projects]);

  const first = new Date(Date.UTC(year, month, 1));
  const startOffset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const pad = (n: number) => String(n).padStart(2, "0");
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const prev = () => (month === 0 ? (setMonth(11), setYear((y) => y - 1)) : setMonth((m) => m - 1));
  const next = () => (month === 11 ? (setMonth(0), setYear((y) => y + 1)) : setMonth((m) => m + 1));

  // Leyenda: proyectos con color que tienen algún evento.
  const legend = projects.filter((p) => p.color && (p.startDate || p.dueDate || p.deliverables.some((d) => d.dueDate)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{MONTHS[month]} {year}</h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={prev} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">←</button>
          <button type="button" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">Hoy</button>
          <button type="button" onClick={next} className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted">→</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-muted/40 px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground">{w}</div>
        ))}
        {cells.map((d, i) => {
          const key = d ? `${year}-${pad(month + 1)}-${pad(d)}` : null;
          const evs = key ? byDay.get(key) ?? [] : [];
          const isToday = key === todayKey;
          return (
            <div key={i} className={cn("min-h-24 bg-card p-1.5", !d && "bg-muted/20")}>
              {d ? (
                <>
                  <div className={cn("mb-1 inline-flex size-5 items-center justify-center rounded-full text-[11px]", isToday ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground")}>{d}</div>
                  <div className="space-y-1">
                    {evs.map((ev, j) => {
                      const t = tone(ev.color);
                      return (
                        <button
                          key={j}
                          type="button"
                          onClick={() => setSelected(ev)}
                          title={ev.label}
                          className="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white"
                          style={{ backgroundColor: ev.color ? t.hex : "#64748b" }}
                        >
                          {ev.kind === "start" ? "▶ " : ev.kind === "due" ? "🏁 " : "🎬 "}
                          {ev.name}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      {legend.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {legend.map((p) => {
            const t = tone(p.color);
            return (
              <span key={p.id} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: t.hex }} />
                {p.emoji} {p.name}
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Asigna un color a cada proyecto (en la vista Lista) y fechas de entrega para verlos aquí.</p>
      )}

      {/* Resumen del evento (sin salir de la página), acentuado con su color */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-xs overflow-hidden rounded-xl border border-border bg-card shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="h-1.5 w-full" style={{ backgroundColor: selected.color ? tone(selected.color).hex : "#64748b" }} />
            <div className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {selected.kind === "start" ? "Inicio de proyecto" : selected.kind === "due" ? "Entrega del proyecto" : "Entregable"}
              </p>
              <h3 className="mt-1 text-sm font-semibold">{selected.emoji} {selected.name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{selected.label}</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setSelected(null)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Cerrar</button>
                <Link href={`/proyectos/${selected.projectId}`} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Abrir proyecto</Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
