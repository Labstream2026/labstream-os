"use client";

import * as React from "react";
import { UserAvatar } from "@/components/user-avatar";
import { formatBogota, relativeFrom } from "@/lib/bogota-time";

export type ActivityItem = {
  id: string;
  action: string;
  summary: string;
  createdAt: string; // ISO
  user: { name: string; initials: string | null; color: string | null } | null;
  actorName?: string | null; // autor sin cuenta (cliente desde el portal)
};

// Icono por tipo de acción (prefijo antes del punto).
function iconFor(action: string): string {
  const k = action.split(".")[0];
  if (k === "task" || k === "checklist") return "✅";
  if (k === "deliverable") return "🎬";
  if (k === "file") return "📎";
  if (k === "member") return "👥";
  if (k === "project") return "🗂️";
  return "•";
}

// "ahora" del cliente: null en SSR y en el primer render (para casar con el servidor y
// evitar mismatch de hidratación), se rellena tras montar y se refresca cada minuto.
function useNow(): number | null {
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    const raf = requestAnimationFrame(tick); // primer valor tras pintar (no síncrono en el effect)
    const t = setInterval(tick, 60_000);
    return () => { cancelAnimationFrame(raf); clearInterval(t); };
  }, []);
  return now;
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const now = useNow();
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
        Aún no hay actividad registrada. Cada cambio (tareas, entregables, archivos, miembros) quedará aquí con su fecha y hora.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <p className="mb-3 text-sm text-muted-foreground">
        Historial de cambios del proyecto. Cada acción queda registrada con su autor, fecha y hora.
      </p>
      <ol className="relative space-y-0">
        {items.map((a) => {
          const abs = formatBogota(a.createdAt);
          const rel = now == null ? null : relativeFrom(a.createdAt, now);
          return (
            <li key={a.id} className="flex gap-3 border-b border-border/60 py-3 last:border-0">
              <div className="mt-0.5 shrink-0">
                {a.user ? (
                  <UserAvatar initials={a.user.initials} color={a.user.color} size="sm" />
                ) : (
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-sm">
                    {iconFor(a.action)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug">
                  <span className="font-medium">{a.user?.name ?? a.actorName ?? "Alguien"}</span>{" "}
                  <span className="text-muted-foreground">{a.summary}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground" title={abs}>
                  <span className="mr-1">{iconFor(a.action)}</span>
                  {abs}{rel ? ` · ${rel}` : ""}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
