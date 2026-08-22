"use client";

import * as React from "react";
import { DECK_ENGINE } from "@/lib/proposals/deck-assets";

// Corre el motor del deck (puntos, progreso, revelado, navegación por rueda/teclado/flechas y
// autoplay de video). El motor es el engine.js CALCADO del referente; se ejecuta insertando un
// <script> real (innerHTML NO ejecuta scripts, por eso createElement + append). Limpia los
// puntos antes de correr para no duplicarlos si el efecto se re-ejecuta (StrictMode/dev).
export function DeckEngine() {
  React.useEffect(() => {
    const dots = document.getElementById("dots");
    if (dots) dots.innerHTML = "";
    const el = document.createElement("script");
    el.textContent = DECK_ENGINE;
    document.body.appendChild(el);
    return () => {
      el.remove();
    };
  }, []);
  return null;
}
