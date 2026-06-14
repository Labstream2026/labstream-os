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
import { PRIORITY } from "@/lib/ui";
import { cn } from "@/lib/utils";
import {
  createTask,
  setTaskStatus,
  setTaskStage,
  setTaskShootDate,
  deleteTask,
  toggleChecklistItem,
  addChecklistItem,
} from "./actions";
import { type Task, type TeamMember, STATUS_OPTIONS, toDateInputValue } from "./task-shared";

export function TasksBoard({
  projectId,
  tasks,
  team,
  stages,
}: {
  projectId: string;
  tasks: Task[];
  team: TeamMember[];
  stages: string[];
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
    // optimista + persistir (queda registrado en el log de actividad).
    setItems((prev) => prev.map((t) => (t.id === task.id ? { ...t, stage: overId } : t)));
    setTaskStage(task.id, projectId, overId);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {cols.map((col) => (
          <Column
            key={col}
            stage={col}
            count={items.filter((t) => colFor(t) === col).length}
            projectId={projectId}
            team={team}
          >
            {items
              .filter((t) => colFor(t) === col)
              .map((t) => (
                <DraggableCard key={t.id} task={t} projectId={projectId} dimmed={t.id === activeId} />
              ))}
          </Column>
        ))}
      </div>

      {/* Ficha flotante mientras se arrastra */}
      <DragOverlay>
        {activeTask ? <CardContent task={activeTask} projectId={projectId} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  stage,
  count,
  projectId,
  team,
  children,
}: {
  stage: string;
  count: number;
  projectId: string;
  team: TeamMember[];
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div className="flex w-72 shrink-0 flex-col gap-2.5">
      <div className="flex items-center gap-2 px-1">
        <span className="text-sm font-semibold">{stage}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{count}</span>
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
          <select name="priority" defaultValue="MEDIA" className="rounded-md border border-input bg-background px-1.5 py-1 text-[11px]">
            {Object.entries(PRIORITY).map(([v, m]) => (
              <option key={v} value={v}>{m.label}</option>
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

function DraggableCard({ task, projectId, dimmed }: { task: Task; projectId: string; dimmed: boolean }) {
  const { setNodeRef, listeners, attributes, setActivatorNodeRef } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} className={cn(dimmed && "opacity-40")}>
      <CardContent task={task} projectId={projectId} handleRef={setActivatorNodeRef} handleProps={{ ...listeners, ...attributes }} />
    </div>
  );
}

function CardContent({
  task: t,
  projectId,
  handleRef,
  handleProps,
  overlay,
}: {
  task: Task;
  projectId: string;
  handleRef?: (el: HTMLElement | null) => void;
  handleProps?: Record<string, unknown>;
  overlay?: boolean;
}) {
  const prio = PRIORITY[t.priority] ?? PRIORITY.MEDIA;
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
        <p className="flex-1 text-sm font-medium leading-snug">{t.title}</p>
        {t.assignee ? <UserAvatar initials={t.assignee.initials} color={t.assignee.avatarColor} size="sm" /> : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
        <Badge className={cn("text-[10px]", prio.className)}>{prio.label}</Badge>
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
              options={STATUS_OPTIONS}
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
              <button className="px-1 text-xs text-muted-foreground hover:text-destructive" title="Eliminar">✕</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
