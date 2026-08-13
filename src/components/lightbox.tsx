"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

// Visor de imágenes Y VIDEO global. Se monta una vez en el shell y, por delegación de
// eventos, intercepta los clics sobre cualquier enlace marcado con `data-lightbox`
// (funciona tanto si el enlace se renderiza en el servidor como en el cliente).
// El material se abre encima de la página actual (no en otra pestaña) y se cierra
// con Escape, con clic en el fondo o con la «×» — volviendo al chat/pestaña donde
// estabas.
//
// NAVEGACIÓN: al abrir, el visor recoge TODOS los enlaces `data-lightbox` visibles en la
// página, en orden de documento, y deja moverse entre ellos con ‹ › o con las flechas del
// teclado. Así la cuadrícula de Archivos (o la galería de un entregable) se recorre sin
// cerrar y volver a abrir — el «visor central» pedido para la ficha del cliente, gratis
// para todas las demás pantallas que ya usaban data-lightbox.
//
// Uso desde cualquier sitio:
//   <a href="/api/files/123" data-lightbox data-lightbox-name="foto.jpg">…<img/></a>
//   <a href="/api/files-asset/456" data-lightbox data-lightbox-video data-lightbox-name="corte.mp4">…</a>

type Pieza = { src: string; name: string | null; video: boolean };
type Current = { lista: Pieza[]; i: number };

function leerPieza(a: HTMLAnchorElement): Pieza | null {
  const src = a.getAttribute("href");
  if (!src) return null;
  return { src, name: a.getAttribute("data-lightbox-name"), video: a.hasAttribute("data-lightbox-video") };
}

export function Lightbox() {
  const [current, setCurrent] = React.useState<Current | null>(null);

  // Delegación: abre el visor al hacer clic (sin modificadores) en un enlace
  // `data-lightbox`. Con modificadores (Cmd/Ctrl/Shift/Alt) o botón no primario se
  // deja el comportamiento por defecto (abrir/descargar el archivo).
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const a = target?.closest("a[data-lightbox]") as HTMLAnchorElement | null;
      if (!a) return;
      const abierta = leerPieza(a);
      if (!abierta) return;
      e.preventDefault();
      // La lista de vecinos se congela AL ABRIR (no en cada render): es una foto del DOM en
      // ese instante, suficiente para recorrer lo que se estaba viendo.
      const todos = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[data-lightbox]"))
        .map(leerPieza)
        .filter((p): p is Pieza => p !== null);
      const i = todos.findIndex((p) => p.src === abierta.src);
      setCurrent(i >= 0 ? { lista: todos, i } : { lista: [abierta], i: 0 });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Escape para cerrar, flechas para navegar + bloqueo del scroll de fondo mientras está abierto.
  React.useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCurrent(null);
      else if (e.key === "ArrowRight") setCurrent((c) => (c && c.lista.length > 1 ? { ...c, i: (c.i + 1) % c.lista.length } : c));
      else if (e.key === "ArrowLeft") setCurrent((c) => (c && c.lista.length > 1 ? { ...c, i: (c.i - 1 + c.lista.length) % c.lista.length } : c));
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [current]);

  // `current` solo se activa tras un clic en el cliente → `document` ya existe,
  // por eso no hace falta un guardia de montaje para el portal.
  if (!current) return null;
  const pieza = current.lista[current.i];
  const varios = current.lista.length > 1;
  const mover = (d: -1 | 1) => setCurrent((c) => (c ? { ...c, i: (c.i + d + c.lista.length) % c.lista.length } : c));

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={pieza.name ?? (pieza.video ? "Video" : "Imagen")}
      onClick={() => setCurrent(null)}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-150"
    >
      {/* Botón de cerrar */}
      <button
        type="button"
        onClick={() => setCurrent(null)}
        aria-label="Cerrar"
        className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <X className="size-5" />
      </button>

      {varios ? (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); mover(-1); }}
            aria-label="Anterior"
            className="absolute left-2 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 sm:left-4"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); mover(1); }}
            aria-label="Siguiente"
            className="absolute right-2 top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25 sm:right-4"
          >
            <ChevronRight className="size-6" />
          </button>
        </>
      ) : null}

      {/* La pieza: clic encima NO cierra (solo el fondo). `key` por src: al navegar, el <video>
          anterior se desmonta de verdad (sin key seguiría sonando el audio del anterior). */}
      {pieza.video ? (
        <video
          key={pieza.src}
          src={pieza.src}
          controls
          autoPlay
          playsInline
          onClick={(e) => e.stopPropagation()}
          className="max-h-[85vh] max-w-[92vw] rounded-lg shadow-2xl animate-in zoom-in-95 duration-150"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={pieza.src}
          src={pieza.src}
          alt={pieza.name ?? ""}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain shadow-2xl animate-in zoom-in-95 duration-150"
        />
      )}
      <span className="mt-3 flex max-w-[92vw] items-center gap-3 text-sm text-white/70" onClick={(e) => e.stopPropagation()}>
        {varios ? <span className="shrink-0 tabular-nums text-white/50">{current.i + 1} / {current.lista.length}</span> : null}
        {pieza.name ? <span className="truncate">{pieza.name}</span> : null}
        <a
          href={`${pieza.src}${pieza.src.includes("?") ? "&" : "?"}download=1`}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs text-white transition hover:bg-white/20"
          title="Descargar el original"
        >
          <Download className="size-3.5" /> Descargar
        </a>
      </span>
    </div>,
    document.body,
  );
}
