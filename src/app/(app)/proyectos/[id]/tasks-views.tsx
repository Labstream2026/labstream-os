"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import type { LabelRow } from "@/lib/colors";
import { type Task, type TeamMember } from "./task-shared";
import { TasksBoard } from "./tasks-board";
import { TasksList } from "./tasks-list";
import { ViewTabs } from "./view-tabs";
import { IconTablero, IconLista } from "@/components/icons";

// ── Vistas de tareas del proyecto ──
// T1 · Filtro por PERSONA: chips de avatares sobre el tablero/lista (con «Sin responsable»
// como chip propio — las tareas huérfanas dejan de esconderse). T2 · Vista «Por persona»:
// carriles de lectura rápida para repartir carga en reunión.

export function TasksViews({
  projectId,
  tasks,
  team,
  stages,
  stageColors,
  statuses,
  priorities,
  isAdmin,
}: {
  projectId: string;
  tasks: Task[];
  team: TeamMember[];
  stages: string[];
  stageColors: Record<string, string>;
  statuses: LabelRow[];
  priorities: LabelRow[];
  isAdmin: boolean;
}) {
  // null = todas · "none" = sin responsable · id = esa persona
  const [who, setWho] = React.useState<string | null>(null);

  const countBy = new Map<string, number>();
  let orphans = 0;
  for (const t of tasks) {
    if (t.assigneeId) countBy.set(t.assigneeId, (countBy.get(t.assigneeId) ?? 0) + 1);
    else orphans++;
  }
  // Solo personas CON tareas (el equipo completo ya vive en cada tarjeta al asignar).
  const people = team.filter((m) => (countBy.get(m.id) ?? 0) > 0);

  const filtered =
    who === null ? tasks : who === "none" ? tasks.filter((t) => !t.assigneeId) : tasks.filter((t) => t.assigneeId === who);

  const chip = (active: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
      active ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
    );

  return (
    <div className="space-y-3">
      {/* T1 · Chips de personas (solo si hay más de una persona con tareas u huérfanas) */}
      {people.length > 1 || orphans > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setWho(null)} className={chip(who === null)}>
            Todas · {tasks.length}
          </button>
          {people.map((m) => (
            <button key={m.id} type="button" onClick={() => setWho(who === m.id ? null : m.id)} className={chip(who === m.id)} title={m.name}>
              <UserAvatar initials={m.initials} name={m.name} color={m.avatarColor} size="sm" />
              {countBy.get(m.id)}
            </button>
          ))}
          {orphans > 0 ? (
            <button type="button" onClick={() => setWho(who === "none" ? null : "none")} className={chip(who === "none")} title="Tareas sin responsable">
              👻 Sin responsable · {orphans}
            </button>
          ) : null}
        </div>
      ) : null}

      <ViewTabs
        storageKey="tareas-view"
        views={[
          {
            key: "tablero",
            label: "Tablero",
            icon: <IconTablero />,
            node: <TasksBoard projectId={projectId} team={team} stages={stages} stageColors={stageColors} tasks={filtered} statuses={statuses} priorities={priorities} isAdmin={isAdmin} />,
          },
          {
            key: "lista",
            label: "Lista",
            icon: <IconLista />,
            node: <TasksList projectId={projectId} team={team} stages={stages} tasks={filtered} statuses={statuses} priorities={priorities} isAdmin={isAdmin} />,
          },
          {
            key: "personas",
            label: "Por persona",
            icon: <Users className="size-3.5" />,
            // T2: los carriles muestran SIEMPRE todas las tareas (son el reparto completo).
            node: <PeopleLanes tasks={tasks} team={team} priorities={priorities} />,
          },
        ]}
      />
    </div>
  );
}

// T2 · Carriles: una fila por persona con sus tareas pendientes ordenadas por fecha. Vista de
// LECTURA (repartir carga se hace en la tarjeta de cada tarea): quién está saturado, quién libre.
function PeopleLanes({ tasks, team, priorities }: { tasks: Task[]; team: TeamMember[]; priorities: LabelRow[] }) {
  const now = Date.now();
  const rows: { member: TeamMember | null; items: Task[] }[] = [];
  for (const m of team) {
    const items = tasks.filter((t) => t.assigneeId === m.id);
    if (items.length) rows.push({ member: m, items });
  }
  const orphans = tasks.filter((t) => !t.assigneeId);
  if (orphans.length) rows.push({ member: null, items: orphans });
  rows.sort((a, b) => b.items.length - a.items.length);

  const dueMs = (t: Task) => (t.dueDate ? new Date(t.dueDate).getTime() : Number.POSITIVE_INFINITY);
  const hours = (items: Task[]) => {
    const min = items.reduce((n, t) => n + (t.estimatedMinutes ?? 0), 0);
    return min ? `${Math.round(min / 60)} h estimadas` : null;
  };
  const prioDot = (p: string) => {
    const key = p.toUpperCase();
    if (key === "ALTA" || key === "URGENTE") return "bg-red-500";
    if (key === "MEDIA") return "bg-amber-500";
    return "bg-border";
  };
  void priorities;

  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">No hay tareas pendientes que repartir.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.member?.id ?? `orphans-${i}`} className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            {r.member ? (
              <>
                <UserAvatar initials={r.member.initials} name={r.member.name} color={r.member.avatarColor} size="sm" />
                <span className="text-sm font-semibold">{r.member.name}</span>
              </>
            ) : (
              <span className="text-sm font-semibold">👻 Sin responsable</span>
            )}
            <span className="text-xs text-muted-foreground">· {r.items.length} tarea{r.items.length === 1 ? "" : "s"}</span>
            {hours(r.items) ? <span className="ml-auto text-xs text-muted-foreground">{hours(r.items)}</span> : null}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[...r.items]
              .sort((a, b) => dueMs(a) - dueMs(b))
              .map((t) => {
                const due = t.dueDate ? new Date(t.dueDate) : null;
                const late = due ? due.getTime() < now - 43_200_000 : false;
                return (
                  <div key={t.id} className="w-52 shrink-0 rounded-lg border border-border bg-background px-2.5 py-2">
                    <p className="flex items-start gap-1.5 text-xs font-medium leading-snug">
                      <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", prioDot(t.priority))} />
                      <span className="line-clamp-2">{t.title}</span>
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                      {t.stage ? <span className="truncate">{t.stage}</span> : null}
                      {due ? (
                        <span className={cn("ml-auto shrink-0", late && "font-bold text-red-600 dark:text-red-400")}>
                          {due.toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                        </span>
                      ) : (
                        <span className="ml-auto shrink-0">sin fecha</span>
                      )}
                    </p>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
