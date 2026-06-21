"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead } from "@/lib/notify-actions";
import {
  showNative,
  ensureNotifyPermission,
  notifyPermission,
  notificationsSupported,
  subscribeBrowserPush,
} from "@/lib/native-notify";

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

const POLL_MS = 20000; // cada 20 s buscamos notificaciones nuevas sin recargar

// Tiempo relativo corto en español ("ahora", "hace 5 min", "hace 2 h", "hace 3 d").
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export function NotificationsBell({ items }: { items: NotificationItem[] }) {
  const [open, setOpen] = React.useState(false);
  const [list, setList] = React.useState<NotificationItem[]>(items);
  const [unread, setUnread] = React.useState(items.filter((n) => !n.read).length);
  const [perm, setPerm] = React.useState<ReturnType<typeof notifyPermission>>("default");

  // Ids ya conocidos: se siembran con el histórico inicial para NO notificar lo
  // viejo al cargar; solo avisamos de lo que llega después.
  const seen = React.useRef<Set<string>>(new Set(items.map((n) => n.id)));

  React.useEffect(() => {
    setPerm(notifyPermission());
  }, []);

  // Trae el estado más reciente del servidor (polling + al enfocar la pestaña).
  const lastRun = React.useRef(0);
  const refresh = React.useCallback(async () => {
    lastRun.current = Date.now();
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: NotificationItem[]; unread: number };
      // Notificación de escritorio para lo NUEVO sin leer, solo si la ventana no
      // está enfocada (si la estás viendo, no tiene sentido el toast).
      const focused = typeof document !== "undefined" && document.hasFocus();
      const fresh = data.items.filter((n) => !n.read && !seen.current.has(n.id));
      if (!focused) {
        for (const n of fresh.slice(0, 3)) {
          void showNative({ title: n.title, body: n.body, link: n.link });
        }
      }
      for (const n of data.items) seen.current.add(n.id);
      setList(data.items);
      setUnread(data.unread);
    } catch {
      /* sin red: reintenta en el siguiente ciclo */
    }
  }, []);
  // Refresco "barato" para eventos de foco/visibilidad: como mucho 1 cada 4 s, para
  // que ráfagas de focus/visibilitychange (extensiones, cambios de pestaña) no
  // disparen una tormenta de peticiones.
  const refreshIfStale = React.useCallback(() => {
    if (Date.now() - lastRun.current > 4000) void refresh();
  }, [refresh]);

  React.useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") refreshIfStale(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refreshIfStale);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refreshIfStale);
    };
  }, [refresh, refreshIfStale]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      // Al abrir: marcar como leído de forma optimista y, solo cuando el servidor
      // confirme, refrescar (si refrescáramos antes, podría devolver el estado aún
      // sin leer y reaparecería el contador).
      if (unread > 0) {
        setUnread(0);
        setList((prev) => prev.map((n) => ({ ...n, read: true })));
        void markAllNotificationsRead().then(refresh).catch(() => {});
      } else {
        void refresh();
      }
    }
  }

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" className="relative text-muted-foreground" aria-label="Notificaciones" onClick={toggle}>
        <Bell />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <span className="text-sm font-semibold">Notificaciones</span>
              {notificationsSupported() && perm === "default" ? (
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={async () => {
                    const ok = await ensureNotifyPermission();
                    setPerm(ok ? "granted" : notifyPermission());
                    // En navegador, además suscribe al Web Push (avisos en segundo plano).
                    if (ok) void subscribeBrowserPush();
                  }}
                >
                  Activar avisos
                </button>
              ) : null}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {list.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin notificaciones</p>
              ) : (
                list.map((n) => {
                  const inner = (
                    <div className={cn("border-b border-border px-4 py-2.5 last:border-0 hover:bg-accent", !n.read && "bg-primary/5")}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{n.title}</p>
                        <span suppressHydrationWarning className="shrink-0 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                      </div>
                      {n.body ? <p className="text-xs text-muted-foreground">{n.body}</p> : null}
                    </div>
                  );
                  return n.link ? (
                    <Link key={n.id} href={n.link} onClick={() => setOpen(false)}>{inner}</Link>
                  ) : (
                    <div key={n.id}>{inner}</div>
                  );
                })
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
