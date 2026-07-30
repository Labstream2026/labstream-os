"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// El `titleSlot` en su propia envoltura. `display: contents` la borra del layout —lo que pintó
// quien llama sigue siendo el hijo directo del flex—, pero la posición pasa a ser de un elemento
// de ESTE componente. Sin ella React avisaba «Each child in a list should have a unique key prop»
// señalando al elemento del llamador: venía de otro componente y caía en la lista de hijos de la
// fila. Es un aviso de desarrollo, no un fallo, pero salía ya en Mis tareas y saldría en cada
// pantalla nueva que pase un título.
function Titulo({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <div className="contents">{children}</div>;
}

// Conmutador de vistas para el espacio de tareas (Tablero / Lista / Calendario).
// Los nodos de cada vista se renderizan en el servidor y se pasan como props;
// aquí solo se alterna cuál se muestra (estado de cliente, sin recargar la página).
export function ViewTabs({
  views,
  storageKey,
  titleSlot,
  comoMenu = false,
}: {
  views: { key: string; label: string; icon?: React.ReactNode; node: React.ReactNode }[];
  storageKey?: string;
  // Si se pasa, se muestra a la izquierda EN EL MISMO renglón que las pestañas (las pestañas
  // se empujan a la derecha). Sirve para compactar: título + pestañas en una sola fila.
  titleSlot?: React.ReactNode;
  // Las vistas como UN desplegable que dice dónde estás, en vez de la fila de pastillas. Para
  // pantallas donde las pestañas se comen un renglón entero y solo se cambia de vista de vez en
  // cuando (el Inicio: cuatro pestañas de las que se usa una el 95 % de los días).
  comoMenu?: boolean;
}) {
  const [active, setActive] = useState(views[0]?.key);
  const menuRef = useRef<HTMLDetailsElement>(null);

  // La vista preferida se lee tras montar (evita mismatch de hidratación con SSR).
  useEffect(() => {
    if (!storageKey) return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved && views.some((v) => v.key === saved)) setActive(saved);
  }, [storageKey, views]);

  const current = views.find((v) => v.key === active) ?? views[0];

  const elegir = (key: string) => {
    setActive(key);
    if (storageKey) window.localStorage.setItem(storageKey, key);
    // A mano: DetailsAutoClose cubre Escape, el clic fuera y el envío de formularios, pero no un
    // botón de dentro que solo cambia estado de React — y `open` es estado del DOM, así que un
    // re-render no lo toca.
    if (menuRef.current) menuRef.current.open = false;
  };

  if (comoMenu) {
    return (
      <div className="space-y-4">
        <div className={cn("flex flex-wrap items-center gap-3", titleSlot && "justify-between")}>
          <Titulo>{titleSlot}</Titulo>
          <details ref={menuRef} data-autoclose className="relative shrink-0">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              {current?.icon ? <span className="[&_svg]:size-3.5">{current.icon}</span> : null}
              {current?.label}
              <ChevronDown className="size-3 opacity-70" />
            </summary>
            <div className="absolute right-0 z-30 mt-1 w-60 rounded-lg border border-border bg-popover p-1 shadow-lg">
              {views.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => elegir(v.key)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                    v.key === current?.key && "font-semibold text-primary",
                  )}
                >
                  {v.icon ? <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{v.icon}</span> : null}
                  {v.label}
                </button>
              ))}
            </div>
          </details>
        </div>
        <div>{current?.node}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={cn("flex flex-wrap items-center gap-3", titleSlot && "justify-between")}>
        {titleSlot ?? null}
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
        {views.map((v) => {
          const on = v.key === current?.key;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => {
                setActive(v.key);
                if (storageKey) window.localStorage.setItem(storageKey, v.key);
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                on
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {/* Acepta emoji (string) o un ícono del set propio: el svg se acota a 16px y se
                  alinea con la línea base del texto sin que cada llamador deba ajustarlo. */}
              {v.icon ? <span className="mr-1.5 [&_svg]:inline [&_svg]:size-4 [&_svg]:align-[-3px]">{v.icon}</span> : null}
              {v.label}
            </button>
          );
        })}
        </div>
      </div>
      <div>{current?.node}</div>
    </div>
  );
}
