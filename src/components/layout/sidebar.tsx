"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlarmClock,
  Archive,
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  Bot,
  CalendarDays,
  ChevronRight,
  FileCheck2,
  FolderCheck,
  HardDrive,
  Home,
  Inbox,
  KeyRound,
  Library,
  ListTodo,
  LogOut,
  Mail,
  MessageCircle,
  MessageSquarePlus,
  Paintbrush,
  Palette,
  Plug,
  Plus,
  Receipt,
  Rocket,
  ScrollText,
  Radar,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  StickyNote,
  Tags,
  Trash2,
  TrendingUp,
  Users,
  Workflow,
  Wrench,
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
import { PresencePicker } from "@/components/layout/presence-picker";
import { Logo } from "@/components/brand/logo";
import { cerrarMenu } from "@/components/ui/barra-menu";
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
  presence?: string | null; // estado manual: activo/ocupado/ausente
  dnd?: boolean; // "No molestar" vigente (prioriza el punto en rojo)
};

export type SidebarProject = { id: string; name: string; emoji: string | null; finished?: boolean };

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
  // Estados SEPARADOS: si la foto falla, todavía se intenta el logo; si el logo falla, recién
  // ahí caemos a emoji/iniciales (con uno solo compartido, una foto rota saltaba también el logo).
  const [photoBroken, setPhotoBroken] = React.useState(false);
  const [logoBroken, setLogoBroken] = React.useState(false);
  // Más grande y CUADRADO (32px, esquinas suaves) para reconocer al cliente de un vistazo.
  // `block` es OBLIGATORIO: un span en línea ignora width/height (las ramas de foto y logo
  // quedaban en 0×0 apenas el avatar dejó de ser hijo directo de un flex — la envoltura del
  // anillo lo desenmascaró y las fotos del CRM se volvieron invisibles). Las ramas de emoji
  // e iniciales ya traían `grid`, que pisa a `block` donde aplica.
  const base = cn("relative block size-8 shrink-0 overflow-hidden rounded-[9px]", className);
  if (client.photoUrl && !photoBroken) {
    return (
      <span className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={client.photoUrl} alt="" onError={() => setPhotoBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
      </span>
    );
  }
  if (client.logoUrl && !logoBroken) {
    return (
      <span className={base} style={{ background: client.logoBg || "#ffffff" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={client.logoUrl} alt="" onError={() => setLogoBroken(true)} className="absolute inset-0 h-full w-full object-contain p-0.5" />
      </span>
    );
  }
  if (client.emoji) {
    return (
      <span className={cn(base, "grid place-items-center")} style={{ background: `${hex}22` }}>
        <EntityEmoji value={client.emoji} fallback="•" className="size-5" />
      </span>
    );
  }
  const initials = client.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span
      className={cn(base, "grid place-items-center text-[11px] font-bold text-white")}
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

// La cara de REPOSO: la tira de fotos de clientes, y con ella la fila del buscador, miden
// esto al estar contraída la barra. Es constante (y no una clase suelta) porque la fila del
// buscador necesita el NÚMERO para animar su ancho.
const W_TIRA = 68;
// Alto de la fila del buscador. 56 no es un número bonito al azar: deja la lupa CENTRADA
// justo a la altura de tu avatar del raíl (py-3 + h-8 → centro en 28), así lo primero que
// se ve de las dos columnas arranca en la misma línea.
const H_FILA = 56;

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
  canRastreo = false,
  correoUnread = 0,
  canClients = true,
  canPapelera = false,
  canCreateTasks = false,
  opsEnabled = false,
  galeriaEnabled = false,
  isCliente = false,
  collapsed = false,
  drawer = false,
  chatUnread = 0,
  reviewPending = 0,
  remindersToday = 0,
  onNavigate,
  onSearch,
  onExpand,
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
  // Panel de rastreo: por defecto FALSE. A diferencia del resto, este no se hereda por rol —
  // es dato personal del equipo y se concede a mano (ver lib/rastreo/acceso).
  canRastreo?: boolean;
  correoUnread?: number;
  canClients?: boolean;
  canPapelera?: boolean;
  // Muestra el acceso rápido «+ Tarea» del cajón móvil (los modales viven en QuickCreateFab).
  canCreateTasks?: boolean;
  // Hay carpeta Operaciones_LAB montada (NAS_OPS_DIR): muestra la sección «Operaciones».
  opsEnabled?: boolean;
  galeriaEnabled?: boolean;
  isCliente?: boolean;
  collapsed?: boolean;
  drawer?: boolean;
  chatUnread?: number;
  reviewPending?: number;
  remindersToday?: number;
  onNavigate?: () => void;
  onSearch?: () => void;
  /** Pide DESPLEGAR el panel de Producción (lo maneja el shell): las fotos de clientes del
   *  raíl lo usan — clic en una foto = panel abierto con ese cliente desplegado. */
  onExpand?: () => void;
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
    // Portal del cliente: sus 4 superficies, con los MISMOS iconos que el sub-nav del portal
    // (client-portal-nav.tsx) para que se sienta un solo espacio.
    { href: "/inicio", label: "Inicio", icon: Home, show: isCliente, active: pathname === "/inicio" },
    { href: "/mis-entregas", label: "Mis entregas", icon: Inbox, show: isCliente, active: pathname.startsWith("/mis-entregas") },
    { href: "/entregas-finales", label: "Entregas finales", icon: FolderCheck, show: isCliente, active: pathname.startsWith("/entregas-finales") },
    { href: "/solicitudes", label: "Solicitudes", icon: MessageSquarePlus, show: isCliente, active: pathname.startsWith("/solicitudes") },
    // El orden de arriba es el que fijó el usuario (2026-07-31): del día a día personal
    // (tareas, agenda, notas) hacia el trabajo compartido (proyectos, revisiones, chat).
    { href: "/", label: "Inicio", icon: Home, show: !isCliente, active: pathname === "/" },
    { href: "/mis-tareas", label: "Mis tareas", icon: ListTodo, show: !isCliente, active: pathname === "/mis-tareas" },
    { href: "/calendario", label: "Calendario", icon: CalendarDays, show: canCalendar, active: pathname === "/calendario" },
    { href: "/recordatorios", label: "Recordatorios", icon: AlarmClock, badge: remindersToday || undefined, show: !isCliente, active: pathname === "/recordatorios" },
    // Buzón PERSONAL (cada quien conecta el suyo): nunca para el portal del cliente.
    { href: "/correo", label: "Correo", icon: Mail, badge: correoUnread || undefined, show: !isCliente, active: pathname.startsWith("/correo") },
    { href: "/notas", label: "Notas", icon: StickyNote, show: !isCliente, active: pathname === "/notas" },
    // Acceso directo a TODOS los proyectos (el panel de Producción navega por cliente; esta
    // entrada da la vista global que se había perdido). El cliente del portal también la ve.
    { href: "/proyectos", label: "Proyectos", icon: Rocket, show: true, active: pathname === "/proyectos" || pathname.startsWith("/proyectos/") },
    { href: "/revisiones", label: "Revisiones", icon: FileCheck2, badge: reviewPending || undefined, show: !isCliente, active: pathname.startsWith("/revisiones") },
    // El cliente (portal) no tiene chat: sin entrada en su menú.
    { href: "/chat", label: "Chats", icon: MessageCircle, badge: chatBadge || undefined, show: !isCliente, active: pathname === "/chat" || pathname.startsWith("/chat/") },
  ];

  // Archivar un cliente (solo admin): borrado SUAVE (restaurable desde /clientes).
  async function removeClient(id: string, name: string) {
    if (!(await confirm({ title: "Archivar cliente", message: `¿Archivar el cliente «${name}»? Sus PROYECTOS se archivan con él (papelera, solo lectura) y sus facturas y cotizaciones se conservan intactas. Restaurarlo revive también sus proyectos.`, confirmLabel: "Archivar" }))) return;
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

  // Anclados ⭐ (por dispositivo). El filtro de texto que vivía aquí se retiró: buscar un
  // cliente es lo mismo que buscar cualquier cosa en la app, y eso ya lo hace la lupa (⌘K).
  const [pins, setPins] = React.useState<Pins>({ c: [], p: [] });
  React.useEffect(() => { setPins(loadPins()); }, []);
  const savePins = (next: Pins) => { setPins(next); try { window.localStorage.setItem(PINS_KEY, JSON.stringify(next)); } catch {} };
  const togglePinClient = (id: string) => savePins({ ...pins, c: pins.c.includes(id) ? pins.c.filter((x) => x !== id) : [...pins.c, id] });
  const togglePinProject = (id: string) => savePins({ ...pins, p: pins.p.includes(id) ? pins.p.filter((x) => x !== id) : [...pins.p, id] });

  // Proyecto activo (para resaltar y auto-desplegar su cliente).
  const activeProjectId = pathname.startsWith("/proyectos/") ? pathname.split("/")[2] : null;
  const [openMap, setOpenMap] = React.useState<Record<string, boolean>>({});
  const isClientOpen = (c: SidebarClient) => openMap[c.id] ?? c.projects.some((p) => p.id === activeProjectId);
  // Esc recoge todos los despliegues (incluido el auto-abierto del proyecto activo).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      // Cierre explícito de TODOS (incluido el auto-abierto del proyecto activo, que sin
      // esto renacería del fallback de isClientOpen).
      setOpenMap(Object.fromEntries(clients.map((c) => [c.id, false])));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clients]);

  // Sección "Administrativo" desplegable (recuerda el estado; se abre sola si estás dentro).
  const adminActive = pathname.startsWith("/cotizaciones") || pathname.startsWith("/facturacion") || pathname === "/asistente" || pathname.startsWith("/wiki") || pathname.startsWith("/plantillas") || pathname.startsWith("/biblioteca") || pathname.startsWith("/comercial") || pathname.startsWith("/reportes") || pathname.startsWith("/rastreo") || pathname.startsWith("/papelera");
  const [adminOpen, setAdminOpen] = React.useState(true);
  React.useEffect(() => {
    const saved = window.localStorage.getItem("ui:adminOpen");
    if (saved != null) setAdminOpen(saved === "1");
  }, []);
  const toggleAdmin = () => setAdminOpen((o) => { const n = !o; window.localStorage.setItem("ui:adminOpen", n ? "1" : "0"); return n; });
  const showAdminItems = adminOpen || adminActive;

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

  // Bloque de un cliente: fila con avatar CUADRADO (esquinas suaves) + nombre SIEMPRE
  // legible; el clic la expande AHÍ MISMO con los proyectos colgando de un hilo del color
  // del cliente. Uno abierto a la vez (acordeón); la ficha vive al final del despliegue.
  const clientBlock = (c: SidebarClient) => {
    const hex = clientHex(c);
    const open = isClientOpen(c);
    // Anillo = aquí vives ahora: la ficha del cliente abierta, o un proyecto suyo activo.
    const resaltado = pathname === `/clientes/${c.id}` || c.projects.some((p) => p.id === activeProjectId);
    const pinned = pins.c.includes(c.id);
    const vivos = c.projects.filter((p) => !p.finished);
    return (
      <div key={c.id} className={cn("rounded-xl transition-colors duration-200", open && "bg-sidebar-accent/30")}>
        <div className="group/cli relative flex items-center gap-1 rounded-xl pl-1 pr-1">
          <button
            type="button"
            onClick={() => setOpenMap({ [c.id]: !open })} /* acordeón: abrir uno recoge los demás */
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-1.5 text-left"
          >
            <span className={cn("relative shrink-0 rounded-[10px] transition-transform duration-200", !open && "group-hover/cli:scale-105", resaltado && "ring-2 ring-primary ring-offset-2 ring-offset-sidebar")}>
              <ClientAvatar client={c} hex={hex} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-[13px] tracking-[0.005em] text-sidebar-foreground", open ? "font-bold" : "font-semibold")}>
                {c.name}
              </span>
              {open ? (
                <span className="block text-[10.5px] text-sidebar-muted">
                  {c.projectCount} proyecto{c.projectCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </span>
          </button>
          {!open ? <span className="px-1.5 text-xs tabular-nums text-sidebar-muted group-hover/cli:hidden">{c.projectCount}</span> : null}
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

        {/* El despliegue EN EL SITIO: alto animado (0fr→1fr), proyectos en cascada. */}
        <div
          data-abierto={open || undefined}
          className="group/desp grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out data-[abierto]:grid-rows-[1fr]"
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mb-1.5 ml-[26px] flex flex-col gap-0.5 border-l-2 pb-0.5 pl-2.5" style={{ borderColor: hex }}>
              {vivos.map((p, i) => (
                <div
                  key={p.id}
                  style={{ transitionDelay: open ? `${70 + i * 45}ms` : "0ms" }}
                  className="-translate-y-1 opacity-0 transition-[opacity,transform] duration-200 group-data-[abierto]/desp:translate-y-0 group-data-[abierto]/desp:opacity-100"
                >
                  {projectRow(p, c, hex)}
                </div>
              ))}
              {c.projects.some((p) => p.finished) ? (
                <details className="group/fin">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg py-1 pl-2 pr-1 text-[11.5px] font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground">
                    <ChevronRight className="size-3 transition-transform group-open/fin:rotate-90" />
                    ✔ Terminados ({c.projects.filter((p) => p.finished).length})
                  </summary>
                  <div className="flex flex-col gap-0.5 opacity-70">
                    {c.projects.filter((p) => p.finished).map((p) => projectRow(p, c, hex))}
                  </div>
                </details>
              ) : null}
              {/* La ficha del cliente vive aquí (antes era el clic en el nombre). */}
              <Link
                href={`/clientes/${c.id}`}
                onClick={onNavigate}
                style={{ transitionDelay: open ? `${70 + vivos.length * 45}ms` : "0ms" }}
                className="-translate-y-1 rounded-lg py-1 pl-2 pr-1 text-[11.5px] font-medium text-sidebar-muted opacity-0 transition-[opacity,transform,background,color] duration-200 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground group-data-[abierto]/desp:translate-y-0 group-data-[abierto]/desp:opacity-100"
              >
                Abrir la ficha de {c.name} →
              </Link>
            </div>
          </div>
        </div>
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

  // Contenido de PRODUCCIÓN (anclados ⭐ + clientes) — corazón del panel.
  const produccion = (
    <>
      {canClients ? (
        <>
          {hayAnclados ? (
            <div className="animate-in fade-in duration-200">
              {secHeader(<><Star className="size-3 fill-amber-400 text-amber-400" /> Anclados</>)}
              {pinnedClients.map(clientBlock)}
              {pinnedProjects.map(({ p, c }) => projectRow(p, c, clientHex(c), { indent: true }))}
            </div>
          ) : null}

          {/* El rótulo «Clientes» del ESCRITORIO vive ahora en la fila del buscador, que es la
              que viaja con la barra; aquí solo queda una línea que separe los anclados del
              resto. El CAJÓN móvil no tiene esa fila (una sola columna, sin contraer), así que
              conserva su cabecera con la cuenta y el atajo de «nuevo cliente». */}
          {drawer ? (
            secHeader(
              <Link href="/clientes" onClick={onNavigate} className="hover:text-sidebar-foreground">Clientes · {clients.length}</Link>,
              <Link href="/clientes/nuevo" onClick={onNavigate} aria-label="Nuevo cliente" title="Nuevo cliente" className="text-sidebar-muted transition-colors hover:text-sidebar-foreground">
                <Plus className="size-3.5" />
              </Link>,
            )
          ) : hayAnclados ? (
            <div className="mx-2 my-2 h-px bg-sidebar-border" />
          ) : null}
          {clients.map(clientBlock)}
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

      {/* Administrativo: en ESCRITORIO vive en el rail (iconos, abajo); aquí solo se muestra en
          el cajón MÓVIL, que es una sola columna sin rail. */}
      {drawer && !isCliente ? (
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
              {/* Mismo orden que el grupo de abajo del rail: Discos, Wiki, Reportes, Comercial,
                  Facturación, Papelera (la Biblioteca solo existe aquí: en el rail vive dentro
                  del espacio de la Wiki). */}
              {opsEnabled || galeriaEnabled
                ? adminRow(galeriaEnabled ? "/galeria" : "/operaciones", "Discos", HardDrive, pathname.startsWith("/operaciones") || pathname.startsWith("/galeria"))
                : null}
              {canWiki ? adminRow("/wiki", "Wiki", IconWiki, pathname.startsWith("/wiki") || pathname.startsWith("/plantillas")) : null}
              {canBiblioteca ? adminRow("/biblioteca", "Biblioteca", IconBiblioteca, pathname.startsWith("/biblioteca")) : null}
              {canReports ? adminRow("/reportes", "Reportes", IconReportes, pathname.startsWith("/reportes")) : null}
              {canRastreo ? adminRow("/rastreo", "Rastreo", Radar, pathname.startsWith("/rastreo")) : null}
              {canComercial ? adminRow("/comercial", "Comercial", IconComercial, pathname.startsWith("/comercial")) : null}
              {canQuotes ? adminRow("/facturacion", "Facturación", IconFacturacion, pathname.startsWith("/cotizaciones") || pathname.startsWith("/facturacion")) : null}
              {canPapelera ? adminRow("/papelera", "Papelera", IconPapelera, pathname.startsWith("/papelera")) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );

  // Los ítems administrativos del RAIL (escritorio): iconos con tooltip, abajo del rail.
  // Usan iconos de LÍNEA monocromos (lucide) para tener EXACTAMENTE el mismo estilo que los de
  // arriba (mismo trazo, tamaño y estados activo/hover) — antes eran iconos duotono de colores.
  const RAIL_ADMIN = [
    // Los dos discos del NAS en UNA entrada (dentro se cambia con pestañas): la galería de
    // entregas de LabTem PRIMERO —es donde el equipo busca material a diario— y
    // Operaciones_LAB a un clic. Solo equipo; nunca clientes — el cliente entra a su galería
    // por el enlace firmado, no por el menú. Vive en el grupo de abajo por pedido del usuario.
    {
      href: galeriaEnabled ? "/galeria" : "/operaciones",
      label: "Discos",
      icon: HardDrive,
      show: opsEnabled || galeriaEnabled,
      active: pathname.startsWith("/operaciones") || pathname.startsWith("/galeria"),
    },
    // La Biblioteca YA NO tiene icono propio: vive dentro del espacio de la Wiki (en sus
    // Herramientas), así que enciende esta misma fila. Un icono menos en el rail.
    { href: "/wiki", label: "Wiki", icon: BookOpen, show: canWiki, active: pathname.startsWith("/wiki") || pathname.startsWith("/plantillas") || pathname.startsWith("/biblioteca") },
    { href: "/reportes", label: "Reportes", icon: BarChart3, show: canReports, active: pathname.startsWith("/reportes") },
    { href: "/rastreo", label: "Rastreo", icon: Radar, show: canRastreo, active: pathname.startsWith("/rastreo") },
    { href: "/comercial", label: "Comercial", icon: TrendingUp, show: canComercial, active: pathname.startsWith("/comercial") },
    // «Facturación» lleva A FACTURACIÓN (con Siigo conectado, ahí vive lo contable en vivo).
    // Antes llevaba a /cotizaciones y el usuario «no encontraba» Siigo: el botón prometía una
    // cosa y abría otra. Cotizaciones queda a un clic («Ver cotizaciones →» en la cabecera).
    { href: "/facturacion", label: "Facturación", icon: Receipt, show: canQuotes, active: pathname.startsWith("/cotizaciones") || pathname.startsWith("/facturacion") },
    { href: "/papelera", label: "Papelera", icon: Trash2, show: canPapelera, active: pathname.startsWith("/papelera") },
  ].filter((r) => r.show && !isCliente);

  // ── El menú de la cuenta (avatar del rail): las pestañas de Ajustes a un clic ──
  // El avatar ya no NAVEGA de una (te sacaba de donde estabas): despliega este menú y desde
  // aquí entras directo a la sección que quieras. Las claves `s` son las mismas secciones
  // que pinta /ajustes; EQUIPO y SISTEMA solo existen para admins (misma vara que la página,
  // que además re-verifica en el servidor — esto es un atajo, no la puerta).
  const CUENTA_MENU: { grupo: string; items: { s: string; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = [
    {
      grupo: "Mi cuenta",
      items: isCliente
        ? [
            { s: "perfil", label: "Perfil", icon: Palette },
            { s: "notificaciones", label: "Notificaciones y silencio", icon: Bell },
          ]
        : [
            { s: "perfil", label: "Perfil", icon: Palette },
            { s: "preferencias", label: "Preferencias", icon: SlidersHorizontal },
            { s: "notificaciones", label: "Notificaciones y silencio", icon: Bell },
            // «Mi calendario» solo existe como sección propia para el colaborador NO admin
            // (el admin gestiona los calendarios desde Integraciones).
            ...(canAdmin ? [] : [{ s: "calendario", label: "Mi calendario", icon: CalendarDays }]),
          ],
    },
    ...(canAdmin && !isCliente
      ? [
          {
            grupo: "Equipo",
            items: [
              { s: "usuarios", label: "Usuarios", icon: Users },
              { s: "roles", label: "Roles y permisos", icon: ShieldCheck },
              { s: "labels", label: "Estados y prioridades", icon: Tags },
              { s: "estados-proyecto", label: "Estados de proyecto", icon: Workflow },
              { s: "marca", label: "Marca", icon: Paintbrush },
            ],
          },
          {
            grupo: "Sistema",
            items: [
              { s: "integraciones", label: "Integraciones", icon: Plug },
              { s: "api", label: "API y agentes", icon: KeyRound },
              { s: "marcebot", label: "Marcebot", icon: Bot },
              { s: "notificaciones-sistema", label: "Notificaciones del sistema", icon: BellRing },
              { s: "auditoria", label: "Auditoría", icon: ScrollText },
              { s: "biblioteca", label: "Biblioteca", icon: Library },
              { s: "demo", label: "Modo demo", icon: Settings },
              { s: "mantenimiento", label: "Mantenimiento", icon: Wrench },
            ],
          },
        ]
      : []),
  ];

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
        <Link href={isCliente ? "/inicio" : "/"} onClick={onNavigate} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-sidebar-accent/40">
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
        {/* CREAR, a mano en móvil: el FAB «+» ya no flota (chocaba con la burbuja de chat) —
            desde «Más» se crea una tarea o una cita. Los botones disparan lsos:quick-create y
            los modales viven en QuickCreateFab (montado en el shell). */}
        {!isCliente && (canCreateTasks || canCalendar) ? (
          <div className="flex gap-2 px-3 pb-2">
            {canCreateTasks ? (
              <button
                type="button"
                onClick={() => { onNavigate?.(); window.dispatchEvent(new CustomEvent("lsos:quick-create", { detail: { kind: "task" } })); }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground active:scale-[0.98]"
              >
                <Plus className="size-4" /> Tarea
              </button>
            ) : null}
            {canCalendar ? (
              <button
                type="button"
                onClick={() => { onNavigate?.(); window.dispatchEvent(new CustomEvent("lsos:quick-create", { detail: { kind: "event" } })); }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-sidebar-border bg-background/60 px-3 py-2 text-sm font-medium text-sidebar-foreground active:scale-[0.98]"
              >
                <Plus className="size-4" /> Cita
              </button>
            ) : null}
          </div>
        ) : null}
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
          {isCliente ? null : adminRow("/ajustes", "Ajustes", Settings, pathname.startsWith("/ajustes") || pathname.startsWith("/configuracion"))}
          <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5">
            <Link href="/ajustes?s=perfil" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg hover:opacity-80" title="Mi perfil">
              <UserAvatar initials={user.initials} color={user.color} url={user.avatarUrl} size="md" presence={user.presence} dnd={user.dnd} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{user.name}</span>
                <span className="block truncate text-xs text-sidebar-muted">{user.title}</span>
              </span>
            </Link>
            {isCliente ? null : <PresencePicker presence={user.presence} dnd={user.dnd} />}
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

      {/* RAIL: navegación principal con badges, SIEMPRE visible. Con overflow propio: en
          pantallas bajas los iconos + las fotos de clientes suman más que el alto y sin esto
          lo de abajo (o las fotos) moría aplastado a 0 px. */}
      <div className="relative z-20 flex w-[58px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-sidebar-border bg-sidebar py-3 [scrollbar-width:none]">
        {/* Tu avatar, arriba del todo (donde vivía la marca compacta, que nadie reconocía como
            logo): ES la puerta de Ajustes. Clic = menú con las pestañas y entras directo a la
            sección — ya no te saca de donde estás para caer en la portada de Ajustes. La caja
            la coloca DetailsAutoClose (fixed + tope de alto con scroll si el menú es largo). */}
        <details data-autoclose className="relative mb-2">
          <summary
            aria-label={`${user.name} · Ajustes`}
            title={`${user.name} · Ajustes`}
            className={cn(
              "grid cursor-pointer list-none place-items-center rounded-full transition-transform hover:scale-105 [&::-webkit-details-marker]:hidden",
              (pathname.startsWith("/ajustes") || pathname.startsWith("/configuracion") || pathname.startsWith("/perfil")) &&
                "ring-2 ring-primary ring-offset-2 ring-offset-sidebar",
            )}
          >
            <UserAvatar initials={user.initials} color={user.color} url={user.avatarUrl} size="md" presence={user.presence} dnd={user.dnd} />
          </summary>
          <div className="absolute left-[calc(100%+8px)] top-0 z-40 w-64 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
            <Link
              href="/ajustes?s=perfil"
              onClick={(e) => {
                cerrarMenu(e);
                onNavigate?.();
              }}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-muted"
            >
              <UserAvatar initials={user.initials} color={user.color} url={user.avatarUrl} size="md" />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold leading-tight">{user.name}</span>
                {user.title ? <span className="block truncate text-[11px] text-muted-foreground">{user.title}</span> : null}
              </span>
            </Link>
            <div className="my-1 h-px bg-border" />
            {CUENTA_MENU.map((g) => (
              <React.Fragment key={g.grupo}>
                <p className="px-2.5 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{g.grupo}</p>
                {g.items.map((it) => (
                  <Link
                    key={it.s}
                    href={`/ajustes?s=${it.s}`}
                    onClick={(e) => {
                      cerrarMenu(e);
                      onNavigate?.();
                    }}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] hover:bg-muted"
                  >
                    <it.icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  </Link>
                ))}
              </React.Fragment>
            ))}
            <div className="my-1 h-px bg-border" />
            <form action={logout}>
              <button
                type="submit"
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] text-destructive hover:bg-destructive/10"
              >
                <LogOut className="size-4" /> Cerrar sesión
              </button>
            </form>
          </div>
        </details>
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
        <div className="min-h-2 flex-1" />
        {/* Administrativo: iconos con tooltip, abajo del rail (separados con una línea). */}
        {RAIL_ADMIN.length ? (
          <>
            <div className="my-1 h-px w-7 bg-sidebar-border" />
            {RAIL_ADMIN.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                onClick={onNavigate}
                aria-label={r.label}
                className={cn(
                  "group relative grid size-10 shrink-0 place-items-center rounded-xl transition-colors duration-150",
                  r.active ? "bg-primary text-primary-foreground shadow-sm" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <r.icon className="size-5" />
                <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
                  {r.label}
                </span>
              </Link>
            ))}
          </>
        ) : null}
        <div className="mb-1 mt-1 h-px w-7 bg-sidebar-border" />
        {/* El avatar (y con él Ajustes) vive ARRIBA del rail; aquí abajo solo queda salir. */}
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

      {/* ── LA COLUMNA QUE RESPIRA ── La tira de fotos y el panel son dos capas del MISMO
          movimiento (68↔0 y 0↔ancho, misma curva), y por encima de las dos viaja una sola
          fila de buscador. Van juntas bajo este contenedor `relative` para que esa fila
          pueda medirse contra ellas sin saber nada del raíl. ── */}
      <div className="relative flex shrink-0">
        {/* ── BARRA DE CLIENTES: una columna PROPIA al lado del raíl, solo fotos — grandes,
            cuadradas con esquinas suaves. Es la cara de REPOSO del sidebar: al recoger el
            panel los clientes nunca se van; clic en una foto = el panel vuelve CON ese
            cliente desplegado. SIEMPRE montada y el ANCHO transiciona (68↔0) con la MISMA
            curva del panel: contraer y expandir es un solo movimiento continuo, nada aparece
            de golpe. Las fotos entran en cascada al quedar visible la barra.
            Se monta AUNQUE no haya clientes (o no se puedan ver): contraída, esta tira es el
            sitio de la lupa, y sin ella la barra recogida se quedaría sin buscador. ── */}
        <div
          aria-hidden={!collapsed}
          style={{ width: collapsed ? W_TIRA : 0 }}
          className={cn(
            "relative z-10 flex shrink-0 flex-col overflow-hidden bg-sidebar",
            dragging ? "" : "transition-[width] duration-[340ms] ease-[cubic-bezier(.22,1,.36,1)]",
            collapsed ? "border-r border-sidebar-border" : "border-r-0",
          )}
        >
          {/* El relleno de arriba es el hueco de la fila del buscador, que va superpuesta: las
              fotos empiezan justo debajo de la lupa y pasan POR DEBAJO de ella al desplazarse. */}
          <div
            data-viva={collapsed || undefined}
            inert={!collapsed || undefined}
            style={{ width: W_TIRA, paddingTop: H_FILA }}
            className="group/fotos flex shrink-0 grow flex-col items-center gap-2.5 overflow-y-auto pb-4 [scrollbar-width:none]"
          >
            {[...pinnedClients, ...clients.filter((c) => !pins.c.includes(c.id))].map((c, i) => {
              const resaltado = pathname === `/clientes/${c.id}` || c.projects.some((p) => p.id === activeProjectId);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setOpenMap({ [c.id]: true });
                    onExpand?.();
                  }}
                  aria-label={`Abrir ${c.name}`}
                  className="group relative shrink-0 transition-transform duration-150 hover:scale-110"
                >
                  {/* La ENTRADA en cascada vive en esta capa (con su demora escalonada); el
                      hover-scale vive en el botón, sin demora — si compartieran capa, la
                      demora de la cascada le pondría medio segundo de retraso al hover. */}
                  <span
                    style={{ transitionDelay: collapsed ? `${90 + i * 24}ms` : "0ms" }}
                    className="block -translate-x-2 opacity-0 transition-[opacity,transform] duration-200 ease-out group-data-[viva]/fotos:translate-x-0 group-data-[viva]/fotos:opacity-100"
                  >
                    <span className={cn("block rounded-[11px]", resaltado && "ring-2 ring-primary ring-offset-2 ring-offset-sidebar")}>
                      <ClientAvatar client={c} hex={clientHex(c)} className="size-10 rounded-[10px]" />
                    </span>
                  </span>
                  <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-semibold text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
                    {c.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* PANEL de Producción (colapsable desde el topbar; redimensionable arrastrando). En Modo
            Enfoque (/chat) NO se desmonta: el ANCHO transiciona a 0 con una curva suave y el
            contenido —de ancho FIJO— se clipa con overflow-hidden, para que el panel se RETIRE (y
            vuelva a entrar) de forma FLUIDA sin reacomodar el texto durante la animación. */}
        <div
          className={cn(
            "relative flex flex-col overflow-hidden bg-sidebar",
            collapsed ? "border-r-0" : "border-r border-sidebar-border",
            dragging ? "" : "transition-[width] duration-[340ms] ease-[cubic-bezier(.22,1,.36,1)]",
          )}
          style={{ width: collapsed ? 0 : width }}
          aria-hidden={collapsed}
        >
          {/* Contenido de ancho FIJO (no se reacomoda mientras el contenedor se cierra/abre). Al estar
              retraído se marca `inert`: sigue en el DOM para la animación, pero no recibe foco ni clics.
              El relleno de arriba es el hueco de la fila del buscador (superpuesta): la cabecera propia
              del panel ya no existe — su rótulo y su lupa son AHORA esa fila. */}
          <div className="flex min-h-0 flex-1 shrink-0 flex-col" style={{ width, paddingTop: H_FILA }} inert={collapsed || undefined}>
            <div className="flex-1 overflow-y-auto px-2 pb-3 pt-1">{produccion}</div>
          </div>

          {/* Asa de redimensionado (oculta al estar retraído): arrastra (240–400 px) · doble clic = ancho por defecto */}
          {!collapsed ? (
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
          ) : null}
        </div>

        {/* ── LA FILA DEL BUSCADOR ── Una sola lupa para los dos estados, y CLAVADA en el mismo
            sitio siempre: el eje por el que bajan las fotos. Lo único que se mueve al desplegar
            es la palabra, que se abre a su derecha. Que el ancla no se mueva es justo lo que
            hace fluido el gesto — el ojo ya tiene dónde agarrarse y la barra crece por detrás,
            en vez de reacomodarse entera.
            Va superpuesta a las dos columnas y su ancho es el que SUMAN ellas (68+0 contraída,
            0+ancho desplegada) con la misma curva, así su borde derecho nunca se despega del de
            la columna que tapa. Debajo del raíl (z-10 < z-20) para no comerse sus globos. */}
        <div
          style={{ width: collapsed ? W_TIRA : width, height: H_FILA }}
          className={cn(
            "absolute left-0 top-0 z-10 flex items-center border-r border-sidebar-border bg-sidebar",
            dragging ? "" : "transition-[width] duration-[340ms] ease-[cubic-bezier(.22,1,.36,1)]",
          )}
        >
          {/* 18 px de margen izquierdo dejan el centro del botón en 34 — el mismo eje por el que
              bajan las fotos (y, con el panel abierto, la columna de avatares de los clientes).
              Es un margen FIJO: la lupa no se entera de si la barra está abierta o cerrada. */}
          <button
            onClick={onSearch}
            title="Buscar (⌘K)"
            aria-label="Buscar"
            className="ml-[18px] grid size-8 shrink-0 place-items-center rounded-[10px] border border-sidebar-border bg-background/60 text-sidebar-muted transition-colors hover:border-primary hover:text-sidebar-foreground"
          >
            <Search className="size-4" />
          </button>
          {/* La palabra entra cuando ya hay sitio (140 ms) y con un pelín de deslizamiento: si
              entra a la vez que empieza a abrirse, se ve espachurrada contra la lupa media
              animación. El hueco entre lupa y palabra es el MISMO (gap-2.5) que hay entre la
              foto y el nombre en cada fila de cliente, para que la fila lleve el ritmo de la
              lista que encabeza. */}
          <span
            inert={collapsed || undefined}
            style={{ transitionDelay: collapsed ? "0ms" : "140ms" }}
            className={cn(
              "ml-2.5 min-w-0 flex-1 truncate pr-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-sidebar-muted transition-[opacity,transform] duration-200 ease-out",
              collapsed ? "-translate-x-1 opacity-0" : "translate-x-0 opacity-100",
            )}
          >
            <Link href={canClients ? "/clientes" : "/proyectos"} onClick={onNavigate} className="transition-colors hover:text-sidebar-foreground">
              {isCliente ? "Mis proyectos" : "Clientes"}
            </Link>
          </span>
        </div>
      </div>
    </aside>
  );
}
