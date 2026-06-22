"use client";

import { useEffect } from "react";
import { subscribeBrowserPush } from "@/lib/native-notify";

// Registra el service worker (public/sw.js) en el ámbito raíz. Necesario para que Chrome
// ofrezca "Instalar" la app. No renderiza nada.
export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js");
        // Si el usuario YA concedió el permiso de notificaciones, re-suscribimos el Web Push
        // en segundo plano (mantiene viva la suscripción en cada dispositivo/sesión sin volver
        // a pedir permiso). Si no lo ha concedido, no hacemos nada: lo activa desde la campanita.
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          await subscribeBrowserPush();
        }
      } catch {
        /* best-effort: el push nunca debe romper la carga de la app */
      }
    };
    // Esperamos a "load" para no competir con la carga inicial de la app.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
