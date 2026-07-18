"use client";

import * as React from "react";
import { Moon, VolumeX, X } from "lucide-react";
import { setQuietHours, toggleNotificationMute } from "@/lib/notify-actions";

export type MutedTarget = { kind: "user" | "project"; targetId: string; name: string };
type Person = { id: string; name: string };

const inputCls = "rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Control de SILENCIO del usuario: horario silencioso recurrente + silenciar personas. Usa el
// mismo backend que respeta el pipeline `notify` (No molestar/horario silencian push+correo; el
// mute suprime del todo los avisos de esa persona). La campana in-app sigue guardando todo.
export function SilenceSettings({
  quietStart,
  quietEnd,
  mutes,
  team,
}: {
  quietStart: number | null;
  quietEnd: number | null;
  mutes: MutedTarget[];
  team: Person[];
}) {
  const [qs, setQs] = React.useState<number>(quietStart ?? 22);
  const [qe, setQe] = React.useState<number>(quietEnd ?? 7);
  const [on, setOn] = React.useState(quietStart != null && quietEnd != null);
  const [list, setList] = React.useState<MutedTarget[]>(mutes);
  const [pick, setPick] = React.useState("");
  const [, start] = React.useTransition();

  const saveQuiet = (s: number | null, e: number | null) => start(async () => { await setQuietHours(s, e); });
  const toggleOn = (v: boolean) => { setOn(v); saveQuiet(v ? qs : null, v ? qe : null); };
  const changeStart = (h: number) => { setQs(h); if (on) saveQuiet(h, qe); };
  const changeEnd = (h: number) => { setQe(h); if (on) saveQuiet(qs, h); };

  const mutedUsers = list.filter((m) => m.kind === "user");
  const avail = team.filter((t) => !mutedUsers.some((m) => m.targetId === t.id));

  const addMute = () => {
    const p = team.find((t) => t.id === pick);
    if (!p) return;
    setList((l) => [...l, { kind: "user", targetId: p.id, name: p.name }]);
    setPick("");
    start(async () => { await toggleNotificationMute("user", p.id, true); });
  };
  const removeMute = (m: MutedTarget) => {
    setList((l) => l.filter((x) => !(x.kind === m.kind && x.targetId === m.targetId)));
    start(async () => { await toggleNotificationMute(m.kind, m.targetId, false); });
  };

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Moon className="size-4 text-primary" /> Silencio y horario</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pausa los avisos por horas o silencia a personas. La campana sigue guardando todo; solo se callan el push y el correo.
      </p>

      {/* Horario silencioso */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={on} onChange={(e) => toggleOn(e.target.checked)} className="size-4 accent-primary" /> Horario silencioso
        </label>
        {on ? (
          <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            de
            <select value={qs} onChange={(e) => changeStart(Number(e.target.value))} className={inputCls}>{HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
            a
            <select value={qe} onChange={(e) => changeEnd(Number(e.target.value))} className={inputCls}>{HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select>
            <span className="text-xs">(hora de Bogotá; puede cruzar la medianoche)</span>
          </span>
        ) : null}
      </div>

      {/* Silenciar personas */}
      <div className="mt-3 rounded-lg border border-border px-3 py-3">
        <p className="flex items-center gap-1.5 text-sm font-medium"><VolumeX className="size-4" /> Silenciar personas</p>
        <p className="text-xs text-muted-foreground">Dejas de recibir avisos originados por esa persona (in-app, push y correo).</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className={inputCls}>
            <option value="">Elige a alguien…</option>
            {avail.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={addMute} disabled={!pick} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Silenciar</button>
        </div>
        {mutedUsers.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {mutedUsers.map((m) => (
              <span key={m.targetId} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                {m.name}
                <button onClick={() => removeMute(m)} aria-label={`Reactivar avisos de ${m.name}`} className="text-muted-foreground hover:text-destructive"><X className="size-3" /></button>
              </span>
            ))}
          </div>
        ) : <p className="mt-2 text-xs text-muted-foreground">No has silenciado a nadie.</p>}
      </div>
    </section>
  );
}
