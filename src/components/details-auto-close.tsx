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
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}
