"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Home } from "lucide-react";

// ── Barra de navegación de la APP INSTALADA (PWA de escritorio) ──
// Cuando Labstream corre instalada (Mac/Windows, display-mode: standalone) no hay barra del
// navegador: una página sin menú propio (portal de revisión, enlaces públicos) se vuelve un
// callejón sin salida. Esta barra fina vive en el layout RAÍZ y aparece SOLO en ese modo —
// la media query de globals.css (.pwa-nav / --pwa-nav-h) la enciende sin JS ni parpadeo —
// con atrás / adelante / inicio siempre a mano. En el navegador normal y en el móvil no
// existe (allí ya hay chrome del navegador o barra inferior propia).

// API de Navegación (Chrome/Edge, justo los navegadores que instalan PWA de escritorio):
// dice si HAY historial hacia atrás/adelante para atenuar los botones y para convertir
// «atrás» sin historial en «ir al inicio» (el rescate del callejón sin salida). En Safari
// no existe → botones siempre activos; atrás sin historial simplemente no hace nada.
type NavApi = {
  canGoBack: boolean;
  canGoForward: boolean;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
};

function navApi(): NavApi | undefined {
  return (window as { navigation?: NavApi }).navigation;
}

export function StandaloneNav() {
  const router = useRouter();
  const [can, setCan] = React.useState({ back: true, forward: true });
  const [title, setTitle] = React.useState("");

  React.useEffect(() => {
    const nav = navApi();
    if (!nav) return;
    const update = () => setCan({ back: nav.canGoBack, forward: nav.canGoForward });
    update();
    nav.addEventListener("currententrychange", update);
    return () => nav.removeEventListener("currententrychange", update);
  }, []);

  // Título vivo de la pestaña (Next lo actualiza en cada navegación); sirve de ubicación.
  React.useEffect(() => {
    const el = document.querySelector("title");
    const update = () => setTitle(document.title);
    update();
    if (!el) return;
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true });
    return () => mo.disconnect();
  }, []);

  const goBack = () => {
    const nav = navApi();
    // Sin historial (el enlace abrió ventana nueva): rescate → al inicio de la app.
    if (nav && !nav.canGoBack) router.push("/");
    else router.back();
  };

  return (
    <div className="pwa-nav fixed inset-x-0 top-0 z-50 h-10 items-center gap-1 border-b border-border bg-background px-2 print:hidden">
      <button
        type="button"
        onClick={goBack}
        aria-label="Atrás"
        title={can.back ? "Atrás" : "Ir al inicio"}
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => router.forward()}
        aria-label="Adelante"
        title="Adelante"
        disabled={!can.forward}
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
      >
        <ArrowRight className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => router.push("/")}
        aria-label="Inicio"
        title="Inicio"
        className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Home className="size-4" />
      </button>
      <span className="ml-2 truncate text-xs text-muted-foreground">{title}</span>
    </div>
  );
}
