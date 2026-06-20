"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Visor de imágenes global. Se monta una vez en el shell y, por delegación de
// eventos, intercepta los clics sobre cualquier enlace marcado con `data-lightbox`
// (funciona tanto si el enlace se renderiza en el servidor como en el cliente).
// La imagen se abre encima de la página actual (no en otra pestaña) y se cierra
// con Escape, con clic en el fondo o con la «×» — volviendo al chat/pestaña donde
// estabas.
//
// Uso desde cualquier sitio:
//   <a href="/api/files/123" data-lightbox data-lightbox-name="foto.jpg">…<img/></a>

type Current = { src: string; name: string | null };

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
      const src = a.getAttribute("href");
      if (!src) return;
      e.preventDefault();
      setCurrent({ src, name: a.getAttribute("data-lightbox-name") });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Escape para cerrar + bloqueo del scroll de fondo mientras está abierto.
  React.useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCurrent(null); };
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

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.name ?? "Imagen"}
      onClick={() => setCurrent(null)}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-150"
    >
      {/* Botón de cerrar */}
      <button
        type="button"
        onClick={() => setCurrent(null)}
        aria-label="Cerrar"
        className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <X className="size-5" />
      </button>

      {/* La imagen: clic encima NO cierra (solo el fondo) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current.src}
        alt={current.name ?? ""}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain shadow-2xl animate-in zoom-in-95 duration-150"
      />
      {current.name ? (
        <span className="mt-3 max-w-[92vw] truncate text-sm text-white/70" onClick={(e) => e.stopPropagation()}>
          {current.name}
        </span>
      ) : null}
    </div>,
    document.body,
  );
}
