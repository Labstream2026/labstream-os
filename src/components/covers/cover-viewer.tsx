"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Columns2, Download, Maximize2, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Visor de portadas a pantalla completa ──
// Lo comparten la sala pública del cliente y el panel del equipo. La portada se muestra
// COMPLETA (object-contain, nunca recortada), con zoom + arrastre, flechas entre las portadas
// del mismo grupo, teclado y un modo COMPARAR lado a lado (el caso central del banco: dos
// opciones del mismo video). Las acciones (aprobar, elegir, anotar…) las inyecta quien lo usa
// como `actions`, para que se puedan tomar decisiones sin cerrar el visor.

export type ViewerCover = {
  id: string;
  name: string;
  src: string; // imagen grande (WebP del NAS)
  download?: string | null; // descarga del original, si se permite
  badge?: { label: string; cls: string } | null;
  caption?: string | null; // línea bajo el nombre (nota, quién decidió…)
};

const ZOOMS = [1, 1.5, 2, 3];

export function CoverViewer({
  covers,
  index,
  onIndexChange,
  onClose,
  actions,
  extra,
  compareLabel = "Comparar",
}: {
  covers: ViewerCover[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  // Botonera bajo la imagen: recibe la portada visible.
  actions?: (cover: ViewerCover) => React.ReactNode;
  // Panel lateral opcional (hilo de notas / lienzo de anotación).
  extra?: (cover: ViewerCover) => React.ReactNode;
  compareLabel?: string;
}) {
  const [zoom, setZoom] = React.useState(0); // índice en ZOOMS
  const [compare, setCompare] = React.useState(false);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const drag = React.useRef<{ x: number; y: number } | null>(null);

  const cover = covers[index];
  const canCompare = covers.length > 1;

  const go = React.useCallback(
    (delta: number) => {
      if (covers.length < 2) return;
      const next = (index + delta + covers.length) % covers.length;
      onIndexChange(next);
      setZoom(0);
      setPan({ x: 0, y: 0 });
    },
    [covers.length, index, onIndexChange],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // No secuestrar el teclado mientras se escribe una nota.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 1, ZOOMS.length - 1));
      else if (e.key === "-") setZoom((z) => Math.max(z - 1, 0));
      else if ((e.key === "c" || e.key === "C") && canCompare) setCompare((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose, canCompare]);

  // Bloquea el scroll del fondo mientras el visor está abierto.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Portal a <body>: un ancestro con transform/filter/backdrop-blur crea un bloque contenedor
  // y `fixed` dejaría de referirse al viewport (la sala del cliente tiene justo eso). Montar
  // fuera del árbol lo hace inmune. El visor solo se monta tras un clic (nunca en el HTML del
  // servidor), así que basta con el guard de `document`.
  const host = typeof document === "undefined" ? null : document.body;

  if (!cover || !host) return null;
  const scale = ZOOMS[zoom];

  const tool = (label: string, icon: React.ReactNode, onClick: () => void, on = false, disabled = false) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-lg text-white/85 transition-colors hover:bg-white/15 disabled:opacity-35",
        on && "bg-white/20 text-white",
      )}
    >
      {icon}
    </button>
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Portada ${cover.name}`}
      className="fixed inset-0 z-[120] flex flex-col bg-black/95 backdrop-blur-sm"
    >
      {/* Barra superior */}
      <div className="flex shrink-0 items-center gap-2.5 px-4 py-2.5 text-white">
        {covers.length > 1 ? (
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold tabular-nums">
            {index + 1} / {covers.length}
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={cover.name}>{cover.name}</p>
          {cover.caption ? <p className="truncate text-[11px] text-white/55">{cover.caption}</p> : null}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {canCompare ? tool(`${compareLabel} (C)`, <Columns2 className="size-4" />, () => setCompare((v) => !v), compare) : null}
          {tool("Alejar (−)", <Minus className="size-4" />, () => setZoom((z) => Math.max(z - 1, 0)), false, zoom === 0 || compare)}
          <span className="min-w-10 text-center text-[11px] tabular-nums text-white/60">{Math.round(scale * 100)}%</span>
          {tool("Acercar (+)", <Plus className="size-4" />, () => setZoom((z) => Math.min(z + 1, ZOOMS.length - 1)), false, zoom === ZOOMS.length - 1 || compare)}
          {cover.download
            ? tool("Descargar", <Download className="size-4" />, () => window.open(cover.download as string, "_blank"))
            : null}
          {tool("Cerrar (Esc)", <X className="size-5" />, onClose)}
        </div>
      </div>

      {/* Escenario */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-3 pb-3 sm:flex-row">
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {covers.length > 1 && !compare ? (
            <button
              type="button"
              aria-label="Anterior"
              onClick={() => go(-1)}
              className="absolute left-0 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : null}

          {compare ? (
            // Comparar: TODAS las del grupo lado a lado, completas.
            <div className="flex h-full w-full items-center justify-center gap-3 overflow-x-auto px-10">
              {covers.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onIndexChange(i);
                    setCompare(false);
                  }}
                  className={cn(
                    "relative h-full max-h-full shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
                    i === index ? "border-primary" : "border-transparent hover:border-white/30",
                  )}
                  title={`Ver ${c.name} en grande`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.src} alt={c.name} className="h-full w-auto max-w-[42vw] object-contain" />
                  {c.badge ? (
                    <span className={cn("absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold", c.badge.cls)}>{c.badge.label}</span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <div
              className={cn("flex h-full w-full items-center justify-center", scale > 1 ? "cursor-grab overflow-hidden active:cursor-grabbing" : "")}
              onPointerDown={(e) => {
                if (scale === 1) return;
                drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
                try {
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                } catch {
                  /* sin captura: el arrastre sigue funcionando dentro del lienzo */
                }
              }}
              onPointerMove={(e) => {
                if (!drag.current) return;
                setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover.src}
                alt={cover.name}
                draggable={false}
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
                className="max-h-full max-w-full select-none object-contain transition-transform duration-150"
              />
            </div>
          )}

          {covers.length > 1 && !compare ? (
            <button
              type="button"
              aria-label="Siguiente"
              onClick={() => go(1)}
              className="absolute right-0 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <ChevronRight className="size-5" />
            </button>
          ) : null}
        </div>

        {extra ? <div className="min-h-0 shrink-0 overflow-y-auto sm:w-80">{extra(cover)}</div> : null}
      </div>

      {/* Acciones + ayuda de teclado */}
      {actions ? <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-4 pb-2">{actions(cover)}</div> : null}
      <div className="hidden shrink-0 flex-wrap items-center justify-center gap-3 pb-3 text-[11px] text-white/40 sm:flex">
        <span>← → pasar</span>
        <span>+ − zoom</span>
        {canCompare ? <span>C comparar</span> : null}
        <span>Esc cerrar</span>
      </div>
    </div>,
    host,
  );
}

// Miniatura estándar del banco: SIN recorte (la portada se ve completa sobre fondo neutro).
// Reemplaza el `object-cover` en 9:16 que mutilaba las portadas horizontales o cuadradas.
export function CoverThumb({
  src,
  alt,
  className,
  onClick,
}: {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Ver ${alt} en grande`}
      className={cn(
        "group relative block w-full overflow-hidden bg-[repeating-conic-gradient(hsl(var(--muted))_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" className="aspect-[9/16] w-full object-contain" />
      <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 transition-colors group-hover:bg-black/25">
        <Maximize2 className="size-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
    </button>
  );
}
