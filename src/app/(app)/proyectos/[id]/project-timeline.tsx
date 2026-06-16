"use client";

import * as React from "react";
import { UserAvatar } from "@/components/user-avatar";
import { TimelineGrid, type TLLane, type TLBar, type TLMilestone } from "@/components/timeline/timeline-grid";
import { type TimelineUnit, dayKey, minutesToHours, taskLifeSpan, minMaxKeys } from "@/lib/timeline";
import { tone, type LabelRow } from "@/lib/colors";
import { cn } from "@/lib/utils";
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
  projectStart,
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
  projectStart?: Date | string | null;
  projectEnd?: Date | string | null;
}) {
  const [unit, setUnit] = React.useState<TimelineUnit>("week");
  const [group, setGroup] = React.useState<"task" | "stage">("task");
  const [selected, setSelected] = React.useState<Task | null>(null);
  const [, startTransition] = React.useTransition();

  React.useEffect(() => {
    const u = localStorage.getItem("timeline-unit");
    if (u === "day" || u === "week" || u === "month") setUnit(u);
    const g = localStorage.getItem("timeline-group");
    if (g === "task" || g === "stage") setGroup(g);
  }, []);
  function changeUnit(u: TimelineUnit) {
    setUnit(u);
    localStorage.setItem("timeline-unit", u);
  }
  function changeGroup(g: "task" | "stage") {
    setGroup(g);
    localStorage.setItem("timeline-group", g);
  }

  const doneKeys = React.useMemo(() => new Set(statuses.filter((s) => s.isDone).map((s) => s.key)), [statuses]);
  const effectiveStages = stages.length ? stages : ["Tareas"];
  const stageHex = (stage: string, i: number) => tone(stageColors[stage] ?? STAGE_TONES[i % STAGE_TONES.length]).hex;
  const stageIndex = (stage: string) => Math.max(0, effectiveStages.indexOf(stage));
  const taskStage = (t: Task) => (t.stage && effectiveStages.includes(t.stage) ? t.stage : effectiveStages[0]);

  // Rango del proyecto para rellenar barras continuas: fechas propias, o si no, el
  // mínimo/máximo de todas las fechas de tareas y entregas.
  const allKeys = [
    ...tasks.flatMap((t) => [dayKey(t.startDate ?? null), dayKey(t.dueDate ?? null)]),
    ...deliverables.map((d) => dayKey(d.dueDate ?? null)),
  ];
  const { min: derivedStart } = minMaxKeys(allKeys);
  const projStartKey = dayKey(projectStart) ?? derivedStart;

  function onBarChange(taskId: string, dates: { startKey: string; endKey: string }) {
    const fd = new FormData();
    fd.set("startDate", dates.startKey);
    fd.set("dueDate", dates.endKey);
    startTransition(() => { void setTaskDates(taskId, projectId, fd); });
  }

  // Convierte una tarea en una barra continua del Gantt. Cuenta desde su creación
  // (o su inicio) hasta su entrega/finalización/hoy, así toda tarea aparece y se ve avanzar.
  function toBar(t: Task): TLBar | null {
    const { startKey, endKey } = taskLifeSpan({
      startDate: t.startDate ?? null,
      dueDate: t.dueDate ?? null,
      createdAt: t.createdAt ?? null,
      completedAt: t.completedAt ?? null,
      fallbackStart: projStartKey,
    });
    if (!startKey && !endKey) return null;
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
    const stage = taskStage(t);
    return {
      id: t.id,
      label: t.title,
      startKey,
      endKey,
      colorHex: stageHex(stage, stageIndex(stage)),
      progress,
      done,
      sublabel,
      editable: canEdit,
      badge: t.assignee ? <UserAvatar initials={t.assignee.initials} color={t.assignee.avatarColor} size="sm" /> : undefined,
      onClick: () => setSelected(t),
    } satisfies TLBar;
  }

  // Carril de hitos: rodajes (tareas con shootDate) + entregas (deliverables con dueDate).
  const milestones: TLMilestone[] = [];
  for (const t of tasks) {
    const k = dayKey(t.shootDate ?? null);
    if (k) milestones.push({ id: `shoot-${t.id}`, dayKey: k, label: `Rodaje · ${t.title}`, emoji: "🎬", colorHex: tone("rose").hex, onClick: () => setSelected(t) });
  }
  for (const d of deliverables) {
    const k = dayKey(d.dueDate ?? null);
    if (k) milestones.push({ id: `deliv-${d.id}`, dayKey: k, label: `Entrega · ${d.name}`, emoji: "📦", colorHex: tone("emerald").hex });
  }

  const lanes: TLLane[] = [];
  if (milestones.length) lanes.push({ key: "__milestones", label: "Rodajes y entregas", milestones });

  if (group === "stage") {
    // Una fila por fase de producción.
    for (let i = 0; i < effectiveStages.length; i++) {
      const stage = effectiveStages[i];
      const bars = tasks.filter((t) => taskStage(t) === stage).map(toBar).filter(Boolean) as TLBar[];
      if (bars.length) lanes.push({ key: stage, label: stage, colorHex: stageHex(stage, i), bars });
    }
  } else {
    // Una fila por tarea (lista plana, estilo ClickUp).
    const bars = tasks.map(toBar).filter(Boolean) as TLBar[];
    if (bars.length) lanes.push({ key: "__tasks", label: "Tareas", bars });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Cronograma del proyecto. Arrastra una barra para mover fechas, tira de los bordes para alargarla y haz clic para abrir la tarea.
        </p>
        <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
          {([["task", "Por tarea"], ["stage", "Por fase"]] as const).map(([g, label]) => (
            <button
              key={g}
              type="button"
              onClick={() => changeGroup(g)}
              className={cn(
                "px-3 py-1.5 font-medium transition-colors",
                group === g ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <TimelineGrid
        lanes={lanes}
        unit={unit}
        onUnitChange={changeUnit}
        onBarChange={canEdit ? onBarChange : undefined}
        emptyHint="Ninguna tarea o entregable tiene fechas todavía. Asigna una fecha de inicio o entrega a tus tareas para verlas aquí."
      />

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
