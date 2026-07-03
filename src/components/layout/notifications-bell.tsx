"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, CheckSquare, Eye, MessageSquare, Calendar, AtSign, Users, X, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { avatarTint, avatarHex } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationRead, deleteNotification } from "@/lib/notify-actions";
import {
  showNative,
  ensureNotifyPermission,
  notifyPermission,
  notificationsSupported,
  subscribeBrowserPush,
} from "@/lib/native-notify";

export type NotificationActor = { name: string; initials: string | null; color: string | null; url: string | null };
export type NotificationItem = {
  id: string;
  type?: string | null;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
  // Quién originó el aviso (avatar + color). null = evento del sistema.
  actor?: NotificationActor | null;
};

const POLL_MS = 20000; // cada 20 s buscamos notificaciones nuevas sin recargar

// Icono + tono por tipo de notificación. Se muestra como pequeña insignia sobre el avatar
// del actor (qué pasó), o como icono principal cuando el aviso es del sistema (sin actor).
const TYPE_META: Record<string, { icon: LucideIcon; tint: string; label: string }> = {
  task: { icon: CheckSquare, tint: "bg-blue-500", label: "Tarea" },
  review: { icon: Eye, tint: "bg-amber-500", label: "Revisión" },
  dm: { icon: MessageSquare, tint: "bg-emerald-500", label: "Mensaje" },
  chat: { icon: MessageSquare, tint: "bg-emerald-500", label: "Chat" },
  event: { icon: Calendar, tint: "bg-violet-500", label: "Agenda" },
  mention: { icon: AtSign, tint: "bg-rose-500", label: "Mención" },
};
function typeMeta(t?: string | null) {
  return (t && TYPE_META[t]) || { icon: Bell, tint: "bg-slate-400", label: "Aviso" };
}

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

// Agrupa por franja temporal (Hoy / Ayer / Esta semana / Antes).
const BUCKET_ORDER = ["Hoy", "Ayer", "Esta semana", "Antes"] as const;
function bucketOf(iso: string): (typeof BUCKET_ORDER)[number] {
  const t = new Date(iso).getTime();
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t >= startToday) return "Hoy";
  if (t >= startToday - 86400000) return "Ayer";
  if (t >= startToday - 7 * 86400000) return "Esta semana";
  return "Antes";
}

type Tab = "todas" | "sinleer" | "persona";

