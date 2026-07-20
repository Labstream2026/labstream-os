"use client";

import * as React from "react";
import { MessageCircle, X, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatLive } from "@/components/layout/chat-live";
import { ProjectChatTab } from "./project-chat-tab";
import { type ChatMe } from "@/components/chat/channel-chat";

// Chat del proyecto como panel ANCLADO abajo-derecha (no flota: no se puede mover, solo
// abrir/cerrar y REDIMENSIONAR desde el borde izquierdo y superior). Responsive: el tamaño se
// limita al viewport con min(). El estado (abierto/cerrado + ancho + alto) se RECUERDA POR
// PROYECTO en localStorage, así que al volver al proyecto reaparece tal como lo dejaste; al salir
// del proyecto el componente se desmonta (se “cierra” visualmente) pero su estado queda guardado.
// - Badge de NO-LEÍDOS en vivo (useChatLive.unreadOf del canal del proyecto).
// - Reusa ProjectChatTab (resuelve canal + mensajes por /api/chat/dock?project=), sin duplicar chat.
// - CONVIVE con el FAB de crear (QuickCreateFab, bottom-6 right-6): la burbuja cerrada se apila
//   ENCIMA (bottom-[5.75rem]) para que vivan las dos.
// - Solo escritorio (hidden md:flex): en móvil está la burbuja global de chat del app-shell.

const DEFAULT_W = 384;
const DEFAULT_H = 560;
const MIN_W = 320;
const MIN_H = 380;

type ChatState = { open: boolean; w: number; h: number };
const keyOf = (projectId: string) => `lsos:projchat:${projectId}`;
const CHAT_EVENT = "lsos:projchat-changed";

