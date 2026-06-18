"use client";

import { useState, useTransition } from "react";
import { setMarcebotConfig } from "./actions";

const DAYS = [
  { n: 1, label: "Lun" },
  { n: 2, label: "Mar" },
  { n: 3, label: "Mié" },
  { n: 4, label: "Jue" },
  { n: 5, label: "Vie" },
  { n: 6, label: "Sáb" },
  { n: 0, label: "Dom" },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);
function hourLabel(h: number) {
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${am ? "a. m." : "p. m."}`;
}

export function MarcebotSettings({ initial }: { initial: { enabled: boolean; workDays: number[]; startHour: number; lastHour: number } }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [days, setDays] = useState<number[]>(initial.workDays);
  const [startHour, setStartHour] = useState(initial.startHour);
  const [lastHour, setLastHour] = useState(initial.lastHour);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const toggleDay = (n: number) =>
    setDays((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort((a, b) => a - b)));

  const save = () => {
    setMsg(null);
    start(async () => {
      const res = await setMarcebotConfig({ enabled, workDays: days, startHour, lastHour });
      setMsg(res.ok ? { ok: true, text: "Guardado ✓" } : { ok: false, text: res.error ?? "No se pudo guardar." });
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm shadow-sm">
        <span className="text-2xl">🤖</span>
        <div>
          <p className="font-medium">Marcebot</p>
          <p className="text-muted-foreground">
            El asistente que lee tareas, calendario y cronograma, y le manda a cada persona un resumen de
            sus pendientes por mensaje directo. Aquí decides cuándo trabaja.
          </p>
        </div>
      </div>

      {/* Encendido */}
      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
        <div>
          <p className="font-medium">Activar Marcebot</p>
          <p className="text-xs text-muted-foreground">Si lo apagas, deja de enviar mensajes y resúmenes.</p>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="size-5 cursor-pointer accent-[#F47A20]"
        />
      </label>

      {/* Días laborales */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <p className="font-medium">Días que trabaja</p>
        <p className="mb-3 text-xs text-muted-foreground">Solo escribe estos días. El cierre de semana cae el último día marcado.</p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => {
            const on = days.includes(d.n);
            return (
              <button
                key={d.n}
                type="button"
                onClick={() => toggleDay(d.n)}
                className={
                  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors " +
                  (on
                    ? "border-[#F47A20] bg-[#F47A20]/10 text-[#F47A20]"
                    : "border-border bg-card text-muted-foreground hover:bg-accent")
                }
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Franja horaria */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <p className="font-medium">Franja horaria (Colombia)</p>
        <p className="mb-3 text-xs text-muted-foreground">
          La última notificación se manda a la «última hora». Por defecto 4 p. m., una hora antes de cerrar.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Desde</span>
            <select
              value={startHour}
              onChange={(e) => setStartHour(Number(e.target.value))}
              className="cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>{hourLabel(h)}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Última</span>
            <select
              value={lastHour}
              onChange={(e) => setLastHour(Number(e.target.value))}
              className="cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>{hourLabel(h)}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-[#F47A20] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
        {msg ? <span className={`text-sm ${msg.ok ? "text-emerald-600" : "text-destructive"}`}>{msg.text}</span> : null}
      </div>
    </div>
  );
}