// Avatar del actor (con su color) + insignia del tipo; o icono del sistema si no hay actor.
function NotifAvatar({ n }: { n: NotificationItem }) {
  const meta = typeMeta(n.type);
  const Icon = meta.icon;
  if (!n.actor) {
    return (
      <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white", meta.tint)}>
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <div className="relative shrink-0">
      <UserAvatar initials={n.actor.initials} name={n.actor.name} color={n.actor.color} url={n.actor.url} size="md" />
      <span
        className={cn(
          "absolute -bottom-1 -right-1 inline-flex size-4 items-center justify-center rounded-full text-white ring-2 ring-popover",
          meta.tint,
        )}
      >
        <Icon className="size-2.5" />
      </span>
    </div>
  );
}

function NotifRow({ n, onPick, onDelete, showActor }: { n: NotificationItem; onPick: (n: NotificationItem) => void; onDelete: (n: NotificationItem) => void; showActor: boolean }) {
  const router = useRouter();
  const startX = React.useRef(0);
  const startY = React.useRef(0);
  const swiping = React.useRef(false);
  const [dx, setDx] = React.useState(0);
  const [removing, setRemoving] = React.useState(false);

  const remove = () => {
    setRemoving(true);
    window.setTimeout(() => onDelete(n), 160); // deja correr la animación de salida
  };

  // Deslizar para borrar (móvil): solo si el gesto es claramente horizontal (no choca con el scroll).
  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    swiping.current = false;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const ddx = e.touches[0].clientX - startX.current;
    const ddy = e.touches[0].clientY - startY.current;
    if (!swiping.current && Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy)) swiping.current = true;
    if (swiping.current) setDx(ddx);
  };
  const onTouchEnd = () => {
    if (swiping.current && Math.abs(dx) > 96) remove();
    else setDx(0);
  };

  const activate = () => {
    if (Math.abs(dx) > 8) { setDx(0); return; } // fue deslizamiento, no toque
    onPick(n);
    if (n.link) router.push(n.link);
  };

  // "Pinta" la fila con el color del usuario que la originó: franja lateral + tinte suave, para
  // identificar de un vistazo de quién es el aviso. Los avisos del sistema (sin actor) conservan
  // el fondo neutro y solo marcan «sin leer».
  const tint = n.actor?.color ? avatarTint(n.actor.color) : null;

  return (
    <div className="group/row relative border-b border-border last:border-0">
      {/* Fondo de "borrar" que asoma al deslizar la fila. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between bg-destructive/10 px-4 text-destructive">
        <Trash2 className="size-4" />
        <Trash2 className="size-4" />
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={activate}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${dx}px)`, opacity: removing ? 0 : 1, transition: swiping.current ? "none" : "transform .2s ease, opacity .15s ease" }}
        className={cn(
          "relative flex cursor-pointer items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent",
          tint ? cn("border-l-4", tint.stripe, tint.wash) : n.read ? "bg-popover" : "bg-primary/5",
        )}
      >
        <NotifAvatar n={n} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug">{n.title}</p>
            <span suppressHydrationWarning className="shrink-0 pt-0.5 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
          </div>
          {n.body ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p> : null}
          {/* Nombre del autor EN SU COLOR: identidad visual consistente en las tres pestañas. */}
          {showActor && n.actor ? (
            <p className="mt-0.5 text-[11px] font-semibold" style={n.actor.color ? { color: avatarHex(n.actor.color) } : undefined}>
              {n.actor.name}
            </p>
          ) : null}
        </div>
        {!n.read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Sin leer" /> : null}
        {/* Borrar — escritorio: aparece al pasar el cursor; móvil: se usa el deslizamiento. */}
        <button
          type="button"
          aria-label="Borrar notificación"
          onClick={(e) => { e.stopPropagation(); remove(); }}
          className="absolute right-1.5 top-1/2 hidden size-7 -translate-y-1/2 items-center justify-center rounded-full bg-popover text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/row:opacity-100 md:flex"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function NotificationsBell({ items }: { items: NotificationItem[] }) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("todas");
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
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };
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
    // Al ABRIR el panel, el contador vuelve a cero (se marca todo como leído). Si no había
    // pendientes, solo se refresca para traer lo más reciente.
    if (next) {
      if (unread > 0) markAll();
      else void refresh();
    }
  }

  // Marca una al abrirla (y navega si tiene enlace).
  const onPick = React.useCallback((n: NotificationItem) => {
    setOpen(false);
    if (n.read) return;
    setList((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    void markNotificationRead(n.id).catch(() => {});
  }, []);

  // Marca TODAS como leídas (botón explícito).
  const markAll = React.useCallback(() => {
    setUnread(0);
    setList((prev) => prev.map((n) => ({ ...n, read: true })));
    void markAllNotificationsRead().then(refresh).catch(() => {});
  }, [refresh]);

  // Borra una notificación (deslizar en móvil / botón en escritorio). Optimista + persiste.
  const deleteOne = React.useCallback((n: NotificationItem) => {
    setList((prev) => prev.filter((x) => x.id !== n.id));
    if (!n.read) setUnread((u) => Math.max(0, u - 1));
    void deleteNotification(n.id).catch(() => {});
  }, []);

  // Lista filtrada según la pestaña activa.
  const filtered = React.useMemo(
    () => (tab === "sinleer" ? list.filter((n) => !n.read) : list),
    [tab, list],
  );

  // Vista cronológica con franjas de tiempo (Todas / Sin leer).
  const buckets = React.useMemo(() => {
    if (tab === "persona") return [];
    const map = new Map<string, NotificationItem[]>();
    for (const n of filtered) {
      const b = bucketOf(n.createdAt);
      (map.get(b) ?? map.set(b, []).get(b)!).push(n);
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ label: b, items: map.get(b)! }));
  }, [filtered, tab]);

  // Vista agrupada por persona (Por persona): cada actor con sus avisos; el sistema, aparte.
  const personGroups = React.useMemo(() => {
    if (tab !== "persona") return [];
    const map = new Map<string, { actor: NotificationActor | null; items: NotificationItem[] }>();
    for (const n of filtered) {
      const key = n.actor ? `u:${n.actor.name}` : "__sistema__";
      if (!map.has(key)) map.set(key, { actor: n.actor ?? null, items: [] });
      map.get(key)!.items.push(n);
    }
    return [...map.values()].sort((a, b) => {
      // El sistema al final; el resto por aviso más reciente.
      if (!a.actor) return 1;
      if (!b.actor) return -1;
      return new Date(b.items[0].createdAt).getTime() - new Date(a.items[0].createdAt).getTime();
    });
  }, [filtered, tab]);

  const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
    { key: "todas", label: "Todas", icon: Bell },
    { key: "sinleer", label: "Sin leer", icon: CheckCheck },
    { key: "persona", label: "Por persona", icon: Users },
  ];

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
          <div className="absolute right-0 z-20 mt-2 w-[22rem] overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            {/* Cabecera: título + acciones */}
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <span className="shrink-0 whitespace-nowrap text-sm font-semibold">Notificaciones</span>
              <div className="flex items-center gap-1.5">
                {unread > 0 ? (
                  <button
                    type="button"
                    onClick={markAll}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary hover:bg-accent"
                  >
                    <CheckCheck className="size-3.5" /> Marcar todas
                  </button>
                ) : null}
                {notificationsSupported() && perm === "default" ? (
                  <button
                    type="button"
                    className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={async () => {
                      const ok = await ensureNotifyPermission();
                      setPerm(ok ? "granted" : notifyPermission());
                      if (ok) void subscribeBrowserPush();
                    }}
                  >
                    Activar avisos
                  </button>
                ) : null}
              </div>
            </div>

            {/* Pestañas */}
            <div className="flex gap-1 border-b border-border px-2 py-1.5">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "inline-flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
                      active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {t.label}
                    {t.key === "sinleer" && unread > 0 ? (
                      <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-white">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Contenido */}
            <div className="max-h-[28rem] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {tab === "sinleer" ? "Estás al día. Sin pendientes. 🎉" : "Sin notificaciones"}
                </p>
              ) : tab === "persona" ? (
                personGroups.map((g, i) => {
                  const gtint = g.actor?.color ? avatarTint(g.actor.color) : null;
                  return (
                  <div key={i} className="border-b border-border last:border-0">
                    <div className={cn("flex items-center gap-2 px-4 py-1.5", gtint ? cn("border-l-4", gtint.stripe, gtint.wash) : "bg-muted/40")}>
                      {g.actor ? (
                        <UserAvatar initials={g.actor.initials} name={g.actor.name} color={g.actor.color} url={g.actor.url} size="sm" />
                      ) : (
                        <span className="inline-flex size-6 items-center justify-center rounded-full bg-slate-400 text-white">
                          <Bell className="size-3" />
                        </span>
                      )}
                      <span className="text-xs font-semibold" style={g.actor?.color ? { color: avatarHex(g.actor.color) } : undefined}>{g.actor ? g.actor.name : "Sistema"}</span>
                      <span className="text-[10px] text-muted-foreground">· {g.items.length}</span>
                    </div>
                    {g.items.map((n) => (
                      <NotifRow key={n.id} n={n} onPick={onPick} onDelete={deleteOne} showActor={false} />
                    ))}
                  </div>
                  );
                })
              ) : (
                buckets.map((bk) => (
                  <div key={bk.label}>
                    <div className="bg-muted/40 px-4 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{bk.label}</div>
                    {bk.items.map((n) => (
                      <NotifRow key={n.id} n={n} onPick={onPick} onDelete={deleteOne} showActor />
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
