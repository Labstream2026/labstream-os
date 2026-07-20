"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EntityEmoji } from "@/components/icons/marks";
import { cn } from "@/lib/utils";

// Título del proyecto EN la barra superior (Opción A): la página lo teletransporta al hueco
// `#topbar-page-slot` del Topbar (portal tras montar; el hueco existe en todas las páginas y
// queda vacío fuera de los proyectos). Así el nombre va arriba del todo sin que el layout
// tenga que conocer el proyecto, y la cabecera dentro de la página desaparece.
export function ProjectTopbarTitle({
  name,
  emoji,
  color,
  clientId,
  clientName,
  code,
  typeLabel,
  statusLabel,
  statusClassName,
  progress,
}: {
  name: string;
  emoji: string | null;
  color: string | null;
  clientId: string;
  clientName: string;
  code: string;
  typeLabel: string;
  statusLabel: string;
  statusClassName: string;
  progress: number;
}) {
  const [target, setTarget] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    setTarget(document.getElementById("topbar-page-slot"));
  }, []);
  if (!target) return null;

  return createPortal(
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Link
        href="/proyectos"
        title="Volver a Proyectos"
        aria-label="Volver a Proyectos"
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
      </Link>
      <span className="grid size-6 shrink-0 place-items-center rounded-md text-sm" style={{ background: `${color ?? "#6366f1"}22` }}>
        <EntityEmoji value={emoji} fallback="🎬" />
      </span>
      <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
      <span className="hidden min-w-0 shrink-[2] truncate text-xs text-muted-foreground xl:inline">
        <Link href={`/clientes/${clientId}`} className="hover:underline">{clientName}</Link>
        {" · "}{code}{" · "}{typeLabel}
      </span>
      <Badge className={cn("hidden shrink-0 sm:inline-flex", statusClassName)}>{statusLabel}</Badge>
      <span className="hidden shrink-0 items-center gap-1.5 lg:flex" title={`${progress}% completado`}>
        <span className="block h-1.5 w-20 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{progress}%</span>
      </span>
    </div>,
    target,
  );
}
