"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  ListChecks,
  MessageSquare,
  MessagesSquare,
  LayoutGrid,
  LayoutTemplate,
  CalendarDays,
  CalendarRange,
  FileText,
  Sparkles,
  Search,
  Settings,
  Plus,
  ChevronRight,
  BookOpen,
  Library,
  BarChart3,
  Receipt,
  LogOut,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import { logout } from "@/lib/auth-actions";
import { deleteClient } from "@/app/(app)/clientes/actions";

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
  projectCount: number;
  projects: SidebarProject[];
};

const NAV = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/mis-tareas", label: "Mis tareas", icon: ListChecks },
  { href: "/estados", label: "Chat del día", icon: MessageSquare },
  { href: "/chat", label: "Chats", icon: MessagesSquare },
  { href: "/proyectos", label: "Proyectos", icon: LayoutGrid },
  { href: "/timeline", label: "Cronograma", icon: CalendarRange },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/plantillas", label: "Plantillas", icon: LayoutTemplate },
];

export function Sidebar({
  user,
  clients,
  canAdmin,
  canQuotes,
  canWiki = true,
  canBiblioteca = true,
  canCalendar = true,
  canTimeline = true,
  canReports = true,
  collapsed = false,
  chatUnread = 0,
  onNavigate,
  onSearch,
}: {
  user: SidebarUser;
  clients: SidebarClient[];
  canAdmin: boolean;
  canQuotes?: boolean;
  canWiki?: boolean;
  canBiblioteca?: boolean;
  canCalendar?: boolean;
  canTimeline?: boolean;
  canReports?: boolean;
  collapsed?: boolean;
  chatUnread?: number;
  onNavigate?: () => void;
  onSearch?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startDelete] = useTransition();

  // Borrar un cliente (solo admin). Confirma porque arrastra proyectos/cotizaciones/chat.
  function removeClient(id: string, name: string) {
    if (!confirm(`¿Eliminar el cliente «${name}» y TODOS sus proyectos, cotizaciones y chat? No se puede deshacer.`)) return;
    startDelete(async () => { await deleteClient(id); router.refresh(); });
  }

  // Sección "Administrativo" desplegable (recuerda el estado; se abre sola si
  // estás en una de sus rutas para no esconder la activa).
  const adminActive = pathname.startsWith("/cotizaciones") || pathname === "/asistente" || pathname.startsWith("/wiki") || pathname.startsWith("/biblioteca");
  const [adminOpen, setAdminOpen] = useState(true);
  useEffect(() => {
    const saved = window.localStorage.getItem("ui:adminOpen");
    if (saved != null) setAdminOpen(saved === "1");
  }, []);
  const toggleAdmin = () => setAdminOpen((o) => { const n = !o; window.localStorage.setItem("ui:adminOpen", n ? "1" : "0"); return n; });
  const showAdminItems = adminOpen || adminActive;

  // Proyecto activo (para resaltar y auto-desplegar su cliente).
  const activeProjectId = pathname.startsWith("/proyectos/") ? pathname.split("/")[2] : null;
  // Despliegue manual de cada cliente; por defecto se abre el que tiene el proyecto activo.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const isClientOpen = (c: SidebarClient) =>
    openMap[c.id] ?? c.projects.some((p) => p.id === activeProjectId);

  // Fila de navegación reutilizable; oculta la etiqueta en modo riel (collapsed).
  const navRow = (
    href: string,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    active: boolean,
    badge?: number,
  ) => (
    <Link
      key={href}
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md text-sm font-medium transition-colors",
        collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed ? <span className="flex-1">{label}</span> : null}
      {!collapsed && badge ? (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{badge}</span>
      ) : null}
    </Link>
  );

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        collapsed ? "w-16 items-stretch" : "w-64",
      )}
    >
      {/* Marca (enlace a Inicio) */}
      <Link
        href="/"
        onClick={onNavigate}
        title="Ir a Inicio"
        className={cn(
          "flex items-center gap-3 py-3.5 text-left transition-colors hover:bg-sidebar-accent/40",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">
          L
        </span>
        {!collapsed ? (
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-tight">Labstream</span>
            <span className="block truncate text-xs text-sidebar-muted">Productora · equipo</span>
          </span>
        ) : null}
      </Link>

      {/* Buscador (oculto en riel) */}
      {!collapsed ? (
        <div className="px-3 pb-2">
          <button onClick={onSearch} className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-background/60 px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-background">
            <Search className="size-4" />
            <span className="flex-1 text-left">Buscar</span>
            <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
          </button>
        </div>
      ) : null}

      {/* Navegación principal */}
      <nav className={cn("py-1", collapsed ? "px-2" : "px-3")}>
        {NAV.map((item) => {
          if (item.href === "/calendario" && !canCalendar) return null;
          if (item.href === "/timeline" && !canTimeline) return null;
          return navRow(item.href, item.label, item.icon, pathname === item.href, item.href === "/chat" ? chatUnread || undefined : undefined);
        })}
      </nav>

      {/* Clientes + Wiki */}
      <div className={cn("mt-4 flex-1 overflow-y-auto", collapsed ? "px-2" : "px-3")}>
        <div className={cn("flex items-center justify-between pb-1", collapsed ? "px-0 justify-center" : "px-2")}>
          {!collapsed ? (
            <Link href="/clientes" onClick={onNavigate} className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted hover:text-sidebar-foreground">Clientes</Link>
          ) : null}
          <Link
            href="/clientes/nuevo"
            onClick={onNavigate}
            className="text-sidebar-muted hover:text-sidebar-foreground"
            aria-label="Nuevo cliente"
            title="Nuevo cliente"
          >
            <Plus className="size-4" />
          </Link>
        </div>
        {clients.map((c) => {
          const active = pathname === `/clientes/${c.id}`;

          // En modo riel (collapsed) se mantiene el enlace simple con el emoji.
          if (collapsed) {
            return (
              <Link
                key={c.id}
                href={`/clientes/${c.id}`}
                onClick={onNavigate}
                title={c.name}
                className={cn(
                  "flex items-center justify-center rounded-md px-2 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40",
                )}
              >
                <span className="text-base leading-none">{c.emoji ?? "•"}</span>
              </Link>
            );
          }

          const open = isClientOpen(c);
          const hasProjects = c.projects.length > 0;
          return (
            <div key={c.id}>
              {/* Fila del cliente: chevron para desplegar + enlace al cliente */}
              <div
                className={cn(
                  "group/cli flex items-center rounded-md text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40",
                )}
              >
                {hasProjects ? (
                  <button
                    type="button"
                    onClick={() => setOpenMap((m) => ({ ...m, [c.id]: !open }))}
                    aria-label={open ? "Contraer" : "Desplegar"}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-muted hover:text-sidebar-foreground"
                  >
                    <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
                  </button>
                ) : (
                  <span className="w-7 shrink-0" />
                )}
                <Link
                  href={`/clientes/${c.id}`}
                  onClick={onNavigate}
                  className="flex min-w-0 flex-1 items-center gap-2 py-2"
                >
                  <span className="text-base leading-none">{c.emoji ?? "•"}</span>
                  <span className="flex-1 truncate">{c.name}</span>
                </Link>
                <span className="px-1 text-xs text-sidebar-muted group-hover/cli:hidden">{c.projectCount}</span>
                {canAdmin ? (
                  <button
                    type="button"
                    onClick={() => removeClient(c.id, c.name)}
                    title="Eliminar cliente"
                    aria-label={`Eliminar ${c.name}`}
                    className="mr-1 hidden size-6 shrink-0 items-center justify-center rounded-md text-sidebar-muted hover:bg-destructive/10 hover:text-destructive group-hover/cli:flex"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </div>

              {/* Proyectos del cliente (desplegados) */}
              {open && hasProjects ? (
                <div className="ml-[1.375rem] flex flex-col gap-0.5 border-l border-sidebar-border pb-1 pl-2 pt-0.5">
                  {c.projects.map((p) => {
                    const pActive = activeProjectId === p.id;
                    return (
                      <Link
                        key={p.id}
                        href={`/proyectos/${p.id}`}
                        onClick={onNavigate}
                        title={p.name}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                          pActive
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40",
                        )}
                      >
                        <span className="text-sm leading-none">{p.emoji ?? "•"}</span>
                        <span className="flex-1 truncate">{p.name}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        {!collapsed ? (
          <button
            type="button"
            onClick={toggleAdmin}
            className="mt-4 flex w-full items-center gap-1 px-2 pb-1 text-left text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted hover:text-sidebar-foreground"
          >
            <ChevronRight className={cn("size-3 transition-transform", showAdminItems && "rotate-90")} />
            <span className="flex-1">Administrativo</span>
          </button>
        ) : (
          <div className="mt-4" />
        )}
        {collapsed || showAdminItems ? (
          <>
            {canQuotes ? navRow("/cotizaciones", "Cotizaciones", FileText, pathname.startsWith("/cotizaciones")) : null}
            {canQuotes ? navRow("/facturacion", "Facturación", Receipt, pathname.startsWith("/facturacion")) : null}
            {navRow("/asistente", "Asistente IA", Sparkles, pathname === "/asistente")}
            {canWiki ? navRow("/wiki", "Wiki del equipo", BookOpen, pathname.startsWith("/wiki")) : null}
            {canBiblioteca ? navRow("/biblioteca", "Biblioteca", Library, pathname.startsWith("/biblioteca")) : null}
            {canReports ? navRow("/reportes", "Reportes", BarChart3, pathname.startsWith("/reportes")) : null}
          </>
        ) : null}
      </div>

      {/* Footer */}
      <div className={cn("border-t border-sidebar-border", collapsed ? "p-2" : "p-3")}>
        {canAdmin
          ? navRow("/configuracion", "Configuración", Settings, pathname.startsWith("/configuracion"))
          : null}
        <div className={cn("flex items-center gap-2.5 rounded-md", collapsed ? "flex-col px-0 py-1" : "px-2.5 py-1.5")}>
          <Link
            href="/perfil"
            onClick={onNavigate}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md hover:opacity-80"
            title="Mi perfil"
          >
            <UserAvatar initials={user.initials} color={user.color} url={user.avatarUrl} size="md" />
            {!collapsed ? (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{user.name}</span>
                <span className="block truncate text-xs text-sidebar-muted">{user.title}</span>
              </span>
            ) : null}
          </Link>
          <form action={logout}>
            <button
              type="submit"
              title="Cerrar sesión"
              className="flex size-7 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
