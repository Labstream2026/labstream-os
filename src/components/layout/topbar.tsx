"use client";

import { usePathname } from "next/navigation";
import { PanelRight, MoreHorizontal, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export type TopbarAvatar = { initials: string | null; color: string | null };

function crumb(pathname: string): { emoji: string; label: string } {
  if (pathname === "/") return { emoji: "🏠", label: "Inicio" };
  if (pathname.startsWith("/mis-tareas")) return { emoji: "✅", label: "Mis tareas" };
  if (pathname.startsWith("/estados")) return { emoji: "💬", label: "Estados del equipo" };
  if (pathname.startsWith("/proyectos/nuevo")) return { emoji: "✨", label: "Nuevo proyecto" };
  if (pathname.startsWith("/proyectos")) return { emoji: "🗂️", label: "Proyectos" };
  if (pathname.startsWith("/plantillas")) return { emoji: "🧩", label: "Plantillas" };
  if (pathname.startsWith("/clientes/nuevo")) return { emoji: "✨", label: "Nuevo cliente" };
  if (pathname.startsWith("/clientes")) return { emoji: "🏢", label: "Cliente" };
  if (pathname.startsWith("/configuracion")) return { emoji: "⚙️", label: "Configuración" };
  return { emoji: "•", label: "Labstream" };
}

export function Topbar({
  team,
  onTogglePanel,
}: {
  team: TopbarAvatar[];
  onTogglePanel: () => void;
}) {
  const pathname = usePathname();
  const { emoji, label } = crumb(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="text-base leading-none">{emoji}</span>
        <span className="truncate">{label}</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex -space-x-2">
          {team.slice(0, 4).map((m, i) => (
            <UserAvatar key={i} initials={m.initials} color={m.color} size="sm" ring />
          ))}
        </div>
        <Button size="sm" className="gap-1.5">
          <Share2 className="size-4" />
          Compartir
        </Button>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          aria-label="Panel lateral"
          onClick={onTogglePanel}
        >
          <PanelRight />
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label="Más">
          <MoreHorizontal />
        </Button>
      </div>
    </header>
  );
}
