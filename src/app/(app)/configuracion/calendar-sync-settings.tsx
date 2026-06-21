"use client";

import * as React from "react";
import { Loader2, Check, CalendarClock } from "lucide-react";
import { saveCalendarSyncSettings } from "./actions";

const DAY_LABELS = ["D", "L", "M", "M", "J", "V", "S"]; // 0=Dom … 6=Sáb
const FREQ_PRESETS = [5, 10, 15, 30, 60];

type Initial = {
  enabled: boolean;
  everyMinutes: number;
  startHour: number;
  endHour: number;
  workDays: number[];
};

// Panel admin: programa el sondeo automático app ↔ Synology (frecuencia, franja en hora de
// Bogotá y días). Lo lee el planificador en-proceso; controla el sentido Synology → app.
export function CalendarSyncSettings({ initial }: { initial: Initial }) {
  const [enabled, setEnabled] = React.useState(initial.enabled);
  const [every, setEvery] = React.useState(initial.everyMinutes);
  const [startHour, setStartHour] = React.useState(initial.startHour);
  const [endHour, setEndHour] = React.useState(initial.endHour);
  const [days, setDays] = React.useState<number[]>(initial.workDays);
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));

  const hours = Array.from({ length: 24 }, (_, i) => i);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveCalendarSyncSettings({ enabled, everyMinutes: every, startHour, endHour, workDays: days });
      setMsg(r.ok ? "✓ Guardado" : `⚠️ ${r.error}`);
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">Sondeo automático del calendario</p>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4 accent-primary" />
              {enabled ? "Activado" : "Apagado"}
            </label>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Lo que pongas en la app pasa a Synology al instante. Esto controla cada cuánto se trae lo que cambie en
            Synology (hora de Bogotá).
          </p>

          <div className={enabled ? "mt-3 space-y-3" : "mt-3 space-y-3 opacity-50"}>
            {/* Frecuencia */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Cada</span>
              {FREQ_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={!enabled}
                  onClick={() => setEvery(m)}
                  className={`rounded-md border px-2 py-1 text-xs font-medium ${every === m ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}
                >
                  {m} min
                </button>
              ))}
              <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                u otro:
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={every}
                  disabled={!enabled}
                  onChange={(e) => setEvery(Math.max(1, Math.min(720, parseInt(e.target.value || "15", 10))))}
                  className="w-16 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                />
                min
              </span>
            </div>

            {/* Franja horaria */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-muted-foreground">Entre</span>
              <select
                value={startHour}
                disabled={!enabled}
                onChange={(e) => setStartHour(parseInt(e.target.value, 10))}
                className="rounded-md border border-input bg-background px-2 py-1 outline-none focus:ring-1 focus:ring-ring"
              >
                {hours.map((h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
              <span className="text-muted-foreground">y</span>
              <select
                value={endHour}
                disabled={!enabled}
                onChange={(e) => setEndHour(parseInt(e.target.value, 10))}
                className="rounded-md border border-input bg-background px-2 py-1 outline-none focus:ring-1 focus:ring-ring"
              >
                {hours.filter((h) => h > startHour).concat(24).map((h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
              <span className="text-muted-foreground">(hora de Bogotá)</span>
            </div>

            {/* Días */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-muted-foreground">Días:</span>
              {DAY_LABELS.map((lbl, d) => (
                <button
                  key={d}
                  type="button"
                  disabled={!enabled}
                  onClick={() => toggleDay(d)}
                  title={["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][d]}
                  className={`flex size-7 items-center justify-center rounded-full border text-xs font-medium ${days.includes(d) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent"}`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Guardar
            </button>
            {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
