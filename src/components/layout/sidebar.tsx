"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  ListChecks,
  MessageSquare,
  LayoutGrid,
  LayoutTemplate,
  Search,
  Settings,
  Plus,
  ChevronsUpDown,
  BookOpen,
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
  { href: "/plantillas", label: "Plantillas", icon: LayoutTemplate },
];

export function Sidebar({
  user,
  clients,
  canAdmin,
}: {
  user: SidebarUser;
  clients: SidebarClient[];
  canAdmin: boolean;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Marca */}
      <button className="flex items-center gap-3 px-4 py-3.5 text-left hover:bg-sidebar-accent/40 transition-colors">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">
          L
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-tight">Labstream</span>
          <span className="block truncate text-xs text-sidebar-muted">Productora · equipo</span>
        </span>
        <ChevronsUpDown className="size-4 text-sidebar-muted" />
      </button>

      {/* Buscador */}
      <div className="px-3 pb-2">
        <button className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-background/60 px-3 py-2 text-sm text-sidebar-muted hover:bg-background transition-colors">
          <Search className="size-4" />
          <span className="flex-1 text-left">Buscar</span>
          <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
        </button>
      </div>

      {/* Navegación */}
      <nav className="px-3 py-1">
        {NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{item.label}</span>
              {item.badge ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Clientes */}
      <div className="mt-4 flex-1 overflow-y-auto px-3">
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
            Clientes
          </span>
          <Link href="/clientes/nuevo" className="text-sidebar-muted hover:text-sidebar-foreground" aria-label="Nuevo cliente">
            <Plus className="size-4" />
          </Link>
        </div>
        {clients.map((c) => {
          const active = pathname === `/clientes/${c.id}`;
          return (
            <Link
              key={c.id}
              href={`/clientes/${c.id}`}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/40",
              )}
            >
              <span className="text-base leading-none">{c.emoji ?? "•"}</span>
              <span className="flex-1 truncate">{c.name}</span>
              <span className="text-xs text-sidebar-muted">{c.projectCount}</span>
            </Link>
          );
        })}

        <div className="mt-4 px-2 pb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
            Wiki
          </span>
        </div>
        <div className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/80">
          <BookOpen className="size-4" />
          <span className="flex-1">Wiki del equipo</span>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        {canAdmin ? (
          <Link
            href="/configuracion"
            className="mb-1 flex items-center gap-3 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/40 transition-colors"
          >
            <Settings className="size-4" />
            Configuración
          </Link>
        ) : null}
        <div className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5">
          <UserAvatar initials={user.initials} color={user.color} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-sidebar-muted">{user.title}</span>
          </span>
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
