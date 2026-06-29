"use client";

import * as React from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { routeMeta } from "@/lib/nav-meta";

// Barra de pestañas estilo Notion (solo escritorio). Vive en el layout, así que su estado
// persiste entre navegaciones. Modelo "una pestaña por RUTA":
//   • Cada pestaña recuerda su URL COMPLETA (incluida la sub-pestaña ?tab=…), para que al
//     volver a ella siga donde estabas (Equipos, Tareas…), no en "Resumen".
//   • Cambiar de sub-pestaña dentro de un proyecto actualiza la MISMA pestaña (no abre otra).
//   • Navegar a otra ruta reemplaza la pestaña activa (como un navegador).
//   • Cmd/Ctrl+clic o clic central sobre un enlace interno abre una pestaña nueva.
//   • El botón «+» abre Inicio en pestaña nueva.
// Se recuerdan en localStorage para reaperturas.

const LS_TABS = "ui:tabs";

// La IDENTIDAD de una pestaña es su RUTA (pathname sin query). Así, cambiar de sub-pestaña
// (?tab=) actualiza la misma pestaña en vez de abrir una nueva.
const pathOf = (url: string) => url.split("?")[0];

export function TabsBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const search = searchParams.toString();
  const curUrl = search ? `${pathname}?${search}` : pathname;

  const [tabs, setTabs] = React.useState<string[]>(() => [curUrl]);
  const [mounted, setMounted] = React.useState(false);

  // Refs espejo para leer el estado más reciente dentro de listeners/efectos.
  const tabsRef = React.useRef(tabs);
  React.useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  const lastUrlRef = React.useRef(curUrl);
  // Marca que la siguiente navegación debe abrir una pestaña nueva (no reemplazar).
  const forceNewTabRef = React.useRef(false);

  // Restaura pestañas guardadas al montar (evita desajustes de hidratación: el primer
  // render usa solo la URL actual, igual que el servidor).
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_TABS);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length && saved.every((x) => typeof x === "string")) {
          const curPath = pathOf(curUrl);
          const hasRoute = saved.some((u) => pathOf(u) === curPath);
          // Si la ruta actual ya estaba guardada, reflejamos su URL actual (con su sub-pestaña).
          setTabs(hasRoute ? saved.map((u) => (pathOf(u) === curPath ? curUrl : u)) : [...saved, curUrl]);
        }
      }
    } catch { /* ignora almacenamiento no disponible */ }
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcilia la lista cuando cambia la URL (ruta O sub-pestaña/query).
  React.useEffect(() => {
    if (curUrl === lastUrlRef.current) return;
    const prevUrl = lastUrlRef.current;
    lastUrlRef.current = curUrl;
    if (!mounted) return;

    setTabs((curr) => {
      const curPath = pathOf(curUrl);
      // ¿Ya hay una pestaña para esta RUTA? → actualiza su URL (recuerda la sub-pestaña) y pasa a activa.
      const sameRouteIdx = curr.findIndex((u) => pathOf(u) === curPath);
      if (sameRouteIdx >= 0) {
        if (curr[sameRouteIdx] === curUrl) return curr;
        const next = [...curr];
        next[sameRouteIdx] = curUrl;
        return next;
      }
      // Ruta nueva → pestaña nueva (si se forzó) o reemplaza la activa (comportamiento de navegador).
      const prevIdx = curr.findIndex((u) => pathOf(u) === pathOf(prevUrl));
      if (forceNewTabRef.current) {
        forceNewTabRef.current = false;
        const next = [...curr];
        next.splice(prevIdx >= 0 ? prevIdx + 1 : next.length, 0, curUrl);
        return next;
      }
      if (prevIdx >= 0) {
        const next = [...curr];
        next[prevIdx] = curUrl;
        return next;
      }
      return [...curr, curUrl];
    });
  }, [curUrl, mounted]);

  // Persiste las pestañas.
  React.useEffect(() => {
    if (!mounted) return;
    try { window.localStorage.setItem(LS_TABS, JSON.stringify(tabs)); } catch { /* ignora */ }
  }, [tabs, mounted]);

  // Cmd/Ctrl+clic o clic central sobre un enlace interno → pestaña nueva.
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      const isMiddle = e.type === "auxclick" && e.button === 1;
      const isModified = e.type === "click" && (e.metaKey || e.ctrlKey);
      if (!isMiddle && !isModified) return;
      const target = e.target as HTMLElement | null;
      const a = target?.closest("a");
      if (!a) return;
      if (a.hasAttribute("data-lightbox")) return; // las imágenes abren el visor, no una pestaña
      const tgt = a.getAttribute("target");
      if (tgt && tgt !== "_self") return;
      const href = a.getAttribute("href") || "";
      // Solo rutas internas de navegación (no API, anclas ni externos).
      if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/api/")) return;
      e.preventDefault();
      forceNewTabRef.current = true;
      router.push(href);
    };
    document.addEventListener("click", handler);
    document.addEventListener("auxclick", handler);
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("auxclick", handler);
    };
  }, [router]);

  const selectTab = (url: string) => {
    if (url !== curUrl) router.push(url);
  };

  const newTab = () => {
    forceNewTabRef.current = true;
    router.push("/");
  };

  const closeTab = (url: string) => {
    const curr = tabsRef.current;
    if (curr.length <= 1) return; // siempre queda al menos una
    const idx = curr.indexOf(url);
    const next = curr.filter((p) => p !== url);
    setTabs(next);
    if (pathOf(url) === pathname) {
      const fallback = next[Math.min(idx, next.length - 1)];
      if (fallback) router.push(fallback);
    }
  };

  if (tabs.length === 0) return null;

  // Vive DENTRO de la barra superior (misma fila que el botón de plegar), para ahorrar la
  // antigua fila propia de pestañas. Solo escritorio; ocupa el espacio libre del centro.
  return (
    <div className="hidden min-w-0 flex-1 items-center md:flex">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((url) => {
          const { emoji, label } = routeMeta(pathOf(url));
          const active = pathOf(url) === pathname;
          return (
            <div
              key={url}
              onClick={() => selectTab(url)}
              onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(url); } }}
              title={label}
              className={cn(
                "group flex h-7 max-w-[180px] shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md pl-2.5 pr-1.5 text-[13px] transition-colors",
                active
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <span className="text-sm leading-none">{emoji}</span>
              <span className="truncate">{label}</span>
              {tabs.length > 1 ? (
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => { e.stopPropagation(); closeTab(url); }}
                  aria-label={`Cerrar ${label}`}
                  className={cn(
                    "ml-0.5 flex size-5 items-center justify-center rounded text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground",
                    active ? "opacity-70" : "opacity-0 group-hover:opacity-70",
                  )}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={newTab}
        aria-label="Nueva pestaña"
        title="Nueva pestaña"
        className="ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
