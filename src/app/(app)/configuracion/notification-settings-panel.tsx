"use client";

import * as React from "react";
import { Bell, BellOff, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { notificationEventsByCategory } from "@/lib/notification-types";
import { setNotificationTypeEnabled } from "./notification-settings-actions";

// Panel de administrador: activa/desactiva los TIPOS de notificación para todo el equipo.
// Por defecto todo está activo; `disabledKeys` son los que el admin apagó.
export function NotificationSettingsPanel({ disabledKeys }: { disabledKeys: string[] }) {
  const groups = React.useMemo(() => notificationEventsByCategory(), []);
  const [disabled, setDisabled] = React.useState<Set<string>>(new Set(disabledKeys));
  const [pending, setPending] = React.useState<Set<string>>(new Set());
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setDisabled(new Set(disabledKeys)), [disabledKeys]);

  const total = groups.reduce((n, g) => n + g.events.length, 0);
  const activeCount = total - disabled.size;

  function toggle(key: string) {
    if (pending.has(key)) return;
    const wasEnabled = !disabled.has(key);
    const nextEnabled = !wasEnabled;
    // Optimista: refleja el cambio al instante.
    setDisabled((prev) => {
      const next = new Set(prev);
      if (nextEnabled) next.delete(key);
      else next.add(key);
      return next;
    });
    setPending((prev) => new Set(prev).add(key));
    setError(null);
    void (async () => {
      const r = await setNotificationTypeEnabled(key, nextEnabled);
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      if (!r.ok) {
        setError(r.error ?? "No se pudo aplicar el cambio");
        // Revierte.
        setDisabled((prev) => {
          const next = new Set(prev);
          if (wasEnabled) next.delete(key);
          else next.add(key);
          return next;
        });
      }
    })();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <Bell className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="text-sm">
          <p className="font-medium">Notificaciones del equipo</p>
          <p className="text-muted-foreground">
            Controla qué avisos recibe el equipo. Al desactivar un tipo se corta por completo
            (campana, push y correo) para todos. <span className="font-medium text-foreground">{activeCount} de {total} activos.</span>
          </p>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {groups.map((g) => {
        const onCount = g.events.filter((e) => !disabled.has(e.key)).length;
        return (
          <div key={g.category} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h3 className="text-sm font-semibold">{g.category}</h3>
              <span className="text-xs text-muted-foreground">{onCount}/{g.events.length} activos</span>
            </div>
            <div className="divide-y divide-border">
              {g.events.map((e) => {
                const on = !disabled.has(e.key);
                const busy = pending.has(e.key);
                return (
                  <div key={e.key} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium">{e.label}</p>
                        {e.essential ? (
                          <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                            <ShieldCheck className="size-3" /> recomendado
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{e.description}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`${on ? "Desactivar" : "Activar"} ${e.label}`}
                      disabled={busy}
                      onClick={() => toggle(e.key)}
                      className={cn(
                        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
                        on ? "bg-primary" : "bg-muted-foreground/30",
                        busy ? "opacity-60" : "cursor-pointer",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
                          on ? "translate-x-[22px]" : "translate-x-0.5",
                        )}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <BellOff className="size-3.5" /> Los cambios aplican a todo el equipo en unos segundos. Los avisos ya enviados no se borran.
      </p>
    </div>
  );
}
