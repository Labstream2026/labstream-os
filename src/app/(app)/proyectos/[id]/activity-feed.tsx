"use client";

import { UserAvatar } from "@/components/user-avatar";

export type ActivityItem = {
  id: string;
  action: string;
  summary: string;
  createdAt: string; // ISO
  user: { name: string; initials: string | null; color: string | null } | null;
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

function fmt(iso: string): { abs: string; rel: string } {
  const d = new Date(iso);
  const abs = d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  let rel: string;
  if (min < 1) rel = "ahora";
  else if (min < 60) rel = `hace ${min} min`;
  else if (min < 1440) rel = `hace ${Math.round(min / 60)} h`;
  else rel = `hace ${Math.round(min / 1440)} d`;
  return { abs, rel };
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
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
          const { abs, rel } = fmt(a.createdAt);
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
                  <span className="font-medium">{a.user?.name ?? "Alguien"}</span>{" "}
                  <span className="text-muted-foreground">{a.summary}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground" title={abs}>
                  <span className="mr-1">{iconFor(a.action)}</span>
                  {abs} · {rel}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
