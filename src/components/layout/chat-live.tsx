"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

// Cliente del stream GLOBAL de chat (/api/chat/stream): mantiene vivos los badges de no-leídos
// en toda la app (sidebar, barra móvil, rail de /chat) y el «(N)» del título de la pestaña.
// El servidor manda:
//   event: unread  → { total, rows:[{channelId,count,muted}] } (la verdad, con debounce ~1 s)
//   event: message → aviso ligero de mensaje nuevo (para previews del rail; NO altera conteos)

export type ChatLiveMessage = {
  channelId: string;
  parentId: string | null;
  body: string;
  author: string | null;
  createdAt: string;
};

type Summary = { total: number; rows: { channelId: string; count: number; muted: boolean }[] };

type ChatLiveValue = {
  // null hasta que llegue el primer resumen: los consumidores usan su valor server-render.
  total: number | null;
  // Conteo vivo por canal (null = aún sin resumen). Con resumen, canal ausente = 0.
  unreadOf: (channelId: string) => number | null;
  // Cambia con cada resumen (para efectos que reaccionan a «llegaron números nuevos»).
  version: number;
  // Suscripción a avisos de mensaje (rail): setState dentro del callback, no en efectos.
  subscribe: (fn: (m: ChatLiveMessage) => void) => () => void;
};

const ChatLiveContext = React.createContext<ChatLiveValue>({
  total: null,
  unreadOf: () => null,
  version: 0,
  subscribe: () => () => {},
});

export function useChatLive() {
  return React.useContext(ChatLiveContext);
}

export function ChatLiveProvider({ enabled = true, children }: { enabled?: boolean; children: React.ReactNode }) {
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [version, setVersion] = React.useState(0);
  const listeners = React.useRef(new Set<(m: ChatLiveMessage) => void>());
  const pathname = usePathname();

  React.useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    let stopped = false;
    let retryMs = 1000;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (stopped) return;
      es = new EventSource("/api/chat/stream");
      es.onopen = () => {
        retryMs = 1000;
      };
      es.addEventListener("unread", (e) => {
        try {
          const s = JSON.parse((e as MessageEvent).data) as Summary;
          setSummary(s);
          setVersion((v) => v + 1);
        } catch {
          /* payload raro: se ignora */
        }
      });
      es.addEventListener("message", (e) => {
        try {
          const m = JSON.parse((e as MessageEvent).data) as ChatLiveMessage;
          for (const fn of listeners.current) fn(m);
        } catch {
          /* ignore */
        }
      });
      // El servidor corta con `revoked` si el usuario fue desactivado: no reintentar en bucle.
      es.addEventListener("revoked", () => {
        stopped = true;
        es?.close();
      });
      // EventSource solo auto-reintenta errores de red; una respuesta no-200 (502 del proxy
      // durante un deploy) lo mata DEFINITIVAMENTE. Reconexión propia con backoff, siempre.
      es.onerror = () => {
        if (stopped) return;
        es?.close();
        timer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 15000);
      };
    };
    connect();

    // Al volver a la pestaña, si el stream quedó muerto, reconectar ya (sin esperar el backoff).
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (es && es.readyState !== EventSource.CLOSED) return;
      if (timer) clearTimeout(timer);
      retryMs = 1000;
      connect();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      es?.close();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled]);

  // «(3) Labstream OS» en el título de la pestaña: señal periférica estilo Slack/WhatsApp Web.
  // Se re-estampa al navegar (cada página pone su propio título) y con cada resumen nuevo.
  React.useEffect(() => {
    if (!summary) return;
    const stamp = () => {
      const base = document.title.replace(/^\(\d+\)\s*/, "");
      document.title = summary.total > 0 ? `(${summary.total}) ${base}` : base;
    };
    stamp();
    // El título de la página nueva lo pone Next DESPUÉS de este efecto: re-estampar en un tick.
    const t = setTimeout(stamp, 400);
    return () => clearTimeout(t);
  }, [summary, pathname]);

  // subscribe es ESTABLE (no depende del resumen): los suscriptores no se re-suscriben
  // con cada recount, solo cuando de verdad cambian sus deps.
  const subscribe = React.useCallback((fn: (m: ChatLiveMessage) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const value = React.useMemo<ChatLiveValue>(() => {
    const map = summary ? new Map(summary.rows.map((r) => [r.channelId, r.count] as const)) : null;
    return {
      total: summary ? summary.total : null,
      unreadOf: (channelId) => (map ? map.get(channelId) ?? 0 : null),
      version,
      subscribe,
    };
  }, [summary, version, subscribe]);

  return <ChatLiveContext.Provider value={value}>{children}</ChatLiveContext.Provider>;
}
