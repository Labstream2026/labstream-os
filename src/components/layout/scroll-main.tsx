"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Área principal con restauración de scroll por URL.
//
// Al cambiar de pestaña (TabsBar) y volver, o al recargar dentro de la misma sesión, el
// scroll regresa al punto donde estaba en esa URL. Las navegaciones NUEVAS (sin posición
// guardada) siguen empezando arriba, como siempre. Se guarda por URL completa (incluida la
// sub-pestaña ?tab=…) en sessionStorage: nada va al servidor y se limpia al cerrar la sesión.
export function ScrollMain({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLElement>(null);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const url = search ? `${pathname}?${search}` : pathname;
  const keyFor = (u: string) => `ui:scroll:${u}`;
  const urlRef = React.useRef(url);

  // Guarda la posición de la URL actual mientras se hace scroll (throttle por rAF).
  React.useEffect(() => {
    urlRef.current = url;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        try { sessionStorage.setItem(keyFor(urlRef.current), String(el.scrollTop)); } catch { /* noop */ }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [url]);

  // Restaura al cambiar de URL. Reintenta unos frames mientras el contenido alcanza altura
  // (los componentes de servidor pueden llegar en streaming).
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let saved = 0;
    try { saved = Number(sessionStorage.getItem(keyFor(url))) || 0; } catch { /* noop */ }
    if (saved <= 0) return; // navegación nueva o tope → deja el comportamiento normal (arriba)
    let raf = 0;
    let tries = 0;
    const attempt = () => {
      tries += 1;
      if (el.scrollHeight - el.clientHeight >= saved || tries > 20) {
        el.scrollTop = saved;
        return;
      }
      raf = requestAnimationFrame(attempt);
    };
    raf = requestAnimationFrame(attempt);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [url]);

  return <main ref={ref} className={className}>{children}</main>;
}
