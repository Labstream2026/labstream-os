"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserAvatar } from "@/components/user-avatar";
import { TimelineGrid, type TLLane, type TLBar, type TLMilestone } from "@/components/timeline/timeline-grid";
import { type TimelineUnit } from "@/lib/timeline";
import { setProjectDates } from "../proyectos/[id]/actions";

export type GTTask = {
  id: string;
  title: string;
  startKey: string | null;
  endKey: string | null;
  done: boolean;
  progress: number;
  assignee: { initials: string | null; color: string | null } | null;
};
export type GTProject = {
  id: string;
  name: string;
  startKey: string | null;
  endKey: string | null;
  colorHex: string;
  progress: number;
  editable: boolean;
  tasks: GTTask[];
};
export type GTClient = { id: string; label: string; colorHex?: string; projects: GTProject[] };
export type GTMilestone = { id: string; dayKey: string; label: string; emoji: string; colorHex: string };

export function GlobalTimeline({
  clients,
  milestones,
  readOnly = false,
  fixedUnit,
  maxHeight,
  compact = false,
}: {
  clients: GTClient[];
  milestones: GTMilestone[];
  // Solo lectura (p. ej. el resumen del Inicio): no se puede arrastrar para reprogramar;
  // el clic en un proyecto lleva a su cronograma para editarlo allí.
  readOnly?: boolean;
  // Fija la vista en una unidad (día/semana/mes) y oculta el selector (resumen del Inicio).
  fixedUnit?: TimelineUnit;
  // Acota la altura con scroll propio (no crece hacia abajo sin fin).
  maxHeight?: string;
  // Vista general compacta (Inicio): una fila por proyecto (sin desplegar tareas), filas
  // más bajas y el nº de tareas como subetiqueta. Para "ver de un vistazo", no editar.
  compact?: boolean;
}) {
  const router = useRouter();
  const [unit, setUnit] = React.useState<TimelineUnit>(fixedUnit ?? "month");
  const [, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (fixedUnit) return; // en modo resumen la vista está fijada
    const saved = localStorage.getItem("timeline-unit");
    if (saved === "day" || saved === "week" || saved === "month") setUnit(saved);
  }, [fixedUnit]);
  function changeUnit(u: TimelineUnit) {
    setUnit(u);
    localStorage.setItem("timeline-unit", u);
  }

  function onBarChange(projectId: string, dates: { startKey: string; endKey: string }) {
    const fd = new FormData();
    fd.set("startDate", dates.startKey);
    fd.set("dueDate", dates.endKey);
    startTransition(() => { void setProjectDates(projectId, fd); });
  }

  const lanes: TLLane[] = [];
  if (milestones.length) {
    lanes.push({
      key: "__milestones",
      label: "Rodajes y entregas",
      milestones: milestones.map((m) => ({ ...m } satisfies TLMilestone)),
    });
  }
  for (const c of clients) {
    if (!c.projects.length) continue;
    lanes.push({
      key: c.id,
      label: c.label,
      colorHex: c.colorHex,
      bars: c.projects.map(
        (p) =>
          ({
            id: p.id,
            label: p.name,
            startKey: p.startKey,
            endKey: p.endKey,
            colorHex: p.colorHex,
            progress: p.progress,
            done: p.progress >= 100,
            editable: p.editable,
            // En modo compacto: nº de tareas como subetiqueta (las tareas no se despliegan).
            sublabel: compact && p.tasks.length ? `${p.tasks.length} t.` : undefined,
            // El clic en el nombre despliega las tareas; el clic en la barra abre el proyecto.
            onClick: () => router.push(`/proyectos/${p.id}?tab=cronograma`),
            // En compacto no incluimos las tareas hijas (vista general de un vistazo).
            children: compact ? [] : p.tasks.map(
              (t) =>
                ({
                  id: `${p.id}:${t.id}`,
                  label: t.title,
                  startKey: t.startKey,
                  endKey: t.endKey,
                  colorHex: p.colorHex,
                  progress: t.progress,
                  done: t.done,
                  editable: false,
                  badge: t.assignee ? <UserAvatar initials={t.assignee.initials} color={t.assignee.color} size="sm" /> : undefined,
                  onClick: () => router.push(`/proyectos/${p.id}?tab=cronograma`),
                }) satisfies TLBar,
            ),
          }) satisfies TLBar,
      ),
    });
  }

  return (
    <TimelineGrid
      lanes={lanes}
      unit={fixedUnit ?? unit}
      onUnitChange={changeUnit}
      onBarChange={readOnly ? undefined : onBarChange}
      lockUnit={!!fixedUnit}
      maxHeight={maxHeight}
      compact={compact}
      emptyHint="Ningún proyecto tiene fechas de inicio o entrega. Asígnalas en cada proyecto para verlas aquí."
    />
  );
}
