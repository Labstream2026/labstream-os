"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListChecks, LayoutGrid, MessageSquare, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

// Barra de navegación inferior — solo móvil. Alcanzable con el pulgar.
// Inicio · Tareas · Proyectos son destinos; Chat y Más abren cajones (estado en AppShell).
export function BottomNav({
  onChat,
  onMenu,
  chatActive,
  chatUnread = 0,
}: {
  onChat: () => void;
  onMenu: () => void;
  chatActive: boolean;
  chatUnread?: number;
}) {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Inicio", icon: Home, match: (p: string) => p === "/" },
    { href: "/mis-tareas", label: "Tareas", icon: ListChecks, match: (p: string) => p.startsWith("/mis-tareas") },
    { href: "/proyectos", label: "Proyectos", icon: LayoutGrid, match: (p: string) => p.startsWith("/proyectos") },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {links.map((l) => {
        const active = l.match(pathname);
        const Icon = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className={cn("size-5", active && "fill-primary/10")} />
            {l.label}
          </Link>
        );
      })}

      <button
        type="button"
        onClick={onChat}
        className={cn(
          "relative flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
          chatActive ? "text-primary" : "text-muted-foreground",
        )}
      >
        <span className="relative">
          <MessageSquare className="size-5" />
          {chatUnread > 0 ? (
            <span className="absolute -right-2 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
              {chatUnread > 99 ? "99+" : chatUnread}
            </span>
          ) : null}
        </span>
        Chat
      </button>

      <button
        type="button"
        onClick={onMenu}
        className="flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors"
      >
        <Menu className="size-5" />
        Más
      </button>
    </nav>
  );
}
