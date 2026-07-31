"use client";

import * as React from "react";
import { IconNotificaciones } from "@/components/icons";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, CheckSquare, Eye, Inbox, MessageSquare, Calendar, Clock, Shield, Bot, Users, X, Trash2, Moon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { avatarTint } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { markAllNotificationsRead, markNotificationRead, deleteNotification, setDoNotDisturb, type DndKind } from "@/lib/notify-actions";
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
  category?: string | null;
  priority?: number | null;
  groupKey?: string | null;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
  // Quién originó el aviso (actor) y, si no hay, la persona a la que pertenece (subject). La
  // campana colorea por actor ?? subject → los avisos del sistema también dicen "de quién son".
  actor?: NotificationActor | null;
  subject?: NotificationActor | null;
};

const POLL_MS = 20000; // cada 20 s buscamos notificaciones nuevas sin recargar

// La persona a la que pertenece el aviso: el actor si lo hay, si no el responsable (subject).
function whoOf(n: NotificationItem): NotificationActor | null {
  return n.actor ?? n.subject ?? null;
}

// Icono + tono por CATEGORÍA del catálogo (cubre todos los eventos). Se muestra como pequeña
// insignia sobre el avatar de la persona, o como icono principal cuando no hay persona.
const CATEGORY_META: Record<string, { icon: LucideIcon; tint: string }> = {
  "Tareas": { icon: CheckSquare, tint: "bg-blue-500" },
  "Entregables y revisiones": { icon: Eye, tint: "bg-amber-500" },
  "Chat": { icon: MessageSquare, tint: "bg-emerald-500" },
  "Agenda": { icon: Calendar, tint: "bg-violet-500" },
  "Administración": { icon: Shield, tint: "bg-rose-500" },
  "Recordatorios": { icon: Clock, tint: "bg-[#F47A20]" },
  "Marcebot": { icon: Bot, tint: "bg-slate-500" },
};
// Respaldo por `type` (avisos sin categoría catalogada).
const TYPE_TINT: Record<string, { icon: LucideIcon; tint: string }> = {
  task: { icon: CheckSquare, tint: "bg-blue-500" },
  review: { icon: Eye, tint: "bg-amber-500" },
  dm: { icon: MessageSquare, tint: "bg-emerald-500" },
  chat: { icon: MessageSquare, tint: "bg-emerald-500" },
  event: { icon: Calendar, tint: "bg-violet-500" },
  reminder: { icon: Clock, tint: "bg-[#F47A20]" },
};
function metaOf(n: NotificationItem) {
  return (n.category && CATEGORY_META[n.category]) || (n.type && TYPE_TINT[n.type]) || { icon: Bell, tint: "bg-slate-400" };
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
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}
// Fecha/hora absoluta (para el tooltip de la hora).
function timeExact(iso: string): string {
  return new Date(iso).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
// Etiqueta de "No molestar activo" ("hasta 3:45 p. m.").
function dndLabel(iso: string): string {
  return "hasta " + new Date(iso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit" });
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

// «Para ti» es la pestaña por defecto, y ese es el cambio de fondo: la campana deja de abrirse
// mostrando TODO lo que pasa en la empresa para abrirse mostrando lo que te pide algo. Lo demás
// no se pierde —sigue en «Todo»—, deja de ser lo primero que ves.
type Tab = "parati" | "todas" | "persona";

// La actividad de un proyecto se difunde a todos sus miembros (y a los administradores, a todos
// los proyectos). Nunca pide nada de nadie en concreto: es contexto. Un aviso DIRECTO —te
// asignaron, te mencionaron, te pidieron cambios— nace de una llamada a `notify` con su propio
// tipo. Esa línea ya existía en los datos; solo no se estaba usando para nada.
const esDirecto = (n: { type?: string | null }) => n.type !== "activity";

// Dónde se recuerda que ya se ofreció activar los avisos de fuera de la app (por navegador).
const OFERTA_PUSH_KEY = "ls-oferta-push";

// Los textos vienen del REGISTRO DE ACTIVIDAD, que se escribe para auditoría y por eso lo dice
// todo: «…añadió la v1 de «Prime 2026 Ingles V2» desde el disco (Camilo Ortega/VSL/Primer
// Performan/Prime 2026 Ingles V2.mp4)». Correcto en un log, excesivo en una campana que se lee
// de un vistazo.
//
// No se tocan los cien sitios que los generan —el log SÍ los necesita completos—: se acorta al
// mostrarlos. El paréntesis final es justo donde vive el detalle prescindible («(revisión
// directa)», «(pendiente de pre-aprobación interna)», la ruta entera del archivo), así que cae
// primero. El texto íntegro sigue en el `title` del elemento, a un segundo de distancia.
export function corto(texto: string, max = 96): string {
  const sinCola = texto.replace(/\s*\([^()]*\)\s*$/, "").trim() || texto.trim();
  if (sinCola.length <= max) return sinCola;
  // Se corta en el último espacio para no partir una palabra por la mitad.
  const recorte = sinCola.slice(0, max);
  const esp = recorte.lastIndexOf(" ");
  return `${(esp > max * 0.6 ? recorte.slice(0, esp) : recorte).trimEnd()}…`;
}

// Unidad de render: un aviso suelto o un grupo colapsado (ráfaga del mismo groupKey).
type Unit = { kind: "one"; n: NotificationItem } | { kind: "group"; key: string; items: NotificationItem[] };

// Colapsa ráfagas: los avisos con el mismo groupKey (p. ej. varios mensajes de un canal) se
// juntan en una sola fila. Los que no tienen groupKey van sueltos. Conserva el orden de entrada.
function collapse(items: NotificationItem[]): Unit[] {
  const groups = new Map<string, NotificationItem[]>();
  for (const n of items) if (n.groupKey) groups.set(n.groupKey, [...(groups.get(n.groupKey) ?? []), n]);
  const out: Unit[] = [];
  const emitted = new Set<string>();
  for (const n of items) {
    if (n.groupKey) {
      const g = groups.get(n.groupKey)!;
      if (g.length > 1) {
        if (!emitted.has(n.groupKey)) { emitted.add(n.groupKey); out.push({ kind: "group", key: n.groupKey, items: g }); }
        continue;
      }
    }
    out.push({ kind: "one", n });
  }
  return out;
}

// Avatar de la persona (con su color) + insignia de categoría; o icono de categoría si no hay persona.
function NotifAvatar({ n }: { n: NotificationItem }) {
  const meta = metaOf(n);
  const Icon = meta.icon;
  const who = whoOf(n);
  if (!who) {
    return (
      <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full text-white", meta.tint)}>
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <div className="relative shrink-0">
      <UserAvatar initials={who.initials} name={who.name} color={who.color} url={who.url} size="md" />
      <span className={cn("absolute -bottom-1 -right-1 inline-flex size-4 items-center justify-center rounded-full text-white ring-2 ring-popover", meta.tint)}>
        <Icon className="size-2.5" />
      </span>
    </div>
  );
}

function PriorityChip({ p }: { p?: number | null }) {
  if (!p || p < 1) return null;
  if (p >= 2) return <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 dark:text-red-300">Urgente</span>;
  return <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-300">Importante</span>;
}

// `nuevo` (aspecto de no leído) va aparte de `n.read`: al abrir la campana los avisos se
// marcan leídos en el servidor —el contador vuelve a cero— pero la fila SIGUE resaltada
// mientras el panel está abierto, para poder triar de un vistazo lo que acaba de llegar.
function NotifRow({ n, nuevo, onPick, onDelete }: { n: NotificationItem; nuevo?: boolean; onPick: (n: NotificationItem) => void; onDelete: (n: NotificationItem) => void }) {
  const router = useRouter();
  const isNew = nuevo ?? !n.read;
  const startX = React.useRef(0);
  const startY = React.useRef(0);
  const swiping = React.useRef(false);
  const [dx, setDx] = React.useState(0);
  const [removing, setRemoving] = React.useState(false);

  const remove = () => { setRemoving(true); window.setTimeout(() => onDelete(n), 160); };

  const onTouchStart = (e: React.TouchEvent) => { startX.current = e.touches[0].clientX; startY.current = e.touches[0].clientY; swiping.current = false; };
  const onTouchMove = (e: React.TouchEvent) => {
    const ddx = e.touches[0].clientX - startX.current;
    const ddy = e.touches[0].clientY - startY.current;
    if (!swiping.current && Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy)) swiping.current = true;
    if (swiping.current) setDx(ddx);
  };
  const onTouchEnd = () => { if (swiping.current && Math.abs(dx) > 96) remove(); else setDx(0); };

  const activate = () => {
    if (Math.abs(dx) > 8) { setDx(0); return; }
    onPick(n);
    if (n.link) router.push(n.link);
  };

  // Color de la persona a la que pertenece (actor o responsable): franja lateral. El no-leído se
  // ve por el TÍTULO en negrita + el punto, no por el fondo (así no depende del color de persona).
  const who = whoOf(n);
  const tint = who?.color ? avatarTint(who.color) : null;

  return (
    <div className="group/row relative border-b border-border last:border-0">
      {/* Fondo de "deslizar para borrar": SOLO visible mientras se arrastra la fila (dx≠0). Si
          se dejara siempre montado, su tinte rojo y los íconos de basura se traslucirían por
          debajo del contenido (que es semi-transparente para el tinte de "no leído") y pintaban
          toda la lista de rosa con un icono rojo asomando en cada avatar. */}
      {dx !== 0 ? (
        <div className={cn("pointer-events-none absolute inset-0 flex items-center bg-destructive/10 px-4 text-destructive", dx > 0 ? "justify-start" : "justify-end")}>
          <Trash2 className="size-4" />
        </div>
      ) : null}
      <div
        role="button"
        tabIndex={0}
        aria-label={n.title}
        onClick={activate}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); } }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${dx}px)`, opacity: removing ? 0 : 1, transition: swiping.current ? "none" : "transform .2s ease, opacity .15s ease" }}
        className={cn(
          "relative flex cursor-pointer items-start gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          // Mientras se desliza (dx≠0), fondo OPACO para que la fila tape el rojo y se lea el gesto;
          // se conserva la franja lateral para no provocar un salto de 4px al empezar a arrastrar.
          tint
            ? cn("border-l-4", tint.stripe, dx !== 0 ? "bg-popover" : isNew && tint.wash)
            : dx !== 0 ? "bg-popover" : isNew && "bg-primary/5",
        )}
      >
        <NotifAvatar n={n} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            {/* `title` con el texto íntegro: se acorta para leer de un vistazo, no para
                esconder nada — el detalle completo está a un segundo de distancia. */}
            <p title={n.title} className={cn("text-sm leading-snug", isNew ? "font-semibold" : "font-normal text-foreground/90")}>
              <PriorityChip p={n.priority} /> {corto(n.title)}
            </p>
            <span suppressHydrationWarning title={timeExact(n.createdAt)} className="shrink-0 pt-0.5 text-[10px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
          </div>
          {n.body ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p> : null}
          {who ? <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">{who.name}</p> : null}
        </div>
        {isNew ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Sin leer" /> : null}
        <button
          type="button"
          aria-label="Borrar notificación"
          onClick={(e) => { e.stopPropagation(); remove(); }}
          className="absolute right-1.5 bottom-1.5 hidden size-7 items-center justify-center rounded-full bg-popover text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/row:opacity-100 md:flex"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// Fila de un GRUPO colapsado (ráfaga): "N avisos" de la misma persona/origen. Clic → abre el
// último y marca el grupo leído.
function GroupRow({ items, nuevos, onOpen, onDeleteGroup }: { items: NotificationItem[]; nuevos?: number; onOpen: (items: NotificationItem[]) => void; onDeleteGroup: (items: NotificationItem[]) => void }) {
  const latest = items[0];
  const who = whoOf(latest);
  const tint = who?.color ? avatarTint(who.color) : null;
  const unread = nuevos ?? items.filter((x) => !x.read).length;
  return (
    <div className="group/row relative border-b border-border last:border-0">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(items)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(items); } }}
        className={cn(
          "relative flex cursor-pointer items-start gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          tint ? cn("border-l-4", tint.stripe, unread && tint.wash) : unread && "bg-primary/5",
        )}
      >
        <NotifAvatar n={latest} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={cn("text-sm leading-snug", unread ? "font-semibold" : "font-normal text-foreground/90")}>
              {items.length} avisos{who ? <span className="font-normal text-muted-foreground"> · {who.name}</span> : null}
            </p>
            <span suppressHydrationWarning className="shrink-0 pt-0.5 text-[10px] text-muted-foreground">{timeAgo(latest.createdAt)}</span>
          </div>
          <p title={latest.title} className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{corto(latest.title, 70)}{latest.body ? ` — ${latest.body}` : ""}</p>
        </div>
        {unread ? <span className="mt-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">{unread}</span> : null}
        <button type="button" aria-label="Borrar grupo" onClick={(e) => { e.stopPropagation(); onDeleteGroup(items); }} className="absolute right-1.5 bottom-1.5 hidden size-7 items-center justify-center rounded-full bg-popover text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/row:opacity-100 md:flex">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function NotificationsBell({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("parati");
  const [list, setList] = React.useState<NotificationItem[]>(items);
  const [unread, setUnread] = React.useState(items.filter((n) => !n.read).length);
  // El número de la campana cuenta SOLO lo directo. Antes contaba todo, y como la actividad del
  // equipo se difunde a todos los miembros —y a los administradores, la de todos los proyectos—
  // el contador vivía en dos dígitos permanentemente. Un número que nunca baja deja de
  // significar algo y se aprende a ignorar, que es justo lo contrario de para lo que está.
  const [directos, setDirectos] = React.useState(items.filter((n) => !n.read && esDirecto(n)).length);
  const [perm, setPerm] = React.useState<ReturnType<typeof notifyPermission>>("default");
  // ¿Ya se ofreció avisar fuera de la app? Se recuerda en el navegador y no en el servidor a
  // propósito: el permiso es DEL NAVEGADOR, no de la cuenta. La misma persona en el portátil y
  // en el móvil tiene dos respuestas distintas, y guardarlo en su ficha haría que decir «ahora
  // no» en un sitio le apagara la oferta en el otro, donde quizá sí quería.
  const [ofertaOculta, setOfertaOculta] = React.useState(true); // se decide al montar
  React.useEffect(() => {
    try { setOfertaOculta(localStorage.getItem(OFERTA_PUSH_KEY) === "1"); } catch { setOfertaOculta(false); }
  }, []);
  const ocultarOferta = React.useCallback(() => {
    setOfertaOculta(true);
    try { localStorage.setItem(OFERTA_PUSH_KEY, "1"); } catch { /* modo privado: se volverá a ofrecer */ }
  }, []);
  // "No molestar": instante ISO hasta el que está activo, o null. Silencia push/correo; la
  // campana in-app sigue acumulando.
  const [dndUntil, setDndUntil] = React.useState<string | null>(null);
  // Avisos que YA se marcaron leídos al abrir la campana pero siguen pintados como nuevos
  // mientras el panel está abierto (así el contador se reinicia sin perder el triaje).
  const [sticky, setSticky] = React.useState<Set<string>>(() => new Set());
  const esNuevo = React.useCallback((n: NotificationItem) => !n.read || sticky.has(n.id), [sticky]);
  const pendientes = React.useMemo(() => list.filter(esNuevo).length, [list, esNuevo]);

  const seen = React.useRef<Set<string>>(new Set(items.map((n) => n.id)));

  React.useEffect(() => { setPerm(notifyPermission()); }, []);

  const lastRun = React.useRef(0);
  const refresh = React.useCallback(async () => {
    lastRun.current = Date.now();
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { items: NotificationItem[]; unread: number; unreadDirecto?: number; dndUntil?: string | null };
      const focused = typeof document !== "undefined" && document.hasFocus();
      const fresh = data.items.filter((n) => !n.read && !seen.current.has(n.id));
      if (!focused) {
        for (const n of fresh.slice(0, 3)) void showNative({ title: n.title, body: n.body, link: n.link });
      }
      for (const n of data.items) seen.current.add(n.id);
      setList(data.items);
      setUnread(data.unread);
      // Si el servidor todavía no manda el contador nuevo (despliegue a medias), se calcula
      // aquí con lo que hay: la campana nunca debe quedarse sin número por eso.
      setDirectos(data.unreadDirecto ?? data.items.filter((n) => !n.read && esDirecto(n)).length);
      setDndUntil(data.dndUntil ?? null);
    } catch { /* sin red: reintenta en el siguiente ciclo */ }
  }, []);

  // Un refresco al montar para conocer el estado de "No molestar" sin esperar al primer sondeo.
  React.useEffect(() => { void refresh(); }, [refresh]);

  const applyDnd = React.useCallback((kind: DndKind) => {
    void setDoNotDisturb(kind).then((r) => { if (r.ok) setDndUntil(r.until); });
  }, []);
  const refreshIfStale = React.useCallback(() => { if (Date.now() - lastRun.current > 4000) void refresh(); }, [refresh]);

  React.useEffect(() => {
    const id = setInterval(refresh, POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") refreshIfStale(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refreshIfStale);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", refreshIfStale); };
  }, [refresh, refreshIfStale]);

  // Abrir el panel = verlas: el contador vuelve a CERO (se marcan leídas en el servidor). Las
  // filas conservan su resaltado mientras el panel siga abierto —vía `sticky`— para poder triar
  // lo que acaba de llegar. Se refresca DESPUÉS de marcar, si no el sondeo devolvería el
  // contador viejo y el globo parpadearía de vuelta.
  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    const nuevos = list.filter((n) => !n.read).map((n) => n.id);
    if (nuevos.length === 0 && unread === 0) {
      void refresh();
      return;
    }
    setSticky((s) => new Set([...s, ...nuevos]));
    setList((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));
    setUnread(0);
    void markAllNotificationsRead().then(refresh).catch(() => {});
  }

  // Al cerrar el panel, lo triado se asienta: las filas dejan de verse como nuevas.
  React.useEffect(() => {
    if (!open) setSticky((s) => (s.size ? new Set() : s));
  }, [open]);

  const onPick = React.useCallback((n: NotificationItem) => {
    setOpen(false);
    if (n.read) return;
    setList((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
    void markNotificationRead(n.id).catch(() => {});
  }, []);

  const markAll = React.useCallback(() => {
    setSticky(new Set());
    setUnread(0);
    setList((prev) => prev.map((n) => ({ ...n, read: true })));
    void markAllNotificationsRead().then(refresh).catch(() => {});
  }, [refresh]);

  const deleteOne = React.useCallback((n: NotificationItem) => {
    setList((prev) => prev.filter((x) => x.id !== n.id));
    if (!n.read) setUnread((u) => Math.max(0, u - 1));
    void deleteNotification(n.id).catch(() => {});
  }, []);

  // Abrir un GRUPO: marca sus avisos como leídos y navega al último.
  const openGroup = React.useCallback((groupItems: NotificationItem[]) => {
    setOpen(false);
    const unreadOnes = groupItems.filter((x) => !x.read);
    if (unreadOnes.length) {
      const ids = new Set(unreadOnes.map((x) => x.id));
      setList((prev) => prev.map((x) => (ids.has(x.id) ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - unreadOnes.length));
      unreadOnes.forEach((x) => void markNotificationRead(x.id).catch(() => {}));
    }
    const link = groupItems.find((x) => x.link)?.link;
    if (link) router.push(link);
  }, [router]);

  const deleteGroup = React.useCallback((groupItems: NotificationItem[]) => {
    const ids = new Set(groupItems.map((x) => x.id));
    const unreadOnes = groupItems.filter((x) => !x.read).length;
    setList((prev) => prev.filter((x) => !ids.has(x.id)));
    if (unreadOnes) setUnread((u) => Math.max(0, u - unreadOnes));
    groupItems.forEach((x) => void deleteNotification(x.id).catch(() => {}));
  }, []);

  const filtered = React.useMemo(() => (tab === "parati" ? list.filter(esDirecto) : list), [tab, list]);

  const buckets = React.useMemo(() => {
    if (tab === "persona") return [];
    const map = new Map<string, NotificationItem[]>();
    for (const n of filtered) {
      const b = bucketOf(n.createdAt);
      (map.get(b) ?? map.set(b, []).get(b)!).push(n);
    }
    return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ label: b, units: collapse(map.get(b)!) }));
  }, [filtered, tab]);

  const personGroups = React.useMemo(() => {
    if (tab !== "persona") return [];
    const map = new Map<string, { actor: NotificationActor | null; items: NotificationItem[] }>();
    for (const n of filtered) {
      const who = whoOf(n);
      const key = who ? `u:${who.name}` : "__sistema__";
      if (!map.has(key)) map.set(key, { actor: who, items: [] });
      map.get(key)!.items.push(n);
    }
    return [...map.values()].sort((a, b) => {
      if (!a.actor) return 1;
      if (!b.actor) return -1;
      return new Date(b.items[0].createdAt).getTime() - new Date(a.items[0].createdAt).getTime();
    });
  }, [filtered, tab]);

  const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
    // TRES pestañas, no cuatro, y está medido: con la tipografía real de la app, cuatro con
    // icono piden 96 px por pestaña y solo hay 81 → la fila se parte en dos. Tres caben con
    // holgura (90 de 109) y aguantan hasta una ventana de 320 px, que es justo donde las
    // etiquetas largas se rompían antes.
    //
    // «Sin leer» desaparece porque «Para ti» hace su trabajo mejor: lo que se quería al pulsarla
    // era triar, y lo que hay que triar es lo que te pide algo, no lo que aún no has abierto.
    // Lo no leído sigue marcado en negrita con su punto, y «Marcar todas» sigue donde estaba.
    { key: "parati", label: "Para ti", icon: Inbox },
    { key: "todas", label: "Todo", icon: Bell },
    { key: "persona", label: "Personas", icon: Users },
  ];

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" className="relative text-muted-foreground" aria-label="Notificaciones" onClick={toggle}>
        <IconNotificaciones className="size-5" />
        {directos > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {directos > 9 ? "9+" : directos}
          </span>
        ) : null}
      </Button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
              <span className="shrink-0 whitespace-nowrap text-sm font-semibold">Notificaciones</span>
              <div className="flex items-center gap-1.5">
                {/* No molestar: silencia push/correo; la campana sigue acumulando. */}
                <details className="relative">
                  <summary className={cn("flex cursor-pointer list-none items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium", dndUntil ? "bg-[#F47A20]/15 text-[#F47A20]" : "text-muted-foreground hover:bg-accent")}>
                    <Moon className="size-3.5" /> {dndUntil ? dndLabel(dndUntil) : "No molestar"}
                  </summary>
                  <div className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-border bg-popover p-1 text-xs shadow-lg">
                    {dndUntil ? (
                      <button type="button" onClick={(e) => { applyDnd("off"); (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-medium text-primary hover:bg-muted">Reactivar avisos</button>
                    ) : null}
                    {(["30m", "1h", "untilTomorrow"] as DndKind[]).map((k) => (
                      <button key={k} type="button" onClick={(e) => { applyDnd(k); (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-muted">
                        {k === "30m" ? "Durante 30 minutos" : k === "1h" ? "Durante 1 hora" : "Hasta mañana"}
                      </button>
                    ))}
                  </div>
                </details>
                {pendientes > 0 ? (
                  <button type="button" onClick={markAll} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary hover:bg-accent">
                    <CheckCheck className="size-3.5" /> Marcar todas
                  </button>
                ) : null}
              </div>
            </div>

            {/* ── Ofrecer el aviso fuera de la app ──────────────────────────────────────────
                Esto era un botón pequeño («Activar avisos») entre los demás controles de la
                cabecera, y el resultado predecible: nadie lo veía y el push no llegaba nunca.
                Ahora se ofrece UNA vez, en su propia franja, la primera vez que se abre la
                campana — y si se dice que no, no se vuelve a preguntar.
                No se puede pedir el permiso al cargar la página: los navegadores exigen un
                gesto del usuario, y un aviso disparado sin contexto se deniega casi siempre.
                Una denegación es pegajosa y difícil de deshacer, así que preguntar en mal
                momento es peor que no preguntar. Abrir la campana ES ese gesto: se está
                mirando esto justamente. */}
            {notificationsSupported() && perm === "default" && !ofertaOculta ? (
              <div className="flex items-start gap-2 border-b border-border bg-primary/5 px-3 py-2.5">
                <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] leading-snug text-foreground">Avisarte aunque no tengas la app abierta</p>
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      type="button"
                      className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                      onClick={async () => {
                        const ok = await ensureNotifyPermission();
                        setPerm(ok ? "granted" : notifyPermission());
                        if (ok) void subscribeBrowserPush();
                        // Se haya concedido o no, la oferta ya se hizo: no se insiste.
                        ocultarOferta();
                      }}
                    >
                      Activar
                    </button>
                    <button
                      type="button"
                      className="rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent"
                      onClick={ocultarOferta}
                    >
                      Ahora no
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

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
                    <Icon className="size-3.5 shrink-0" />
                    {/* Sin `whitespace-nowrap` la etiqueta se parte en dos líneas y la fila
                        entera crece torcida en cuanto la ventana se estrecha. */}
                    <span className="whitespace-nowrap">{t.label}</span>
                    {t.key === "parati" && directos > 0 ? (
                      <span className="ml-0.5 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-white">{directos > 9 ? "9+" : directos}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="max-h-[28rem] overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {tab === "parati" ? "Nada que te pida algo. Lo del equipo está en «Todo»." : "Sin notificaciones"}
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
                          <span className="inline-flex size-6 items-center justify-center rounded-full bg-slate-400 text-white"><Bell className="size-3" /></span>
                        )}
                        <span className="text-xs font-semibold text-foreground">{g.actor ? g.actor.name : "Sistema"}</span>
                        <span className="text-[10px] text-muted-foreground">· {g.items.length}</span>
                      </div>
                      {g.items.map((n) => (<NotifRow key={n.id} n={n} nuevo={esNuevo(n)} onPick={onPick} onDelete={deleteOne} />))}
                    </div>
                  );
                })
              ) : (
                buckets.map((bk) => (
                  <div key={bk.label}>
                    <div className="sticky top-0 z-[1] bg-muted/90 px-4 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{bk.label}</div>
                    {bk.units.map((u) =>
                      u.kind === "group"
                        ? <GroupRow key={`g:${u.key}`} items={u.items} nuevos={u.items.filter(esNuevo).length} onOpen={openGroup} onDeleteGroup={deleteGroup} />
                        : <NotifRow key={u.n.id} n={u.n} nuevo={esNuevo(u.n)} onPick={onPick} onDelete={deleteOne} />,
                    )}
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
