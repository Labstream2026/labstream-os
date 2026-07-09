"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw, Loader2 } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { IconTareas } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { setTaskStatus } from "./actions";

// Historial de tareas COMPLETADAS del proyecto: compacto, la más reciente arriba, con quién
// la cerró y de qué fase era. «Reabrir» la devuelve al primer estado abierto (por si se cerró
// por error); los permisos reales los valida la acción del servidor.
export type CompletedTaskItem = {
  id: string;
  title: string;
  completedAtIso: string | null;
  stage: string | null;
  assignee: { initials: string | null; avatarColor: string | null } | null;
};

const FMT = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

export function CompletedTasks({
  projectId,
  items,
  reopenKey,
  canReopen,
}: {
  projectId: string;
  items: CompletedTaskItem[];
  reopenKey: string; // primer estado NO terminado, al que vuelve una tarea reabierta
  canReopen: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const reopen = (id: string) => {
    setBusyId(id);
    start(async () => {
      await setTaskStatus(id, projectId, reopenKey);
      router.refresh();
    });
  };

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<IconTareas />}
        title="Aún no hay tareas completadas"
        description="Cuando el equipo termine tareas, quedarán guardadas aquí como historial."
      />
    );
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {items.map((t) => (
        <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
            <Check className="size-3" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-muted-foreground line-through">{t.title}</p>
            <p className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
              {t.completedAtIso ? <>terminada {FMT.format(new Date(t.completedAtIso))}</> : "terminada"}
              {t.stage ? <> · {t.stage}</> : null}
            </p>
          </div>
          {t.assignee ? <UserAvatar initials={t.assignee.initials} color={t.assignee.avatarColor} size="sm" /> : null}
          {canReopen ? (
            <button
              type="button"
              onClick={() => reopen(t.id)}
              disabled={pending && busyId === t.id}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              title="Devolverla a pendientes"
            >
              {pending && busyId === t.id ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
              Reabrir
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
