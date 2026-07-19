"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlarmClock,
  Archive,
  CalendarDays,
  ChevronRight,
  FileCheck2,
  Home,
  ListTodo,
  LogOut,
  MessageCircle,
  Package,
  Plus,
  Search,
  Settings,
  Star,
  StickyNote,
} from "lucide-react";
import {
  IconFacturacion,
  IconComercial,
  IconWiki,
  IconBiblioteca,
  IconReportes,
  IconPapelera,
  IconBuscar,
} from "@/components/icons";
import { EntityEmoji } from "@/components/icons/marks";
import { TONE_MAP } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import { Logo, LogoMark } from "@/components/brand/logo";
import { logout } from "@/lib/auth-actions";
import { archiveClient } from "@/app/(app)/clientes/actions";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useChatLive } from "@/components/layout/chat-live";

// ── Barra lateral "Rail + Panel" ──
// Dos niveles (como las apps pro): un RAIL de iconos siempre visible con la navegación
// principal y sus avisos, y un PANEL de Producción dedicado a lo que es el corazón del
// estudio: clientes (en negrilla, con su foto/logo real) y sus proyectos, con anclados ⭐
// y filtro. Colapsar (topbar) cierra el panel y DEJA EL RAIL ÚTIL — ya no hay barra muerta.
// El panel se redimensiona arrastrando su borde; el ancho se recuerda POR DISPOSITIVO
// (localStorage), el colapso sigue sincronizado en la cuenta (BD) como siempre.
// En móvil nada cambia: el cajón usa la variante `drawer` (una sola columna).

export type SidebarUser = {
  name: string;
  title: string | null;
  initials: string | null;
  color: string | null;
  avatarUrl?: string | null;
};

export type SidebarProject = { id: string; name: string; emoji: string | null };

export type SidebarClient = {
  id: string;
  name: string;
  emoji: string | null;
  accentColor: string | null;
  photoUrl?: string | null;
  logoUrl?: string | null;
  logoBg?: string | null;
  projectCount: number;
  projects: SidebarProject[];
};

