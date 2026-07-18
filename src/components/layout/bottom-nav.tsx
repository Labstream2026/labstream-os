"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconInicio, IconEntregas, IconTareas, IconCliente, IconProyectos, IconChat, IconCalendario, IconMas, type IconProps } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useChatLive } from "@/components/layout/chat-live";

// Barra de navegación inferior — solo móvil. Alcanzable con el pulgar.
// Inicio · Tareas · Proyectos · Chat son destinos; "Más" abre el cajón del menú.
// Chat lleva a /chat (la BANDEJA con todos los chats: Marcebot, DMs, canales), no a una
// conversación suelta.
//
// IMPORTANTE (PWA en celular): el área segura inferior (home indicator del iPhone) va como
// padding EXTRA debajo de la fila de íconos, NO dentro de ella. Antes el alto `h-16` incluía
// ese padding (box-sizing: border-box) y en la app instalada los íconos quedaban apretados/
// cortados. Ahora la fila mide 64px siempre y el safe-area se suma por debajo.
export function BottomNav({
  onMenu,
  chatUnread = 0,
  canClients = true,
  isCliente = false,
}: {
  onMenu: () => void;
  chatUnread?: number;
  canClients?: boolean;
  isCliente?: boolean;
}) {
  const pathname = usePathname();
  const chatActive = pathname === "/chat" || pathname.startsWith("/chat/");
  // Badge VIVO: el stream global manda; el valor server-render solo arranca.
  const live = useChatLive();
  const unread = live.total ?? chatUnread;

  // El portal del cliente navega entre SUS proyectos, el calendario y el chat de su proyecto.
  // Íconos del set propio de Labstream (duotono): misma firma que un ícono de UI (className).
  const links: { href: string; label: string; icon: (p: IconProps) => ReactElement; match: (p: string) => boolean }[] = isCliente
    ? [
        { href: "/mis-entregas", label: "Entregas", icon: IconEntregas, match: (p: string) => p.startsWith("/mis-entregas") },
        { href: "/proyectos", label: "Proyectos", icon: IconProyectos, match: (p: string) => p.startsWith("/proyectos") },
        { href: "/calendario", label: "Calendario", icon: IconCalendario, match: (p: string) => p.startsWith("/calendario") },
        { href: "/chat", label: "Chat", icon: IconChat, match: (p: string) => p.startsWith("/chat") },
      ]
    : [
        { href: "/", label: "Inicio", icon: IconInicio, match: (p: string) => p === "/" },
        { href: "/mis-tareas", label: "Tareas", icon: IconTareas, match: (p: string) => p.startsWith("/mis-tareas") },
        // "Clientes" (antes "Proyectos"); sin permiso de clientes, cae al tablero de proyectos.
        canClients
          ? { href: "/clientes", label: "Clientes", icon: IconCliente, match: (p: string) => p.startsWith("/clientes") }
          : { href: "/proyectos", label: "Proyectos", icon: IconProyectos, match: (p: string) => p.startsWith("/proyectos") },
      ];

  // Celda táctil: ocupa toda la fila, centra ícono + etiqueta y da feedback al tocar.
  const cell =
    "relative flex flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium leading-none transition-colors active:bg-muted/60 select-none touch-manipulation";
  // Indicador de pestaña activa (barrita superior, centrada).
  const indicator = "absolute inset-x-6 top-0 h-0.5 rounded-full bg-primary";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-16 items-stretch">
        {links.map((l) => {
          const active = l.match(pathname);
          const Icon = l.icon;
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cn(cell, active ? "text-primary" : "text-muted-foreground")}
            >
              {active ? <span className={indicator} /> : null}
              <Icon className={cn("size-6", !active && "opacity-80")} />
              <span className="truncate">{l.label}</span>
            </Link>
          );
        })}

        {!isCliente ? (
          <Link
            href="/chat"
            aria-current={chatActive ? "page" : undefined}
            className={cn(cell, chatActive ? "text-primary" : "text-muted-foreground")}
          >
            {chatActive ? <span className={indicator} /> : null}
            <span className="relative">
              <IconChat className={cn("size-6", !chatActive && "opacity-80")} />
              {unread > 0 ? (
                <span className="absolute -right-2 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </span>
            <span className="truncate">Chat</span>
          </Link>
        ) : null}

        <button type="button" onClick={onMenu} aria-label="Abrir menú" className={cn(cell, "text-muted-foreground")}>
          <IconMas className="size-6 opacity-80" />
          <span className="truncate">Más</span>
        </button>
      </div>
    </nav>
  );
}
