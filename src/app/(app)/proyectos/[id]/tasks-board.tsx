"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { StatusSelect } from "@/components/actions/status-select";
import { DateInput } from "@/components/actions/date-input";
import { ChecklistCheckbox } from "@/components/actions/checklist-checkbox";
import { cn } from "@/lib/utils";
import {
  createTask,
  setTaskStatus,
  setTaskStage,
  setTaskShootDate,
  deleteTask,
  toggleChecklistItem,
  addChecklistItem,
  addStage,
  renameStage,
  deleteStage,
  setStageColor,
} from "./actions";
import { type Task, type TeamMember, toDateInputValue } from "./task-shared";
import { TaskDetail } from "./task-detail";
import { formatShortDate } from "@/lib/ui";
import { TONES, tone, type LabelRow, labelOptions, labelMeta, defaultKey } from "@/lib/colors";

export function TasksBoard({
  projectId,
  tasks,
  team,
  stages,
  statuses,
  priorities,
  stageColors = {},
}: {
  projectId: string;
  tasks: Task[];
  team: TeamMember[];
  stages: string[];
  statuses: LabelRow[];
  priorities: LabelRow[];
  stageColors?: Record<string, string>;
}) {
  const cols = stages.length ? stages : ["Por hacer"];
  const colFor = React.useCallback(
    (t: Task) => (t.stage && cols.includes(t.stage) ? t.stage : cols[0]),
    [cols],
  );

  // Copia local para mover las fichas de forma optimista al arrastrar.
  const [items, setItems] = React.useState<Task[]>(tasks);
  React.useEffect(() => setItems(tasks), [tasks]);

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const activeTask = items.find((t) => t.id === activeId) ?? null;
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const detailTask = items.find((t) => t.id === detailId) ?? null;

  // Sensores: ratón/lápiz arrastra tras 6px; táctil tras mantener pulsado 200ms
  // (así el scroll del móvil sigue funcionando y no se arrastra sin querer).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId) return;
    const task = items.find((t) => t.id === String(e.active.id));
    if (!task || colFor(task) === overId) return;
    const prevStage = task.stage;
    // optimista + persistir; si la server action falla, se revierte la ficha.
    setItems((prev) => prev.map((t) => (t.id === task.id ? { ...t, stage: overId } : t)));
    setTaskStage(task.id, projectId, overId).catch(() => {
      setItems((prev) => prev.map((t) => (t.id === task.id ? { ...t, stage: prevStage } : t)));
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {cols.map((col) => (
          <Column
            key={col}
            stage={col}
            color={stageColors[col] ?? null}
            count={items.filter((t) => colFor(t) === col).length}
            projectId={projectId}
            team={team}
            priorities={priorities}
            canDelete={cols.length > 1}
          >
            {items
              .filter((t) => colFor(t) === col)
              .map((t) => (
                <DraggableCard key={t.id} task={t} projectId={projectId} statuses={statuses} priorities={priorities} dimmed={t.id === activeId} onOpen={() => setDetailId(t.id)} />
              ))}
          </Column>
        ))}

        {/* Añadir nueva fase/columna */}
        <form action={addStage.bind(null, projectId)} className="flex w-56 shrink-0 flex-col">
          <div className="rounded-lg border border-dashed border-border p-2">
            <input name="name" required placeholder="+ Nueva fase" className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:bg-background" />
            <button className="mt-1 w-full rounded-md bg-secondary px-2 py-1 text-xs font-medium hover:bg-secondary/80">Añadir columna</button>
          </div>
        </form>
      </div>

      {/* Ficha flotante mientras se arrastra */}
      <DragOverlay>
        {activeTask ? <CardContent task={activeTask} projectId={projectId} statuses={statuses} priorities={priorities} overlay /> : null}
      </DragOverlay>

      {detailTask ? (
        <TaskDetail task={detailTask} projectId={projectId} team={team} stages={cols} statuses={statuses} priorities={priorities} onClose={() => setDetailId(null)} />
      ) : null}
    </DndContext>
  );
}

function Column({
  stage,
  color,
  count,
  projectId,
  team,
  priorities,
  canDelete,
  children,
}: {
  stage: string;
  color: string | null;
  count: number;
  projectId: string;
  team: TeamMember[];
  priorities: LabelRow[];
  canDelete: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const t = color ? tone(color) : null;
  return (
    <div className="flex w-72 shrink-0 flex-col gap-2.5">
      <div className="group flex items-center gap-1.5 px-1">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: t ? t.hex : "#cbd5e1" }} />
        <input
          defaultValue={stage}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== stage) renameStage(projectId, stage, v); }}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none focus:rounded focus:bg-background focus:px-1"
        />
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{count}</span>
        <details data-autoclose className="relative">
          <summary className="cursor-pointer list-none px-1 text-xs text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100">⋯</summary>
          <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-border bg-popover p-2 shadow-lg">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">Color de la fase</p>
            <select
              defaultValue={color ?? ""}
              onChange={(e) => setStageColor(projectId, stage, e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
            >
              <option value="">Sin color</option>
              {TONES.map((to) => (<option key={to.key} value={to.key}>{to.label}</option>))}
            </select>
            {canDelete ? (
              <button
                onClick={() => { if (confirm(`¿Eliminar la fase «${stage}»? Sus tareas pasan a la primera fase.`)) deleteStage(projectId, stage); }}
                className="mt-2 w-full rounded-md px-2 py-1 text-left text-xs text-destructive hover:bg-muted"
              >
                Eliminar fase
              </button>
            ) : null}
          </div>
        </details>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-col gap-2.5 rounded-lg p-1 transition-colors",
          isOver ? "bg-primary/5 ring-2 ring-primary/40" : "",
        )}
      >
        {count === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            Suelta una ficha aquí
          </p>
        ) : null}
        {children}
      </div>

      {/* Añadir tarea en esta fase */}
      <form action={createTask.bind(null, projectId)} className="rounded-lg border border-dashed border-border bg-card/50 p-2">
        <input type="hidden" name="stage" value={stage} />
        <input
          name="title"
          required
          placeholder="+ Añadir tarea"
          className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:bg-background"
        />
        <div className="mt-1 flex items-center gap-1.5">
          <select name="priority" defaultValue={defaultKey(priorities)} className="rounded-md border border-input bg-background px-1.5 py-1 text-[11px]">
            {priorities.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
          <select name="assigneeId" defaultValue="" className="min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 py-1 text-[11px]">
            <option value="">Sin asignar</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90">
            Añadir
          </button>
        </div>
      </form>
    </div>
  );
}

