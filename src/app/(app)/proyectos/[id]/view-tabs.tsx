"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Conmutador de vistas para el espacio de tareas (Tablero / Lista / Calendario).
// Los nodos de cada vista se renderizan en el servidor y se pasan como props;
// aquí solo se alterna cuál se muestra (estado de cliente, sin recargar la página).
export function ViewTabs({
  views,
  storageKey,
  titleSlot,
}: {
  views: { key: string; label: string; icon?: React.ReactNode; node: React.ReactNode }[];
  storageKey?: string;
  // Si se pasa, se muestra a la izquierda EN EL MISMO renglón que las pestañas (las pestañas
  // se empujan a la derecha). Sirve para compactar: título + pestañas en una sola fila.
  titleSlot?: React.ReactNode;
}) {
  const [active, setActive] = useState(views[0]?.key);

  // La vista preferida se lee tras montar (evita mismatch de hidratación con SSR).
  useEffect(() => {
    if (!storageKey) return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved && views.some((v) => v.key === saved)) setActive(saved);
  }, [storageKey, views]);

  const current = views.find((v) => v.key === active) ?? views[0];

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
