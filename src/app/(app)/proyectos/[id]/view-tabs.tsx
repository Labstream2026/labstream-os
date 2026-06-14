"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Conmutador de vistas para el espacio de tareas (Tablero / Lista / Calendario).
// Los nodos de cada vista se renderizan en el servidor y se pasan como props;
// aquí solo se alterna cuál se muestra (estado de cliente, sin recargar la página).
export function ViewTabs({
  views,
  storageKey,
}: {
  views: { key: string; label: string; icon?: string; node: React.ReactNode }[];
  storageKey?: string;
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
              {v.icon ? <span className="mr-1.5">{v.icon}</span> : null}
              {v.label}
            </button>
          );
        })}
      </div>
      <div>{current?.node}</div>
    </div>
  );
}
