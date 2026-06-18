"use client";

import { useEffect } from "react";

// Registra el service worker (public/sw.js) en el ámbito raíz. Necesario para que Chrome
// ofrezca "Instalar" la app. No renderiza nada.
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    // Esperamos a "load" para no competir con la carga inicial de la app.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
