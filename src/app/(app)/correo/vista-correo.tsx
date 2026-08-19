"use client";

import * as React from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Cómo se VE la bandeja: disposición del panel y densidad de las filas ────
// Preferencia del navegador (localStorage): es cosmética y personal — no amerita viaje al
// servidor ni migración. El primer render usa el valor por defecto y ajusta al montar.

export type VistaCorreo = { panel: "lado" | "abajo"; densidad: "comoda" | "compacta" };
const DEFECTO: VistaCorreo = { panel: "lado", densidad: "comoda" };
const CLAVE = "correo:vista";

const VistaCtx = React.createContext<{ vista: VistaCorreo; cambiar: (p: Partial<VistaCorreo>) => void }>({
  vista: DEFECTO,
  cambiar: () => {},
});

export function useVistaCorreo() {
  return React.useContext(VistaCtx);
}

export function VistaCorreoProvider({ children }: { children: React.ReactNode }) {
  const [vista, setVista] = React.useState<VistaCorreo>(DEFECTO);
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLAVE);
      if (raw) {
        const v = JSON.parse(raw) as Partial<VistaCorreo>;
        setVista({
          panel: v.panel === "abajo" ? "abajo" : "lado",
          densidad: v.densidad === "compacta" ? "compacta" : "comoda",
        });
      }
    } catch { /* preferencia corrupta: al defecto */ }
  }, []);
  const cambiar = React.useCallback((p: Partial<VistaCorreo>) => {
    setVista((prev) => {
      const next = { ...prev, ...p };
      try { window.localStorage.setItem(CLAVE, JSON.stringify(next)); } catch { /* privado/lleno: se pierde al recargar */ }
      return next;
    });
  }, []);
  return <VistaCtx.Provider value={{ vista, cambiar }}>{children}</VistaCtx.Provider>;
}

/** Los dos paneles (lista + lectura), acomodados según la preferencia: al lado (Gmail) o
 *  lista arriba / lectura abajo (monitores anchos y bajos). Solo aplica en xl. */
export function PanelesCorreo({ lista, lectura, hayHilo }: {
  lista: React.ReactNode;
  lectura: React.ReactNode;
  hayHilo: boolean;
}) {
  const { vista } = useVistaCorreo();
  const abajo = vista.panel === "abajo";
  return (
    <div className={cn("flex min-h-0 flex-1", abajo && "xl:flex-col")}>
      <div
        className={cn(
          "min-h-0 flex-col",
          abajo
            ? "xl:flex xl:h-[42%] xl:w-full xl:shrink-0 xl:border-b xl:border-border"
            : "xl:flex xl:w-[400px] xl:shrink-0 xl:border-r xl:border-border",
          hayHilo ? "hidden xl:flex" : "flex flex-1 xl:flex-none",
        )}
      >
        {lista}
      </div>
      <div className={cn("min-h-0 min-w-0 flex-1 flex-col", hayHilo ? "flex" : "hidden xl:flex")}>{lectura}</div>
    </div>
  );
}

/** El menú «Vista» de la cabecera: disposición y densidad en un solo sitio. */
export function MenuVista() {
  const { vista, cambiar } = useVistaCorreo();
  const [abierto, setAbierto] = React.useState(false);

  const Op = ({ activo, onPick, children }: { activo: boolean; onPick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={() => { onPick(); setAbierto(false); }}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-muted">
      <Check className={cn("size-3.5", activo ? "text-primary" : "invisible")} /> {children}
    </button>
  );

  return (
    <span className="relative">
      <button type="button" title="Vista: disposición y densidad" onClick={() => setAbierto((v) => !v)}
        className={cn("rounded-full p-2", abierto ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
        <SlidersHorizontal className="size-4" />
      </button>
      {abierto ? (
        <span className="absolute right-0 top-10 z-30 flex w-56 flex-col overflow-hidden rounded-lg border border-border bg-card py-1 shadow-xl">
          <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Panel de lectura</span>
          <Op activo={vista.panel === "lado"} onPick={() => cambiar({ panel: "lado" })}>Al lado (columnas)</Op>
          <Op activo={vista.panel === "abajo"} onPick={() => cambiar({ panel: "abajo" })}>Abajo (lista encima)</Op>
          <span className="mt-1 border-t border-border px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Densidad</span>
          <Op activo={vista.densidad === "comoda"} onPick={() => cambiar({ densidad: "comoda" })}>Cómoda (dos líneas)</Op>
          <Op activo={vista.densidad === "compacta"} onPick={() => cambiar({ densidad: "compacta" })}>Compacta (una línea)</Op>
        </span>
      ) : null}
    </span>
  );
}
