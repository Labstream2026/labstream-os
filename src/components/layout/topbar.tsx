"use client";

import { usePathname } from "next/navigation";
import { PanelRight, PanelLeft, MoreHorizontal, Share2, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationsBell, type NotificationItem } from "@/components/layout/notifications-bell";

export type TopbarAvatar = { initials: string | null; color: string | null };

function crumb(pathname: string): { emoji: string; label: string } {
  if (pathname === "/") return { emoji: "🏠", label: "Inicio" };
  if (pathname.startsWith("/mis-tareas")) return { emoji: "✅", label: "Mis tareas" };
  if (pathname.startsWith("/estados")) return { emoji: "💬", label: "Estados del equipo" };
  if (pathname.startsWith("/proyectos/nuevo")) return { emoji: "✨", label: "Nuevo proyecto" };
  if (pathname.startsWith("/proyectos")) return { emoji: "🗂️", label: "Proyectos" };
  if (pathname.startsWith("/plantillas")) return { emoji: "🧩", label: "Plantillas" };
  if (pathname.startsWith("/calendario")) return { emoji: "📅", label: "Calendario" };
  if (pathname.startsWith("/wiki")) return { emoji: "📚", label: "Wiki del equipo" };
  if (pathname.startsWith("/clientes/nuevo")) return { emoji: "✨", label: "Nuevo cliente" };
  if (pathname.startsWith("/clientes")) return { emoji: "🏢", label: "Cliente" };
  if (pathname.startsWith("/configuracion")) return { emoji: "⚙️", label: "Configuración" };
  if (pathname.startsWith("/cotizaciones")) return { emoji: "📄", label: "Cotizaciones" };
  if (pathname.startsWith("/biblioteca")) return { emoji: "📁", label: "Biblioteca" };
  if (pathname.startsWith("/asistente")) return { emoji: "✨", label: "Asistente IA" };
  if (pathname.startsWith("/perfil")) return { emoji: "🙂", label: "Mi perfil" };
  return { emoji: "•", label: "Labstream" };
}

export function Topbar({
  team,
  notifications,
  onTogglePanel,
  onToggleSidebar,
  onOpenMobileMenu,
}: {
  team: TopbarAvatar[];
  notifications: NotificationItem[];
  onTogglePanel: () => void;
  onToggleSidebar: () => void;
  onOpenMobileMenu: () => void;
}) {
  const pathname = usePathname();
  const { emoji, label } = crumb(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3 sm:px-4">
      {/* Abrir cajón de menú (solo móvil) */}
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground md:hidden"
        aria-label="Abrir menú"
        onClick={onOpenMobileMenu}
      >
        <Menu />
      </Button>

      {/* Plegar barra lateral (solo escritorio) */}
      <Button
        variant="ghost"
        size="icon"
        className="hidden text-muted-foreground md:inline-flex"
        aria-label="Plegar barra lateral"
        onClick={onToggleSidebar}
      >
        <PanelLeft />
      </Button>

      <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <span className="text-base leading-none">{emoji}</span>
        <span className="truncate">{label}</span>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
        <div className="hidden -space-x-2 lg:flex">
          {team.slice(0, 4).map((m, i) => (
            <UserAvatar key={i} initials={m.initials} color={m.color} size="sm" ring />
          ))}
        </div>
        <Button size="sm" className="hidden gap-1.5 sm:inline-flex">
          <Share2 className="size-4" />
          Compartir
        </Button>
        <NotificationsBell items={notifications} />
        <ThemeToggle />
        {/* Plegar chat (solo escritorio; en móvil el chat está en la barra inferior) */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden text-muted-foreground md:inline-flex"
          aria-label="Panel de chat"
          onClick={onTogglePanel}
        >
          <PanelRight />
        </Button>
        <Button variant="ghost" size="icon" className="hidden text-muted-foreground md:inline-flex" aria-label="Más">
          <MoreHorizontal />
        </Button>
      </div>
    </header>
  );
}
