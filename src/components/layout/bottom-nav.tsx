"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconInicio, IconEntregas, IconTareas, IconCliente, IconProyectos, IconCalendario, IconMas, type IconProps } from "@/components/icons";
import { cn } from "@/lib/utils";

// Barra de navegación inferior — solo móvil. Alcanzable con el pulgar.
// Inicio · Tareas · Clientes · Calendario son destinos; «Más» abre el cajón del menú, que trae
// arriba los accesos de CREAR (nueva tarea / nueva cita) — por eso el FAB «+» ya no flota en
// móvil (chocaba con la burbuja de chat). El chat se abre desde su burbuja flotante (con badge).
//
// IMPORTANTE (PWA en celular): el área segura inferior (home indicator del iPhone) va como
// padding EXTRA debajo de la fila de íconos, NO dentro de ella. Antes el alto `h-16` incluía
// ese padding (box-sizing: border-box) y en la app instalada los íconos quedaban apretados/
// cortados. Ahora la fila mide 64px siempre y el safe-area se suma por debajo.
export function BottomNav({
  onMenu,
  canClients = true,
  canCalendar = true,
  isCliente = false,
}: {
  onMenu: () => void;
  canClients?: boolean;
  canCalendar?: boolean;
  isCliente?: boolean;
}) {
  const pathname = usePathname();

  // El portal del cliente navega entre SUS proyectos, el calendario y sus entregas.
  // Íconos del set propio de Labstream (duotono): misma firma que un ícono de UI (className).
  const links: { href: string; label: string; icon: (p: IconProps) => ReactElement; match: (p: string) => boolean }[] = isCliente
    ? [
        // El cliente (portal) no tiene chat: sin pestaña Chat en su barra.
        { href: "/mis-entregas", label: "Entregas", icon: IconEntregas, match: (p: string) => p.startsWith("/mis-entregas") },
        { href: "/proyectos", label: "Proyectos", icon: IconProyectos, match: (p: string) => p.startsWith("/proyectos") },
        { href: "/calendario", label: "Calendario", icon: IconCalendario, match: (p: string) => p.startsWith("/calendario") },
      ]
    : [
        { href: "/", label: "Inicio", icon: IconInicio, match: (p: string) => p === "/" },
        { href: "/mis-tareas", label: "Tareas", icon: IconTareas, match: (p: string) => p.startsWith("/mis-tareas") },
        // "Clientes"; sin permiso de clientes, cae al tablero de proyectos.
        canClients
          ? { href: "/clientes", label: "Clientes", icon: IconCliente, match: (p: string) => p.startsWith("/clientes") }
          : { href: "/proyectos", label: "Proyectos", icon: IconProyectos, match: (p: string) => p.startsWith("/proyectos") },
        // Calendario reemplaza a Chat en la barra (el chat vive en su burbuja flotante, con badge).
        ...(canCalendar
          ? [{ href: "/calendario", label: "Calendario", icon: IconCalendario, match: (p: string) => p.startsWith("/calendario") }]
          : []),
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

        <button type="button" onClick={onMenu} aria-label="Abrir menú" className={cn(cell, "text-muted-foreground")}>
          <IconMas className="size-6 opacity-80" />
          <span className="truncate">Más</span>
        </button>
      </div>
    </nav>
  );
}
