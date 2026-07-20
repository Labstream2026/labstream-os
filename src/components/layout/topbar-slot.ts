"use client";

import * as React from "react";

// Hueco de la barra superior para portales (identidad de página, personas).
// `useSyncExternalStore` en vez de useState+useEffect: en SSR/hidratación devuelve null
// (el server no pinta portales) y en el primer render de cliente ya entrega el nodo —
// sin setState dentro de un efecto (regla react-hooks/set-state-in-effect) ni parpadeo.
const subscribe = () => () => {};

export function useTopbarSlot(id: "topbar-page-slot" | "topbar-people-slot"): HTMLElement | null {
  return React.useSyncExternalStore(
    subscribe,
    // getElementById devuelve SIEMPRE la misma referencia para el mismo nodo → snapshot estable.
    () => document.getElementById(id),
    () => null,
  );
}
