"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ListChecks,
  MessageSquare,
  LayoutGrid,
  LayoutTemplate,
  CalendarDays,
  FileText,
  Sparkles,
  Search,
  Settings,
  Plus,
  ChevronsUpDown,
  BookOpen,
  Library,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import { logout } from "@/lib/auth-actions";

export type SidebarUser = {
  name: string;
  title: string | null;
  initials: string | null;
  color: string | null;
};

export type SidebarClient = {
  id: string;
  name: string;
  emoji: string | null;
  accentColor: string | null;
  projectCount: number;
};

const NAV = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/mis-tareas", label: "Mis tareas", icon: ListChecks, badge: 4 },
  { href: "/estados", label: "Estados", icon: MessageSquare, badge: 8 },
  { href: "/proyectos", label: "Proyectos", icon: LayoutGrid },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/asistente", label: "Asistente IA", icon: Sparkles },
  { href: "/plantillas", label: "Plantillas", icon: LayoutTemplate },
];

export function Sidebar({
  user,
  clients,
  canAdmin,
  canQuotes,
  collapsed = false,
  onNavigate,
}: {
  user: SidebarUser;
  clients: SidebarClient[];
  canAdmin: boolean;
  canQuotes?: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

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
      {/* Marca */}
      <button
        className={cn(
          "flex items-center gap-3 py-3.5 text-left transition-colors hover:bg-sidebar-accent/40",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">
          L
        </span>
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-tight">Labstream</span>
              <span className="block truncate text-xs text-sidebar-muted">Productora · equipo</span>
            </span>
            <ChevronsUpDown className="size-4 text-sidebar-muted" />
          </>
        ) : null}
      </button>

      {/* Buscador (oculto en riel) */}
      {!collapsed ? (
        <div className="px-3 pb-2">
          <button className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-background/60 px-3 py-2 text-sm text-sidebar-muted transition-colors hover:bg-background">
            <Search className="size-4" />
            <span className="flex-1 text-left">Buscar</span>
            <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
          </button>
        </div>
      ) : null}

      {/* Navegación principal */}
      <nav className={cn("py-1", collapsed ? "px-2" : "px-3")}>
        {NAV.map((item) => navRow(item.href, item.label, item.icon, pathname === item.href, item.badge))}
        {canQuotes
          ? navRow("/cotizaciones", "Cotizaciones", FileText, pathname.startsWith("/cotizaciones"))
          : null}
      </nav>

      {/* Clientes + Wiki */}
      <div className={cn("mt-4 flex-1 overflow-y-auto", collapsed ? "px-2" : "px-3")}>
        <div className={cn("flex items-center justify-between pb-1", collapsed ? "px-0 justify-center" : "px-2")}>
          {!collapsed ? (
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">Clientes</span>
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
          return (
            <Link
              key={c.id}
              href={`/clientes/${c.id}`}
              onClick={onNavigate}
              title={collapsed ? c.name : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md text-sm transition-colors",
                collapsed ? "justify-center px-2 py-2" : "px-2.5 py-2",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40",
              )}
            >
              <span className="text-base leading-none">{c.emoji ?? "•"}</span>
              {!collapsed ? (
                <>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-sidebar-muted">{c.projectCount}</span>
                </>
              ) : null}
            </Link>
          );
        })}

        {!collapsed ? (
          <div className="mt-4 px-2 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">Wiki</span>
          </div>
        ) : (
          <div className="mt-4" />
        )}
        {navRow("/wiki", "Wiki del equipo", BookOpen, pathname.startsWith("/wiki"))}
        {navRow("/biblioteca", "Biblioteca", Library, pathname.startsWith("/biblioteca"))}
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
            <UserAvatar initials={user.initials} color={user.color} size="md" />
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