// Estado persistido leído con useSyncExternalStore (sin setState en efectos, sin desajuste de
// hidratación): el servidor ve el default y el cliente se sincroniza solo tras montar.
function subscribeChat(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  window.addEventListener(CHAT_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CHAT_EVENT, cb);
  };
}
function readChatRaw(projectId: string): string {
  try { return window.localStorage.getItem(keyOf(projectId)) ?? ""; } catch { return ""; }
}
function writeChat(projectId: string, s: ChatState): void {
  try { window.localStorage.setItem(keyOf(projectId), JSON.stringify(s)); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(CHAT_EVENT)); } catch { /* ignore */ }
}
function parseChat(raw: string): ChatState {
  if (!raw) return { open: false, w: DEFAULT_W, h: DEFAULT_H };
  try {
    const j = JSON.parse(raw) as Partial<ChatState>;
    return {
      open: Boolean(j.open),
      w: typeof j.w === "number" && j.w >= MIN_W ? j.w : DEFAULT_W,
      h: typeof j.h === "number" && j.h >= MIN_H ? j.h : DEFAULT_H,
    };
  } catch {
    return { open: false, w: DEFAULT_W, h: DEFAULT_H };
  }
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function ProjectChatBubble({ projectId, me, isAdmin }: { projectId: string; me: ChatMe; isAdmin: boolean }) {
  const [channelId, setChannelId] = React.useState<string | null>(null);
  const live = useChatLive();

  const raw = React.useSyncExternalStore(subscribeChat, () => readChatRaw(projectId), () => "");
  const persisted = React.useMemo(() => parseChat(raw), [raw]);
  // Tamaño en vivo durante el arrastre (suave); al soltar se persiste y `drag` vuelve a null.
  const [drag, setDrag] = React.useState<{ w: number; h: number } | null>(null);
  const w = drag?.w ?? persisted.w;
  const h = drag?.h ?? persisted.h;

  const panelRef = React.useRef<HTMLDivElement>(null);

  const setOpen = (v: boolean) => writeChat(projectId, { open: v, w: persisted.w, h: persisted.h });

  // Descubre el id del canal del proyecto para poder pintar el badge SIN abrir el panel.
  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/chat/dock?project=${projectId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { channel?: { id?: string } } | null) => {
        if (!cancelled && d?.channel?.id) setChannelId(d.channel.id);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  const unread = channelId ? live.unreadOf(channelId) ?? 0 : 0;

  // ── Redimensionar desde el borde izquierdo / superior / esquina superior-izquierda ──
  // El panel está anclado abajo-derecha: crecer de ancho lo extiende hacia la IZQUIERDA y de alto
  // hacia ARRIBA (por eso el borde derecho e inferior no llevan tirador). El arrastre engancha
  // listeners de window en el pointerdown (patrón de week-view): así sigue aunque el puntero salga
  // del tirador, y no se pasa ningún ref como prop (evita la regla react-hooks/refs).
  const startResize = (e: React.PointerEvent, left: boolean, top: boolean) => {
    e.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    const sw = rect?.width ?? w;
    const sh = rect?.height ?? h;
    const sx = e.clientX;
    const sy = e.clientY;
    let lw = sw;
    let lh = sh;
    const onMove = (ev: PointerEvent) => {
      const maxW = Math.max(MIN_W, window.innerWidth - 48);
      const maxH = Math.max(MIN_H, window.innerHeight - 96);
      lw = left ? clamp(sw - (ev.clientX - sx), MIN_W, maxW) : sw;
      lh = top ? clamp(sh - (ev.clientY - sy), MIN_H, maxH) : sh;
      setDrag({ w: lw, h: lh });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      writeChat(projectId, { open: true, w: Math.round(lw), h: Math.round(lh) });
      setDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (persisted.open) {
    return (
      <div
        ref={panelRef}
        style={{ width: `min(${w}px, calc(100vw - 3rem))`, height: `min(${h}px, calc(100vh - 6rem))` }}
        className={cn(
          "fixed bottom-6 right-6 z-50 hidden flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl duration-200 animate-in fade-in slide-in-from-bottom-4 md:flex",
          drag && "select-none",
        )}
      >
        {/* Tiradores de redimensión (transparentes; se marcan al pasar el mouse). */}
        <div onPointerDown={(e) => startResize(e, true, false)} title="Arrastra para el ancho" className="absolute inset-y-3 left-0 z-10 w-1.5 cursor-ew-resize transition-colors hover:bg-primary/40" />
        <div onPointerDown={(e) => startResize(e, false, true)} title="Arrastra para el alto" className="absolute inset-x-3 top-0 z-10 h-1.5 cursor-ns-resize transition-colors hover:bg-primary/40" />
        <div onPointerDown={(e) => startResize(e, true, true)} title="Arrastra para el tamaño" className="group/grip absolute left-0 top-0 z-20 size-4 cursor-nwse-resize">
          <span className="absolute left-1 top-1 size-2 rounded-tl-[3px] border-l-2 border-t-2 border-muted-foreground/40 transition-colors group-hover/grip:border-primary" />
        </div>

        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2.5">
          <MessageCircle className="size-4 shrink-0 text-primary" />
          <span className="flex-1 truncate text-sm font-semibold">Chat del proyecto</span>
          <button onClick={() => setOpen(false)} aria-label="Minimizar" title="Minimizar" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <Minus className="size-4" />
          </button>
          <button onClick={() => setOpen(false)} aria-label="Cerrar" title="Cerrar" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        {/* ProjectChatTab trae su propio contenedor de alto fijo; aquí lo forzamos a ocupar el panel. */}
        <div className="min-h-0 flex-1 overflow-hidden [&>div]:h-full [&>div]:min-h-0 [&>div]:rounded-none [&>div]:border-0">
          <ProjectChatTab projectId={projectId} me={me} isAdmin={isAdmin} />
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setOpen(true)}
      aria-label="Abrir chat del proyecto"
      title="Chat del proyecto"
      className={cn(
        "group fixed bottom-[5.75rem] right-6 z-50 hidden size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-[transform,opacity] hover:scale-105 active:scale-95 md:grid",
        // Mientras el speed-dial del FAB está abierto (marcador .qc-dial-open), la burbuja se
        // desvanece: las acciones del dial suben EXACTAMENTE a este hueco y la burbuja (z-50,
        // mayor que el dial) las tapaba. body:has() la re-muestra sola al cerrar el dial.
        "[body:has(.qc-dial-open)_&]:pointer-events-none [body:has(.qc-dial-open)_&]:opacity-0",
      )}
    >
      <MessageCircle className="size-6" />
      {unread > 0 ? (
        <span className="absolute -right-1 -top-1 grid min-w-[22px] place-items-center rounded-full border-2 border-background bg-red-500 px-1 text-[11px] font-extrabold leading-[18px] text-white">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </button>
  );
}