function DraggableCard({ task, projectId, statuses, priorities, dimmed, onOpen }: { task: Task; projectId: string; statuses: LabelRow[]; priorities: LabelRow[]; dimmed: boolean; onOpen: () => void }) {
  const { setNodeRef, listeners, attributes, setActivatorNodeRef } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} className={cn(dimmed && "opacity-40")}>
      <CardContent task={task} projectId={projectId} statuses={statuses} priorities={priorities} handleRef={setActivatorNodeRef} handleProps={{ ...listeners, ...attributes }} onOpen={onOpen} />
    </div>
  );
}

function CardContent({
  task: t,
  projectId,
  statuses,
  priorities,
  handleRef,
  handleProps,
  overlay,
  onOpen,
}: {
  task: Task;
  projectId: string;
  statuses: LabelRow[];
  priorities: LabelRow[];
  handleRef?: (el: HTMLElement | null) => void;
  handleProps?: Record<string, unknown>;
  overlay?: boolean;
  onOpen?: () => void;
}) {
  const prio = labelMeta(priorities, t.priority);
  const done = t.checklist.filter((c) => c.done).length;
  return (
    <div className={cn("rounded-lg border border-border bg-card p-3 shadow-sm", overlay && "w-72 rotate-2 shadow-lg")}>
      <div className="flex items-start gap-2">
        {/* Asa de arrastre: solo aquí se inicia el drag (el resto sigue interactivo) */}
        <button
          type="button"
          ref={handleRef}
          {...handleProps}
          aria-label="Arrastrar"
          className="-ml-1 mt-0.5 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        {onOpen ? (
          <button type="button" onClick={onOpen} className="flex-1 text-left text-sm font-medium leading-snug hover:underline">
            {t.title}
          </button>
        ) : (
          <p className="flex-1 text-sm font-medium leading-snug">{t.title}</p>
        )}
        {t.assignee ? <UserAvatar initials={t.assignee.initials} color={t.assignee.avatarColor} size="sm" /> : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
        <Badge className={cn("text-[10px]", prio.chip)}>{prio.label}</Badge>
        {t.dueDate ? (
          <span className="text-[11px] text-muted-foreground">📅 {formatShortDate(t.dueDate)}</span>
        ) : null}
        {t.checklist.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">✓ {done}/{t.checklist.length}</span>
        ) : null}
      </div>

      {overlay ? null : (
        <>
          {t.checklist.length > 0 ? (
            <div className="mt-2 space-y-1 border-t border-border pt-2">
              {t.checklist.map((c) => (
                <ChecklistCheckbox
                  key={c.id}
                  checked={c.done}
                  label={c.label}
                  action={toggleChecklistItem.bind(null, c.id, projectId)}
                />
              ))}
            </div>
          ) : null}

          <form action={addChecklistItem.bind(null, t.id, projectId)} className="mt-2">
            <input
              name="label"
              placeholder="+ ítem de checklist"
              className="w-full rounded border border-input bg-background px-2 py-1 text-[11px] outline-none focus:ring-1 focus:ring-ring"
            />
          </form>

          <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
            <StatusSelect
              value={t.status}
              options={labelOptions(statuses)}
              action={setTaskStatus.bind(null, t.id, projectId)}
              className="flex-1"
            />
            <DateInput
              name="shootDate"
              value={toDateInputValue(t.shootDate)}
              action={setTaskShootDate.bind(null, t.id, projectId)}
              title="Fecha de rodaje"
            />
            <form action={deleteTask.bind(null, t.id, projectId)}>
              <button
                className="px-1 text-xs text-muted-foreground hover:text-destructive"
                title="Eliminar"
                onClick={(e) => { if (!confirm(`¿Eliminar la tarea «${t.title}»?`)) e.preventDefault(); }}
              >✕</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
