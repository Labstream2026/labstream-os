"use client";

import { useEffect } from "react";

// ── Los menús <details data-autoclose>, gobernados desde UN solo sitio ──────────
// Cierra al pulsar fuera, con Escape y al enviar un formulario de dentro (el <details> nativo no
// se cierra solo). Y desde 2026-07 también los COLOCA: al abrirse, la caja del menú (el hijo
// position:absolute) se pasa a position:fixed con sus coordenadas reales. Eso arregla de golpe,
// en toda la app, los dos males del patrón:
//  1. La caja ya no la recorta ningún overflow-hidden ni la tapa la tarjeta siguiente (el menú
//     «…» de un archivo salía como una franja vacía cortada al borde de su tarjeta).
//  2. Si no hay sitio por abajo, la caja se abre hacia ARRIBA en vez de estirar el scroll.
// Se respeta la alineación y la dirección que cada menú traía por CSS: solo se voltea cuando no
// cabe. Al cerrarse se limpian los estilos en línea y su CSS vuelve a mandar.
// Límite conocido: un ancestro con transform/filter/backdrop-filter se vuelve el bloque
// contenedor de position:fixed y descolocaría la caja — por eso las barras del app no usan
// backdrop-blur (ver el comentario en barra-menu.tsx).
// Se monta una vez en el shell. Solo toca los <details data-autoclose> (menús), no los
// <details> acordeón (Resumen del proyecto, «¿Cómo funciona este disco?», …).
export function DetailsAutoClose() {
  useEffect(() => {
    const GAP = 4; // el mt-1 con el que las cajas se separan de su botón
    const AIRE = 8; // margen mínimo contra el borde del viewport

    // La caja del menú: el hijo directo (no summary) posicionado en absolute — o el que ya
    // está flotando con fixed (marcado con data-flotando), para poder soltarlo al cerrar.
    const cajaDe = (d: HTMLDetailsElement): HTMLElement | null => {
      for (const el of Array.from(d.children)) {
        if (!(el instanceof HTMLElement) || el.tagName === "SUMMARY") continue;
        if (el.dataset.flotando === "1") return el;
        if (getComputedStyle(el).position === "absolute") return el;
      }
      return null;
    };

    const soltar = (caja: HTMLElement) => {
      caja.style.position = "";
      caja.style.left = "";
      caja.style.right = "";
      caja.style.top = "";
      caja.style.bottom = "";
      caja.style.margin = "";
      caja.style.zIndex = "";
      caja.style.maxHeight = "";
      caja.style.overflowY = "";
      delete caja.dataset.flotando;
    };

    const colocar = (d: HTMLDetailsElement) => {
      const summary = d.querySelector(":scope > summary");
      const caja = cajaDe(d);
      if (!summary || !caja) return;
      const sr = summary.getBoundingClientRect();
      if (!sr.width && !sr.height) return; // el botón no está visible: nada que colocar
      // Dónde la puso su CSS (getBoundingClientRect ignora los recortes de overflow): de ahí
      // salen su alineación horizontal y su dirección preferida, que se conservan.
      const r0 = caja.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const preferiaAbajo = r0.top + r0.height / 2 >= sr.top + sr.height / 2;
      const cabeAbajo = sr.bottom + GAP + r0.height <= vh - AIRE;
      const cabeArriba = sr.top - GAP - r0.height >= AIRE;
      // Su dirección de siempre… salvo que ahí no quepa y en la contraria sí (o haya más aire).
      const abajo = preferiaAbajo
        ? cabeAbajo || (!cabeArriba && vh - sr.bottom >= sr.top)
        : !(cabeArriba || (!cabeAbajo && sr.top > vh - sr.bottom));

      caja.dataset.flotando = "1";
      caja.style.position = "fixed";
      caja.style.margin = "0";
      caja.style.zIndex = "80";
      caja.style.left = `${Math.min(Math.max(r0.left, AIRE), Math.max(AIRE, vw - r0.width - AIRE))}px`;
      caja.style.right = "auto";
      const disponible = abajo ? vh - (sr.bottom + GAP) - AIRE : sr.top - GAP - AIRE;
      if (abajo) {
        caja.style.top = `${sr.bottom + GAP}px`;
        caja.style.bottom = "auto";
      } else {
        caja.style.bottom = `${vh - sr.top + GAP}px`;
        caja.style.top = "auto";
      }
      // Menú más alto que el sitio que hay: se acota y hace scroll DENTRO, no en la página.
      if (r0.height > disponible) {
        caja.style.maxHeight = `${Math.max(disponible, 120)}px`;
        caja.style.overflowY = "auto";
      }
    };

    const onToggle = (e: Event) => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.hasAttribute("data-autoclose")) return;
      const caja = cajaDe(d);
      if (!caja) return;
      if (d.open) colocar(d);
      else soltar(caja);
    };

    // Con un menú abierto, el scroll (de la página O de un contenedor) y el resize lo
    // recolocan junto a su botón: soltar → dejar que el CSS lo ponga → volver a fijar.
    const recolocar = () => {
      document.querySelectorAll<HTMLDetailsElement>("details[open][data-autoclose]").forEach((d) => {
        const caja = cajaDe(d);
        if (caja?.dataset.flotando) {
          soltar(caja);
          colocar(d);
        }
      });
    };

    const closeExcept = (target?: Node | null) => {
      document.querySelectorAll<HTMLDetailsElement>("details[open][data-autoclose]").forEach((d) => {
        if (!target || !d.contains(target)) d.open = false;
      });
    };
    const onPointerDown = (e: PointerEvent) => closeExcept(e.target as Node);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeExcept(); };
    // Al ENVIAR un formulario de dentro del menú (p. ej. «Mover a» en un entregable) el menú
    // se cierra. Sin esto se quedaba abierto: la acción del servidor re-renderiza, pero el
    // `open` de un <details> es estado del DOM y React no lo toca. En captura, porque la
    // acción del servidor puede volver a pintar el formulario antes de que burbujee.
    const onSubmit = (e: Event) => {
      const dentro = (e.target as HTMLElement | null)?.closest?.("details[open][data-autoclose]");
      if (dentro) (dentro as HTMLDetailsElement).open = false;
    };
    // `toggle` no burbujea: en captura llega igual.
    document.addEventListener("toggle", onToggle, true);
    window.addEventListener("scroll", recolocar, true);
    window.addEventListener("resize", recolocar);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("toggle", onToggle, true);
      window.removeEventListener("scroll", recolocar, true);
      window.removeEventListener("resize", recolocar);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);
  return null;
}
