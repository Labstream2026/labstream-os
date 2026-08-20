"use client";

import * as React from "react";
import { CalendarBoard } from "@/app/(app)/calendario/calendar-board";
import { IconHito } from "@/components/icons";
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
        <IconHito className="size-3.5" />
        Solo hitos y entregas
      </label>
      {/* `asideStats`: «Próximo», las capas y las próximas entregas se van a una columna derecha
          y la vista principal gana todo el alto. La rama ya existía y lleva meses viva en la
          ficha del cliente; aquí simplemente no se pasaba. De paso el proyecto gana la lista de
          próximas entregas, que en esta pantalla no se mostraba.
          `pb-20`: los dos botones flotantes (chat y crear) se anclan abajo a la derecha y
          tapaban el final de la rejilla — justo donde caen viernes y sábado. */}
      <div className="min-h-0 flex-1 pb-20">
        <CalendarBoard items={shown} onCreate={onCreate} projectId={projectId} team={team} asideStats />
      </div>
    </div>
  );
}
