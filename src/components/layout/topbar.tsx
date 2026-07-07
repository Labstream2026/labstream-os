"use client";

import * as React from "react";
import { IconCalendario, IconConfiguracion } from "@/components/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelRight, PanelLeft, MoreHorizontal, Share2, Check, Menu, User, LogOut, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { NotificationsBell, type NotificationItem } from "@/components/layout/notifications-bell";
import { TabsBar } from "@/components/layout/tabs-bar";
import { logout } from "@/lib/auth-actions";
import { routeMeta } from "@/lib/nav-meta";

export type TopbarAvatar = { initials: string | null; color: string | null };

// Copia el enlace de la página actual (para compartir con el equipo).
function ShareButton() {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      size="sm"
      className="hidden gap-1.5 sm:inline-flex"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch { /* ignora */ }
      }}
      title="Copiar el enlace de esta página"
    >
      {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
      {copied ? "¡Enlace copiado!" : "Compartir"}
    </Button>
  );
}

export function Topbar({
  team,
  notifications,
  onTogglePanel,
  onToggleSidebar,
  onOpenMobileMenu,
  showChatToggle = true,
}: {
  team: TopbarAvatar[];
  notifications: NotificationItem[];
  onTogglePanel: () => void;
  onToggleSidebar: () => void;
  onOpenMobileMenu: () => void;
  showChatToggle?: boolean;
}) {
  const pathname = usePathname();
  const { emoji, label } = routeMeta(pathname);
  // "Volver" en móvil: en una página de detalle (p. ej. /proyectos/[id]) la barra superior no
  // ofrecía cómo regresar a la lista. Si la ruta tiene un segmento anidado, mostramos una flecha
  // que lleva a la sección padre. El chat trae su propio botón de volver, así que se excluye.
  const segments = pathname.split("/").filter(Boolean);
  const showBack = segments.length >= 2 && segments[0] !== "chat";
  const backHref = `/${segments[0]}`;

  return (
    <header className="flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-border bg-background px-3 pt-[env(safe-area-inset-top)] sm:px-4">
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

      {/* Migaja: en escritorio mandan las pestañas, así que aquí solo se muestra
          en móvil (donde no hay barra de pestañas). */}
      <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium md:hidden">
        {showBack ? (
          <Link
            href={backHref}
            aria-label="Volver"
            className="-ml-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted active:scale-95"
          >
            <ChevronLeft className="size-5" />
          </Link>
        ) : (
          <span className="text-base leading-none">{emoji}</span>
        )}
        <span className="truncate">{label}</span>
      </div>

      {/* Pestañas (escritorio): ahora viven en esta misma fila, junto al botón de plegar. */}
      <span className="mx-1 hidden h-5 w-px shrink-0 bg-border md:block" />
      <TabsBar />
      <span className="mx-1 hidden h-5 w-px shrink-0 bg-border md:block" />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
        <div className="hidden -space-x-2 lg:flex">
          {team.slice(0, 4).map((m, i) => (
            <UserAvatar key={i} initials={m.initials} color={m.color} size="sm" ring />
          ))}
        </div>
        <ShareButton />
        <NotificationsBell items={notifications} />
        <ThemeToggle />
        {/* Plegar chat (solo escritorio; en móvil el chat está en la barra inferior).
            Oculto en páginas de ancho completo donde no hay panel de chat. */}
        {showChatToggle ? (
          <Button
            variant="ghost"
            size="icon"
            className="hidden text-muted-foreground md:inline-flex"
            aria-label="Panel de chat"
            onClick={onTogglePanel}
          >
            <PanelRight />
          </Button>
        ) : null}
        <details data-autoclose className="relative hidden md:block">
          <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Más opciones">
            <MoreHorizontal className="size-5" />
          </summary>
          <div className="absolute right-0 z-30 mt-1 w-52 rounded-lg border border-border bg-popover p-1 text-sm shadow-lg">
            <Link href="/perfil" className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted">
              <User className="size-4" /> Mi perfil
            </Link>
            <Link href="/calendario" className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted">
              <IconCalendario className="size-4" /> Mi calendario
            </Link>
            <Link href="/configuracion" className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted">
              <IconConfiguracion className="size-4" /> Configuración
            </Link>
            <form action={logout} className="border-t border-border">
              <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-destructive hover:bg-muted">
                <LogOut className="size-4" /> Cerrar sesión
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}
