"use client";

import { useEffect } from "react";

// Cierra los menús basados en <details data-autoclose> al hacer clic fuera o con
// Escape (el <details> nativo no se cierra solo). Se monta una vez en el shell.
// Solo afecta a los <details> marcados con data-autoclose (los menús desplegables),
// no a los <details> que son formularios/acordeones expandibles.
export function DetailsAutoClose() {
  useEffect(() => {
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
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, []);
  return null;
}
