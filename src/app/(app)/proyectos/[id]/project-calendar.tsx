"use client";

import * as React from "react";
import { CalendarBoard } from "@/app/(app)/calendario/calendar-board";
import type { CalItem, TeamMember } from "@/app/(app)/calendario/my-calendar";

// X3 · Calendario del proyecto con el interruptor «Solo hitos y entregas»: oculta el día a
// día (citas, tareas) y deja los hitos del proyecto (inicio/entrega/entregables) y los
// rodajes — el calendario que le enseñarías al cliente en una llamada.
export function ProjectCalendar({
  items,
  onCreate,
  projectId,
  team,
}: {
  items: CalItem[];
  onCreate?: (fd: FormData) => Promise<void>;
  projectId: string;
  team: TeamMember[];
}) {
  const [solo, setSolo] = React.useState(false);
  const shown = solo ? items.filter((i) => i.kind === "milestone" || i.kind === "shoot") : items;
  return (
    <div className="flex h-full flex-col gap-2">
      <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
        <input type="checkbox" checked={solo} onChange={(e) => setSolo(e.target.checked)} className="accent-[#F47A20]" />
        🚩 Solo hitos y entregas
      </label>
      <div className="min-h-0 flex-1">
        <CalendarBoard items={shown} onCreate={onCreate} projectId={projectId} team={team} />
      </div>
    </div>
  );
}
