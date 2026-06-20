"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { routeMeta } from "@/lib/nav-meta";

// Barra de pestañas estilo Notion (solo escritorio). Vive en el layout, así que
// su estado persiste entre navegaciones. Modelo "una pestaña por ruta":
//   • La pestaña activa es siempre la ruta actual (usePathname).
//   • Navegar normalmente reemplaza la pestaña activa (como un navegador) → no se
//     acumulan pestañas infinitas al moverse por el menú.
//   • Cmd/Ctrl+clic o clic central sobre un enlace interno abre una pestaña nueva.
//   • El botón «+» abre Inicio en pestaña nueva.
// Las pestañas se recuerdan en localStorage para reaperturas (útil en la app de
// escritorio).

const LS_TABS = "ui:tabs";

export function TabsBar() {
  const pathname = usePathname();
  const router = useRouter();

  const [tabs, setTabs] = React.useState<string[]>(() => [pathname]);
  const [mounted, setMounted] = React.useState(false);

  // Refs espejo para leer el estado más reciente dentro de listeners/efectos sin
  // recrearlos en cada cambio.
  const tabsRef = React.useRef(tabs);
  React.useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  const lastPathRef = React.useRef(pathname);
  // Marca que la siguiente navegación debe abrir una pestaña nueva (no reemplazar).
  const forceNewTabRef = React.useRef(false);

  // Restaura pestañas guardadas al montar (evita desajustes de hidratación: el
  // primer render usa solo la ruta actual, igual que el servidor).
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_TABS);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length && saved.every((x) => typeof x === "string")) {
          setTabs(saved.includes(pathname) ? saved : [...saved, pathname]);
        }
      }
    } catch { /* ignora almacenamiento no disponible */ }
    setMounted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcilia la lista de pestañas cuando cambia la ruta.
  React.useEffect(() => {
    if (pathname === lastPathRef.current) return;
    const prev = lastPathRef.current;
    lastPathRef.current = pathname;
    if (!mounted) return;

    setTabs((curr) => {
      if (curr.includes(pathname)) return curr; // ya abierta → pasa a ser la activa
      if (forceNewTabRef.current) {
        forceNewTabRef.current = false;
        const idx = curr.indexOf(prev);
        const next = [...curr];
        next.splice(idx >= 0 ? idx + 1 : next.length, 0, pathname);
        return next;
      }
      // Reemplaza la pestaña activa en su sitio (comportamiento de navegador).
      const idx = curr.indexOf(prev);
      if (idx >= 0) {
        const next = [...curr];
        next[idx] = pathname;
        return next;
      }
      return [...curr, pathname];
    });
  }, [pathname, mounted]);

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

  const selectTab = (path: string) => {
    if (path !== pathname) router.push(path);
  };

  const newTab = () => {
    forceNewTabRef.current = true;
    router.push("/");
  };

  const closeTab = (path: string) => {
    const curr = tabsRef.current;
    if (curr.length <= 1) return; // siempre queda al menos una
    const idx = curr.indexOf(path);
    const next = curr.filter((p) => p !== path);
    setTabs(next);
    if (path === pathname) {
      const fallback = next[Math.min(idx, next.length - 1)];
      if (fallback) router.push(fallback);
    }
  };

  if (tabs.length === 0) return null;

  return (
    <div className="hidden h-9 shrink-0 items-stretch border-b border-border bg-background px-2 md:flex">
      <div className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((path) => {
          const { emoji, label } = routeMeta(path);
          const active = path === pathname;
          return (
            <div
              key={path}
              onClick={() => selectTab(path)}
              onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closeTab(path); } }}
              title={label}
              className={cn(
                "group my-1 flex max-w-[180px] shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-md pl-2.5 pr-1.5 text-[13px] transition-colors",
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
                  onClick={(e) => { e.stopPropagation(); closeTab(path); }}
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
        className="my-1 ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
