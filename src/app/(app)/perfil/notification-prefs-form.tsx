"use client";

import * as React from "react";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { notificationEventsByCategory } from "@/lib/notification-types";
import { ensureNotifyPermission, isTauri, notifyPermission, subscribeBrowserPush } from "@/lib/native-notify";
import { setNotifPref } from "./preference-actions";

type Channels = { inApp: boolean; push: boolean; email: boolean };
const ALL_ON: Channels = { inApp: true, push: true, email: true };
const CHANNELS: { key: "inApp" | "push" | "email"; label: string }[] = [
  { key: "inApp", label: "App" },
  { key: "push", label: "Push" },
  { key: "email", label: "Correo" },
];

// ── El push de ESTE navegador: estado, activar y probar ────────────────────────────────────
// Vive aquí y no solo en la campana por una razón concreta: la oferta de la campana se hace UNA
// vez y no se repite, así que quien dijo «ahora no» aquel día no tenía después ningún sitio al
// que volver. Y «probar» existe porque la entrega real no se puede verificar de otra manera:
// el service worker enseña una notificación siempre, así que la única prueba honesta es que
// cada quien se mande una a sí mismo y la vea llegar.
function PushEstado() {
  // El estado se lee al montar (en el servidor no existe `Notification`) y llega ENTERO en una
  // sola pieza: permiso, si es la app de escritorio, y si hay suscripción de verdad — esto
  // último contra el service worker, porque el permiso puede estar concedido y aun así no haber
  // suscripción (se concedió en otra pestaña, el servidor no tenía claves ese día…).
  // Hasta que se sabe, no se pinta nada: mejor un parpadeo de nada que uno de texto equivocado.
  const [estado, setEstado] = React.useState<{ perm: ReturnType<typeof notifyPermission>; tauri: boolean; suscrito: boolean } | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const [resultado, setResultado] = React.useState<string | null>(null);

  React.useEffect(() => {
    let vivo = true;
    (async () => {
      const tauri = isTauri();
      const perm = notifyPermission();
      let suscrito = false;
      try {
        // En Tauri no hay service worker: el opcional deja `reg` en undefined y `suscrito` en falso.
        const reg = await navigator.serviceWorker?.ready;
        suscrito = Boolean(await reg?.pushManager?.getSubscription());
      } catch {
        /* sin service worker o sin push: queda como no suscrito */
      }
      if (vivo) setEstado({ perm, tauri, suscrito });
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const activar = async () => {
    setOcupado(true);
    setResultado(null);
    try {
      const ok = await ensureNotifyPermission();
      let suscrito = false;
      if (ok) {
        suscrito = await subscribeBrowserPush();
        setResultado(suscrito ? "Listo: este navegador ya recibe avisos." : "El permiso está, pero la suscripción no se pudo crear. Recarga e intenta de nuevo.");
      }
      setEstado((e) => (e ? { ...e, perm: notifyPermission(), suscrito } : e));
    } finally {
      setOcupado(false);
    }
  };

  const probar = async () => {
    setOcupado(true);
    setResultado(null);
    try {
      const r = await fetch("/api/push/test", { method: "POST" });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; motivo?: string; enviados?: number; fallidos?: number } | null;
      if (j?.ok) setResultado("Enviada. Debe aparecerte una notificación del sistema en unos segundos.");
      else setResultado(j?.motivo ?? (j?.fallidos ? "El servidor no pudo entregarla; revisa el registro." : "No se pudo enviar la prueba."));
    } catch {
      setResultado("No se pudo enviar la prueba.");
    } finally {
      setOcupado(false);
    }
  };

  if (!estado) return null; // todavía leyendo el estado del navegador

  // En la app de escritorio no hay Web Push ni falta que hace: los avisos nativos llegan
  // empujados por el stream que la app mantiene abierto, incluso escondida en la bandeja.
  if (estado.tauri) {
    return (
      <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
        En la app de escritorio los avisos llegan solos como notificaciones del sistema, también con la ventana cerrada en la bandeja. No hay nada que activar aquí.
      </div>
    );
  }
  const { perm, suscrito } = estado;
  if (perm === "unsupported") return null;

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">Avisos en este navegador</p>
          <p className="text-xs text-muted-foreground">
            {perm === "denied"
              ? "Este navegador tiene el permiso bloqueado: se cambia en el candado de la barra de direcciones, junto a la URL."
              : suscrito
                ? "Activados: te avisa aunque no tengas la pestaña abierta."
                : "Sin activar: los avisos solo se ven con la app abierta."}
          </p>
        </div>
        {perm === "denied" ? null : (
          <button
            type="button"
            disabled={ocupado}
            onClick={suscrito ? probar : activar}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
          >
            {ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <BellRing className="size-3.5" />}
            {suscrito ? "Enviar prueba" : "Activar"}
          </button>
        )}
      </div>
      {resultado ? <p className="mt-1.5 text-xs text-muted-foreground">{resultado}</p> : null}
    </div>
  );
}

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

      <PushEstado />

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
