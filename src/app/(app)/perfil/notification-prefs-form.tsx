"use client";

import * as React from "react";
import { Bell } from "lucide-react";
import { notificationEventsByCategory } from "@/lib/notification-types";
import { setNotifPref } from "./preference-actions";

type Channels = { inApp: boolean; push: boolean; email: boolean };
const ALL_ON: Channels = { inApp: true, push: true, email: true };
const CHANNELS: { key: "inApp" | "push" | "email"; label: string }[] = [
  { key: "inApp", label: "App" },
  { key: "push", label: "Push" },
  { key: "email", label: "Correo" },
];

// Preferencias PERSONALES de notificación (control del usuario): por cada evento, qué canales
// quiere (campana in-app, push del navegador, correo). Optimista; el admin puede apagar tipos
// para todo el equipo y eso manda sobre esto.
export function NotificationPrefsForm({ prefs: initial }: { prefs: Record<string, Channels> }) {
  const groups = React.useMemo(() => notificationEventsByCategory(), []);
  const [prefs, setPrefs] = React.useState(initial);
  const [, startTransition] = React.useTransition();

  const get = (key: string): Channels => prefs[key] ?? ALL_ON;
  const toggle = (eventKey: string, channel: "inApp" | "push" | "email") => {
    const cur = get(eventKey);
    const next = { ...cur, [channel]: !cur[channel] };
    setPrefs((p) => ({ ...p, [eventKey]: next }));
    startTransition(async () => { await setNotifPref(eventKey, channel, next[channel]); });
  };

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Bell className="size-4 text-primary" /> Notificaciones</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Elige qué te avisa y por dónde. El administrador puede desactivar tipos para todo el equipo, y eso manda sobre esto.
      </p>

      <div className="mt-4 space-y-5">
        {groups.map((g) => (
          <div key={g.category}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.category}</p>
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="hidden items-center justify-between gap-4 bg-muted/40 px-3 py-1.5 sm:flex">
                <span className="text-[11px] font-medium text-muted-foreground">Evento</span>
                <span className="flex gap-3">
                  {CHANNELS.map((c) => <span key={c.key} className="w-10 text-center text-[11px] font-medium text-muted-foreground">{c.label}</span>)}
                </span>
              </div>
              {g.events.map((e) => {
                const ch = get(e.key);
                return (
                  <div key={e.key} className="flex flex-col gap-2 border-t border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{e.label}</p>
                      <p className="text-xs text-muted-foreground">{e.description}</p>
                    </div>
                    <div className="flex shrink-0 gap-3">
                      {CHANNELS.map((c) => (
                        <label key={c.key} className="flex w-10 cursor-pointer flex-col items-center gap-0.5">
                          <span className="text-[10px] text-muted-foreground sm:hidden">{c.label}</span>
                          <input type="checkbox" checked={ch[c.key]} onChange={() => toggle(e.key, c.key)} className="size-4 accent-[hsl(var(--primary))]" />
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
