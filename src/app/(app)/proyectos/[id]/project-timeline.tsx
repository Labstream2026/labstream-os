"use client";

import * as React from "react";
import { UserAvatar } from "@/components/user-avatar";
import { TimelineGrid, type TLLane, type TLBar, type TLMilestone } from "@/components/timeline/timeline-grid";
import { type TimelineUnit, dayKey, minutesToHours } from "@/lib/timeline";
import { tone, type LabelRow } from "@/lib/colors";
import { TaskDetail } from "./task-detail";
import { type Task, type TeamMember } from "./task-shared";
import { setTaskDates } from "./actions";

// Tonos por defecto para las fases que no tienen color asignado (se reparten en orden).
const STAGE_TONES = ["indigo", "sky", "violet", "amber", "emerald", "rose", "cyan", "orange"];

type DeliverableLite = { id: string; name: string; dueDate: Date | string | null; status: string };

export function ProjectTimeline({
  projectId,
  tasks,
  stages,
  stageColors,
  deliverables,
  team,
  statuses,
  priorities,
  canEdit,
}: {
  projectId: string;
  tasks: Task[];
  stages: string[];
  stageColors: Record<string, string>;
  deliverables: DeliverableLite[];
  team: TeamMember[];
  statuses: LabelRow[];
  priorities: LabelRow[];
  canEdit: boolean;
}) {
  const [unit, setUnit] = React.useState<TimelineUnit>("week");
  const [selected, setSelected] = React.useState<Task | null>(null);
  const [, startTransition] = React.useTransition();

  React.useEffect(() => {
    const saved = localStorage.getItem("timeline-unit");
    if (saved === "day" || saved === "week" || saved === "month") setUnit(saved);
  }, []);
  function changeUnit(u: TimelineUnit) {
    setUnit(u);
    localStorage.setItem("timeline-unit", u);
  }

  const doneKeys = React.useMemo(() => new Set(statuses.filter((s) => s.isDone).map((s) => s.key)), [statuses]);

  const effectiveStages = stages.length ? stages : ["Tareas"];
  const stageHex = (stage: string, i: number) =>
    tone(stageColors[stage] ?? STAGE_TONES[i % STAGE_TONES.length]).hex;

  function onBarChange(taskId: string, dates: { startKey: string; endKey: string }) {
    const fd = new FormData();
    fd.set("startDate", dates.startKey);
    fd.set("dueDate", dates.endKey);
    startTransition(() => { void setTaskDates(taskId, projectId, fd); });
  }

  // Carril de hitos: rodajes (de tareas con shootDate) + entregas (deliverables con dueDate).
  const milestones: TLMilestone[] = [];
  for (const t of tasks) {
    const k = dayKey(t.shootDate ?? null);
    if (k) milestones.push({ id: `shoot-${t.id}`, dayKey: k, label: `Rodaje · ${t.title}`, emoji: "🎬", colorHex: tone("rose").hex, onClick: () => setSelected(t) });
  }
  for (const d of deliverables) {
    const k = dayKey(d.dueDate ?? null);
    if (k) milestones.push({ id: `deliv-${d.id}`, dayKey: k, label: `Entrega · ${d.name}`, emoji: "📦", colorHex: tone("emerald").hex });
  }

  // Un carril por fase, con las tareas que tienen fechas (inicio o entrega) como barras.
  const taskStage = (t: Task) => (t.stage && effectiveStages.includes(t.stage) ? t.stage : effectiveStages[0]);
  const lanes: TLLane[] = [];
  if (milestones.length) {
    lanes.push({ key: "__milestones", label: "Rodajes y entregas", milestones });
  }
  for (let i = 0; i < effectiveStages.length; i++) {
    const stage = effectiveStages[i];
    const hex = stageHex(stage, i);
    const bars: TLBar[] = tasks
      .filter((t) => taskStage(t) === stage && (t.startDate || t.dueDate))
      .map((t) => {
        const done = doneKeys.has(t.status);
        const total = t.checklist.length;
        const checked = t.checklist.filter((c) => c.done).length;
        const progress = done ? 100 : total ? Math.round((checked / total) * 100) : 0;
        const est = t.estimatedMinutes ?? 0;
        const logged = t.loggedMinutes ?? 0;
        const sublabel = est
          ? `${minutesToHours(logged)}/${minutesToHours(est)}h`
          : logged
            ? `${minutesToHours(logged)}h`
            : undefined;
        return {
          id: t.id,
          label: t.title,
          startKey: dayKey(t.startDate ?? null),
          endKey: dayKey(t.dueDate ?? null),
          colorHex: hex,
          progress,
          done,
          sublabel,
          editable: canEdit,
          badge: t.assignee ? <UserAvatar initials={t.assignee.initials} color={t.assignee.avatarColor} size="sm" /> : undefined,
          onClick: () => setSelected(t),
        } satisfies TLBar;
      });
    if (bars.length) lanes.push({ key: stage, label: stage, colorHex: hex, bars });
  }

  // Tareas sin ninguna fecha (ni inicio ni entrega) → se listan para poder programarlas.
  const undated = tasks.filter((t) => !t.startDate && !t.dueDate && !t.shootDate);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Cronograma del proyecto por fases. Arrastra una barra para mover fechas, tira de los bordes para alargarla, y haz clic para abrir la tarea.
      </p>

      <TimelineGrid
        lanes={lanes}
        unit={unit}
        onUnitChange={changeUnit}
        onBarChange={canEdit ? onBarChange : undefined}
        emptyHint="Ninguna tarea o entregable tiene fechas todavía. Asigna una fecha de inicio o entrega a tus tareas para verlas aquí."
      />

      {undated.length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {undated.length} tarea{undated.length === 1 ? "" : "s"} sin fechas — clic para programar
          </p>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t)}
                className="rounded-full border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
              >
                {t.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {selected ? (
        <TaskDetail
          task={selected}
          projectId={projectId}
          team={team}
          stages={effectiveStages}
          statuses={statuses}
          priorities={priorities}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