// Color estable por cliente: su tono elegido (ficha) o, si no tiene, uno derivado del
// nombre — así TODOS los clientes tienen identidad de color aunque no hayan configurado nada.
const FALLBACK_HEX = ["#6366f1", "#f43f5e", "#f59e0b", "#10b981", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#3b82f6"];
function clientHex(c: Pick<SidebarClient, "name" | "accentColor">): string {
  if (c.accentColor && TONE_MAP[c.accentColor]) return TONE_MAP[c.accentColor].hex;
  let h = 0;
  for (let i = 0; i < c.name.length; i++) h = (h * 31 + c.name.charCodeAt(i)) | 0;
  return FALLBACK_HEX[Math.abs(h) % FALLBACK_HEX.length];
}

// Identidad visual del cliente: foto real → logo (con su fondo) → emoji teñido → iniciales
// sobre su color. Nunca queda un hueco.
function ClientAvatar({ client, hex, className }: { client: SidebarClient; hex: string; className?: string }) {
  const [broken, setBroken] = React.useState(false);
  const base = cn("relative size-6 shrink-0 overflow-hidden rounded-[7px]", className);
  if (client.photoUrl && !broken) {
    return (
      <span className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={client.photoUrl} alt="" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
      </span>
    );
  }
  if (client.logoUrl && !broken) {
    return (
      <span className={base} style={{ background: client.logoBg || "#ffffff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={client.logoUrl} alt="" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-contain p-0.5" />
      </span>
    );
  }
  if (client.emoji) {
    return (
      <span className={cn(base, "grid place-items-center")} style={{ background: `${hex}22` }}>
        <EntityEmoji value={client.emoji} fallback="•" className="size-4" />
      </span>
    );
  }
  const initials = client.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span
      className={cn(base, "grid place-items-center text-[10px] font-bold text-white")}
      style={{ background: `linear-gradient(135deg, ${hex}, ${hex}cc)` }}
    >
      {initials}
    </span>
  );
}

// Anclados del usuario (clientes/proyectos favoritos): por dispositivo, sin tocar la BD.
const PINS_KEY = "ls:sidebar:pins:v1";
type Pins = { c: string[]; p: string[] };
function loadPins(): Pins {
  try {
    const raw = window.localStorage.getItem(PINS_KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<Pins>;
      return { c: Array.isArray(j.c) ? j.c : [], p: Array.isArray(j.p) ? j.p : [] };
    }
  } catch {}
  return { c: [], p: [] };
}

// Ancho del panel: por dispositivo (cada pantalla tiene su ancho ideal).
const WIDTH_KEY = "ls:sidebar:w:v1";
const W_MIN = 240;
const W_MAX = 400;
const W_DEF = 288;

// Filtro insensible a acentos/mayúsculas ("cli" encuentra "CLÍNICA").
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Sidebar({
  user,
  clients,
  canAdmin,
  canQuotes,
  canComercial = false,
  canAsistente = true,
  canWiki = true,
  canBiblioteca = true,
  canCalendar = true,
  canTimeline = true,
  canReports = true,
  canClients = true,
  canPapelera = false,
  isCliente = false,
  collapsed = false,
  drawer = false,
  chatUnread = 0,
  reviewPending = 0,
  remindersToday = 0,
  onNavigate,
  onSearch,
}: {
  user: SidebarUser;
  clients: SidebarClient[];
  canAdmin: boolean;
  canQuotes?: boolean;
  canComercial?: boolean;
  canAsistente?: boolean;
  canWiki?: boolean;
  canBiblioteca?: boolean;
  canCalendar?: boolean;
  canTimeline?: boolean;
  canReports?: boolean;
  canClients?: boolean;
  canPapelera?: boolean;
  isCliente?: boolean;
  collapsed?: boolean;
  drawer?: boolean;
  chatUnread?: number;
  reviewPending?: number;
  remindersToday?: number;
  onNavigate?: () => void;
  onSearch?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startDelete] = React.useTransition();
  const { confirm, dialog } = useConfirmDialog();
  // Badge de Chats VIVO: el stream global manda; el valor server-render solo arranca.
  const live = useChatLive();
  const chatBadge = live.total ?? chatUnread;

  // ── Navegación del rail (misma lógica de permisos/portal del sidebar anterior) ──
  const NAV: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number; show: boolean; active: boolean }[] = [
    { href: "/mis-entregas", label: "Mis entregas", icon: Package, show: isCliente, active: pathname.startsWith("/mis-entregas") },
    { href: "/", label: "Inicio", icon: Home, show: !isCliente, active: pathname === "/" },
    { href: "/mis-tareas", label: "Mis tareas", icon: ListTodo, show: !isCliente, active: pathname === "/mis-tareas" },
    { href: "/recordatorios", label: "Recordatorios", icon: AlarmClock, badge: remindersToday || undefined, show: !isCliente, active: pathname === "/recordatorios" },
    { href: "/chat", label: "Chats", icon: MessageCircle, badge: chatBadge || undefined, show: true, active: pathname === "/chat" || pathname.startsWith("/chat/") },
    { href: "/revisiones", label: "Proyectos a revisar", icon: FileCheck2, badge: reviewPending || undefined, show: !isCliente, active: pathname.startsWith("/revisiones") },
    { href: "/calendario", label: "Calendario", icon: CalendarDays, show: canCalendar, active: pathname === "/calendario" },
    { href: "/notas", label: "Notas", icon: StickyNote, show: !isCliente, active: pathname === "/notas" },
  ];

  // Archivar un cliente (solo admin): borrado SUAVE (restaurable desde /clientes).
  async function removeClient(id: string, name: string) {
    if (!(await confirm({ title: "Archivar cliente", message: `¿Archivar el cliente «${name}»? Saldrá de las listas pero NO se borra nada: sus facturas, cotizaciones y proyectos se conservan y podrás restaurarlo.`, confirmLabel: "Archivar" }))) return;
    startDelete(async () => { await archiveClient(id); router.refresh(); });
  }

  // ── Estado del panel ──
  const [width, setWidth] = React.useState(W_DEF);
  const [dragging, setDragging] = React.useState(false);
  React.useEffect(() => {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY));
    if (saved >= W_MIN && saved <= W_MAX) setWidth(saved);
  }, []);
  const dragRef = React.useRef<{ x: number; w: number } | null>(null);
  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: e.clientX, w: width };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setWidth(Math.min(W_MAX, Math.max(W_MIN, dragRef.current.w + e.clientX - dragRef.current.x)));
  };
  const onHandleUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    setWidth((w) => { window.localStorage.setItem(WIDTH_KEY, String(w)); return w; });
  };
  const resetWidth = () => { setWidth(W_DEF); window.localStorage.setItem(WIDTH_KEY, String(W_DEF)); };

  // Filtro de clientes (insensible a acentos) y anclados ⭐ (por dispositivo).
  const [filtro, setFiltro] = React.useState("");
  const [pins, setPins] = React.useState<Pins>({ c: [], p: [] });
  React.useEffect(() => { setPins(loadPins()); }, []);
  const savePins = (next: Pins) => { setPins(next); try { window.localStorage.setItem(PINS_KEY, JSON.stringify(next)); } catch {} };
  const togglePinClient = (id: string) => savePins({ ...pins, c: pins.c.includes(id) ? pins.c.filter((x) => x !== id) : [...pins.c, id] });
  const togglePinProject = (id: string) => savePins({ ...pins, p: pins.p.includes(id) ? pins.p.filter((x) => x !== id) : [...pins.p, id] });

  // Proyecto activo (para resaltar y auto-desplegar su cliente).
  const activeProjectId = pathname.startsWith("/proyectos/") ? pathname.split("/")[2] : null;
  const [openMap, setOpenMap] = React.useState<Record<string, boolean>>({});
  const isClientOpen = (c: SidebarClient) => openMap[c.id] ?? c.projects.some((p) => p.id === activeProjectId);

  // Sección "Administrativo" desplegable (recuerda el estado; se abre sola si estás dentro).
  const adminActive = pathname.startsWith("/cotizaciones") || pathname.startsWith("/facturacion") || pathname === "/asistente" || pathname.startsWith("/wiki") || pathname.startsWith("/plantillas") || pathname.startsWith("/biblioteca") || pathname.startsWith("/comercial") || pathname.startsWith("/reportes") || pathname.startsWith("/papelera");
  const [adminOpen, setAdminOpen] = React.useState(true);
  React.useEffect(() => {
    const saved = window.localStorage.getItem("ui:adminOpen");
    if (saved != null) setAdminOpen(saved === "1");
  }, []);
  const toggleAdmin = () => setAdminOpen((o) => { const n = !o; window.localStorage.setItem("ui:adminOpen", n ? "1" : "0"); return n; });
  const showAdminItems = adminOpen || adminActive;

  const filtered = filtro.trim() ? clients.filter((c) => fold(c.name).includes(fold(filtro))) : clients;
  const pinnedClients = clients.filter((c) => pins.c.includes(c.id));
  const pinnedProjects = clients.flatMap((c) => c.projects.filter((p) => pins.p.includes(p.id)).map((p) => ({ p, c })));
  const hayAnclados = pinnedClients.length > 0 || pinnedProjects.length > 0;

  // ── Piezas reutilizables (panel y cajón móvil) ──

  // Fila de un proyecto (anidada bajo su cliente o en Anclados).
  const projectRow = (p: SidebarProject, c: SidebarClient, hex: string, { pinnable = true, indent = false }: { pinnable?: boolean; indent?: boolean } = {}) => {
    const pActive = activeProjectId === p.id;
    const pinned = pins.p.includes(p.id);
    return (
      <div
        key={p.id}
        className={cn(
          "group/pj relative flex items-center rounded-lg text-[13px] transition-colors",
          pActive ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40",
        )}
      >
        {indent ? <span className="w-6 shrink-0" /> : null}
        <Link href={`/proyectos/${p.id}`} onClick={onNavigate} title={p.name} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 pr-1">
          <span className="size-1.5 shrink-0 rounded-[3px]" style={{ background: hex }} />
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
        </Link>
        {pinnable ? (
          <button
            type="button"
            onClick={() => togglePinProject(p.id)}
            title={pinned ? "Desanclar" : "Anclar"}
            aria-label={pinned ? `Desanclar ${p.name}` : `Anclar ${p.name}`}
            className={cn(
              "mr-1 size-5 shrink-0 place-items-center rounded-md",
              pinned ? "grid text-amber-500" : "hidden text-sidebar-muted hover:text-amber-500 group-hover/pj:grid",
            )}
          >
            <Star className={cn("size-3", pinned && "fill-current")} />
          </button>
        ) : null}
      </div>
    );
  };

  // Bloque de un cliente: fila (avatar real + NEGRILLA + acciones al pasar) + proyectos.
  const clientBlock = (c: SidebarClient) => {
    const hex = clientHex(c);
    const active = pathname === `/clientes/${c.id}`;
    const open = isClientOpen(c);
    const hasProjects = c.projects.length > 0;
    const pinned = pins.c.includes(c.id);
    return (
      <div key={c.id}>
        <div
          className={cn(
            "group/cli relative flex items-center rounded-lg text-sm transition-colors",
            active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/40",
          )}
        >
          {active ? <span className="absolute inset-y-1.5 -left-1.5 w-[3px] rounded-r-full bg-primary" /> : null}
          {hasProjects ? (
            <button
              type="button"
              onClick={() => setOpenMap((m) => ({ ...m, [c.id]: !open }))}
              aria-label={open ? "Contraer" : "Desplegar"}
              className="grid size-6 shrink-0 place-items-center rounded-md text-sidebar-muted hover:text-sidebar-foreground"
            >
              <ChevronRight className={cn("size-3.5 transition-transform duration-150", open && "rotate-90")} />
            </button>
          ) : (
            <span className="w-6 shrink-0" />
          )}
          <Link href={`/clientes/${c.id}`} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5 py-[7px] pr-1">
            <ClientAvatar client={c} hex={hex} />
            <span className="min-w-0 flex-1 truncate font-bold tracking-[0.005em] text-sidebar-foreground">{c.name}</span>
          </Link>
          <span className="px-1.5 text-xs tabular-nums text-sidebar-muted group-hover/cli:hidden">{c.projectCount}</span>
          <span className="mr-1 hidden shrink-0 items-center gap-0.5 group-hover/cli:flex">
            <button
              type="button"
              onClick={() => togglePinClient(c.id)}
              title={pinned ? "Desanclar" : "Anclar arriba"}
              aria-label={pinned ? `Desanclar ${c.name}` : `Anclar ${c.name}`}
              className={cn("grid size-6 place-items-center rounded-md", pinned ? "text-amber-500" : "text-sidebar-muted hover:text-amber-500")}
            >
              <Star className={cn("size-3.5", pinned && "fill-current")} />
            </button>
            {canAdmin ? (
              <button
                type="button"
                onClick={() => removeClient(c.id, c.name)}
                title="Archivar cliente"
                aria-label={`Archivar ${c.name}`}
                className="grid size-6 place-items-center rounded-md text-sidebar-muted hover:bg-destructive/10 hover:text-destructive"
              >
                <Archive className="size-3.5" />
              </button>
            ) : null}
          </span>
        </div>
        {open && hasProjects ? (
          <div
            className="ml-[26px] flex flex-col gap-0.5 border-l-2 pb-1 pl-2.5 pt-0.5 animate-in fade-in slide-in-from-top-1 duration-150"
            style={{ borderColor: `${hex}66` }}
          >
            {c.projects.map((p) => projectRow(p, c, hex))}
          </div>
        ) : null}
      </div>
    );
  };

  // Cabecera de sección del panel (etiqueta pequeña en mayúsculas).
  const secHeader = (label: React.ReactNode, extra?: React.ReactNode) => (
    <div className="flex items-center justify-between px-2 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-sidebar-muted">
      <span className="flex items-center gap-1.5">{label}</span>
      {extra}
    </div>
  );

  // Contenido de PRODUCCIÓN (anclados ⭐ + filtro + clientes) — corazón del panel.
  const produccion = (
    <>
      {canClients ? (
        <>
          <div className="relative px-1 pb-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-[60%] text-sidebar-muted" />
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar clientes…"
              className="w-full rounded-lg border border-sidebar-border bg-background/60 py-1.5 pl-8 pr-2.5 text-[13px] text-sidebar-foreground outline-none transition-colors placeholder:text-sidebar-muted focus:border-primary focus:bg-background"
            />
          </div>

          {hayAnclados && !filtro.trim() ? (
            <div className="animate-in fade-in duration-200">
              {secHeader(<><Star className="size-3 fill-amber-400 text-amber-400" /> Anclados</>)}
              {pinnedClients.map(clientBlock)}
              {pinnedProjects.map(({ p, c }) => projectRow(p, c, clientHex(c), { indent: true }))}
            </div>
          ) : null}

          {secHeader(
            <Link href="/clientes" onClick={onNavigate} className="hover:text-sidebar-foreground">Clientes · {filtered.length}</Link>,
            <Link href="/clientes/nuevo" onClick={onNavigate} aria-label="Nuevo cliente" title="Nuevo cliente" className="text-sidebar-muted transition-colors hover:text-sidebar-foreground">
              <Plus className="size-3.5" />
            </Link>,
          )}
          {filtered.map(clientBlock)}
          {filtro.trim() && filtered.length === 0 ? (
            <p className="px-3 py-1 text-xs text-sidebar-muted">Sin resultados para «{filtro.trim()}».</p>
          ) : null}
        </>
      ) : canTimeline ? (
        <Link
          href="/proyectos"
          onClick={onNavigate}
          className={cn(
            "mx-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
            pathname === "/proyectos" ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/40",
          )}
        >
          {isCliente ? "Mis proyectos" : "Proyectos"}
        </Link>
      ) : null}

      {!isCliente ? (
        <>
          <button
            type="button"
            onClick={toggleAdmin}
            className="mt-3 flex w-full items-center gap-1 px-2 pb-1 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-sidebar-muted transition-colors hover:text-sidebar-foreground"
          >
            <ChevronRight className={cn("size-3 transition-transform duration-150", showAdminItems && "rotate-90")} />
            <span className="flex-1">Administrativo</span>
          </button>
          {showAdminItems ? (
            <div className="animate-in fade-in slide-in-from-top-1 duration-150">
              {canQuotes ? adminRow("/cotizaciones", "Facturación", IconFacturacion, pathname.startsWith("/cotizaciones") || pathname.startsWith("/facturacion")) : null}
              {canComercial ? adminRow("/comercial", "Comercial", IconComercial, pathname.startsWith("/comercial")) : null}
              {canWiki ? adminRow("/wiki", "Wiki del equipo", IconWiki, pathname.startsWith("/wiki") || pathname.startsWith("/plantillas")) : null}
              {canBiblioteca ? adminRow("/biblioteca", "Biblioteca", IconBiblioteca, pathname.startsWith("/biblioteca")) : null}
              {canReports ? adminRow("/reportes", "Reportes", IconReportes, pathname.startsWith("/reportes")) : null}
              {canPapelera ? adminRow("/papelera", "Papelera", IconPapelera, pathname.startsWith("/papelera")) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );

  function adminRow(href: string, label: string, Icon: React.ComponentType<{ className?: string }>, active: boolean) {
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[13.5px] font-medium transition-colors",
          active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/90 hover:bg-sidebar-accent/40",
        )}
      >
        <Icon className="size-[18px] shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </Link>
    );
  }

  // ── Variante CAJÓN (móvil): una sola columna, sin rail — el móvil no cambia de modelo ──
  if (drawer) {
    return (
      <aside className="flex h-full w-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        {dialog}
        <Link href={isCliente ? "/mis-entregas" : "/"} onClick={onNavigate} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-sidebar-accent/40">
          <span className="min-w-0 flex-1">
            <Logo className="h-6" />
            <span className="mt-1 block truncate text-xs text-sidebar-muted">Productora · equipo</span>
          </span>
        </Link>
        <div className="px-3 pb-2">
          <button onClick={onSearch} className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-background/60 px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-background">
            <IconBuscar className="size-4" />
            <span className="flex-1 text-left">Buscar</span>
            <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          <nav className="pb-1">
            {NAV.filter((n) => n.show).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  n.active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/90 hover:bg-sidebar-accent/40",
                )}
              >
                <n.icon className="size-5 shrink-0" />
                <span className="flex-1">{n.label}</span>
                {n.badge ? (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">{n.badge}</span>
                ) : null}
              </Link>
            ))}
          </nav>
          {produccion}
        </div>
        <div className="border-t border-sidebar-border p-3">
          {isCliente ? null : adminRow("/configuracion", canAdmin ? "Configuración" : "Integraciones", Settings, pathname.startsWith("/configuracion"))}
          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5">
            <Link href="/perfil" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg hover:opacity-80" title="Mi perfil">
              <UserAvatar initials={user.initials} color={user.color} url={user.avatarUrl} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{user.name}</span>
                <span className="block truncate text-xs text-sidebar-muted">{user.title}</span>
              </span>
            </Link>
            <form action={logout}>
              <button type="submit" title="Cerrar sesión" className="flex size-7 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent/40 hover:text-sidebar-foreground">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>
    );
  }

  // ── Escritorio: RAIL (siempre) + PANEL (colapsable y redimensionable) ──
  return (
    <aside className={cn("flex h-full shrink-0 bg-sidebar text-sidebar-foreground", dragging && "select-none")}>
      {dialog}

      {/* RAIL: navegación principal con badges, SIEMPRE visible */}
      <div className="relative z-20 flex w-[58px] shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3">
        <Link href={isCliente ? "/mis-entregas" : "/"} onClick={onNavigate} title="Labstream OS" className="mb-2 transition-transform hover:scale-105">
          <LogoMark className="h-8 w-8 text-sm" />
        </Link>
        {NAV.filter((n) => n.show).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-label={n.label}
            className={cn(
              "group relative grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-150",
              n.active ? "bg-primary text-primary-foreground shadow-sm" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <n.icon className="size-5" />
            {n.badge ? (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-[15px] place-items-center rounded-full border-2 border-sidebar bg-red-500 px-0.5 text-[9px] font-extrabold leading-[13px] text-white">
                {n.badge > 99 ? "99+" : n.badge}
              </span>
            ) : null}
            <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
              {n.label}
            </span>
          </Link>
        ))}
        <div className="flex-1" />
        <div className="mb-1 h-px w-7 bg-sidebar-border" />
        {isCliente ? null : (
          <Link
            href="/configuracion"
            onClick={onNavigate}
            aria-label={canAdmin ? "Configuración" : "Integraciones"}
            className={cn(
              "group relative grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-150",
              pathname.startsWith("/configuracion") ? "bg-primary text-primary-foreground" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Settings className="size-5" />
            <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
              {canAdmin ? "Configuración" : "Integraciones"}
            </span>
          </Link>
        )}
        <Link href="/perfil" onClick={onNavigate} aria-label="Mi perfil" className="group relative mt-1 grid shrink-0 place-items-center rounded-full transition-transform hover:scale-105">
          <UserAvatar initials={user.initials} color={user.color} url={user.avatarUrl} size="md" />
          <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
            {user.name}
          </span>
        </Link>
        <form action={logout} className="mt-1">
          <button
            type="submit"
            aria-label="Cerrar sesión"
            className="group relative grid size-8 place-items-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          >
            <LogOut className="size-4" />
            <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
              Cerrar sesión
            </span>
          </button>
        </form>
      </div>

      {/* PANEL de Producción (colapsable desde el topbar; redimensionable arrastrando) */}
      {!collapsed ? (
        <div
          className="relative flex min-w-0 flex-col border-r border-sidebar-border bg-sidebar animate-in fade-in slide-in-from-left-2 duration-200"
          style={{ width, transitionProperty: dragging ? "none" : undefined }}
        >
          <div className="flex items-center gap-1.5 px-3 pb-1 pt-3.5">
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight">
              {isCliente ? "Mis proyectos" : "Producción"}
            </span>
            <button
              onClick={onSearch}
              title="Buscar (⌘K)"
              aria-label="Buscar"
              className="grid size-7 shrink-0 place-items-center rounded-lg border border-sidebar-border bg-background/60 text-sidebar-muted transition-colors hover:border-primary hover:text-sidebar-foreground"
            >
              <Search className="size-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">{produccion}</div>

          {/* Asa de redimensionado: arrastra (240–400 px) · doble clic = ancho por defecto */}
          <div
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
            onDoubleClick={resetWidth}
            title="Arrastra para redimensionar · doble clic: ancho por defecto"
            className="group/asa absolute -right-1 top-0 z-30 h-full w-2 cursor-col-resize"
          >
            <div className={cn("absolute inset-y-3 left-[3px] w-[3px] rounded-full transition-colors", dragging ? "bg-primary" : "bg-transparent group-hover/asa:bg-primary/60")} />
          </div>
        </div>
      ) : null}
    </aside>
  );
}
