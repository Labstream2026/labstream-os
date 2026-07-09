"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Search, CalendarClock, AlertTriangle, List, Users } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { EntityEmoji } from "@/components/icons/marks";
import { cn } from "@/lib/utils";
import { setTaskAssignee, setTaskDueDate, setTaskDueTime } from "@/app/(app)/proyectos/[id]/actions";

// Compilado de tareas del equipo (pestaña de Inicio): todas las tareas abiertas agrupadas por
// responsable, con reasignación y cambio de fecha de entrega EN LÍNEA y optimista. Reusa las
// mismas server actions que el detalle de tarea (setTaskAssignee añade al nuevo al proyecto y
// notifica; setTaskDueDate avisa al responsable). Tras cada acción, router.refresh() reconcilia.

export type TeamTaskMember = { id: string; name: string; initials: string | null; color: string | null };
export type TeamTask = {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  projectEmoji: string | null;
  assigneeId: string | null;
  dueDate: string | null; // "YYYY-MM-DD" o null
  dueTime: string | null; // "HH:mm" o null
  statusLabel: string;
  statusClass: string;
};

const UNASSIGNED = "__none";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const todayStr = () => new Date().toISOString().slice(0, 10);

// Vista del tablero: "list" (acordeón por persona, la de siempre) o "person" (columnas por persona).
// La preferencia vive en localStorage y se lee con useSyncExternalStore: en SSR/hidratación se usa
// el valor por defecto y React re-sincroniza al montar — sin setState dentro de un efecto.
type BoardView = "list" | "person";
const VIEW_KEY = "labstream:team-tasks-view";
const VIEWS: { key: BoardView; label: string; icon: React.ReactNode }[] = [
  { key: "list", label: "Lista", icon: <List className="size-4" /> },
  { key: "person", label: "Por persona", icon: <Users className="size-4" /> },
];
let viewSubs: (() => void)[] = [];
const subscribeView = (cb: () => void) => {
  viewSubs.push(cb);
  return () => {
    viewSubs = viewSubs.filter((l) => l !== cb);
  };
};
const readView = (): BoardView => {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "person" ? "person" : "list";
  } catch {
    return "list";
  }
};
const saveView = (v: BoardView) => {
  try {
    window.localStorage.setItem(VIEW_KEY, v);
  } catch {
    // sin almacenamiento (modo privado): el cambio aplica solo a esta visita
  }
  viewSubs.forEach((l) => l());
};

export function TeamTasksBoard({
  members,
  tasks: initial,
  canReassign,
  canEditDates,
}: {
  members: TeamTaskMember[];
  tasks: TeamTask[];
  canReassign: boolean;
  canEditDates: boolean;
}) {
  const router = useRouter();
  const [tasks, setTasks] = React.useState(initial);
  React.useEffect(() => setTasks(initial), [initial]);
  const [q, setQ] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<Set<string>>(new Set());
  // Por defecto cada persona aparece RETRAÍDA; el usuario despliega a quien quiere ver.
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const view = React.useSyncExternalStore(subscribeView, readView, () => "list" as BoardView);
  const [, startTransition] = React.useTransition();

  const setBusyFor = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // Acción optimista genérica: aplica el cambio local, llama al servidor y revierte si falla.
  const run = (taskId: string, optimistic: (t: TeamTask) => TeamTask, server: () => Promise<unknown>) => {
    const prev = tasks;
    setError(null);
    setTasks((ts) => ts.map((t) => (t.id === taskId ? optimistic(t) : t)));
    setBusyFor(taskId, true);
    startTransition(async () => {
      try {
        await server();
        router.refresh();
      } catch (e) {
        setTasks(prev); // revertir
        setError(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
      } finally {
        setBusyFor(taskId, false);
      }
    });
  };

  const reassign = (t: TeamTask, newId: string) =>
    run(t.id, (x) => ({ ...x, assigneeId: newId || null }), () => setTaskAssignee(t.id, t.projectId ?? "", newId));

  const changeDue = (t: TeamTask, value: string) =>
    run(t.id, (x) => ({ ...x, dueDate: value || null }), () => {
      const fd = new FormData();
      fd.set("dueDate", value);
      return setTaskDueDate(t.id, t.projectId ?? "", fd);
    });

  const changeDueTime = (t: TeamTask, value: string) =>
    run(t.id, (x) => ({ ...x, dueTime: value || null }), () => {
      const fd = new FormData();
      fd.set("dueTime", value);
      return setTaskDueTime(t.id, t.projectId ?? "", fd);
    });

  const term = norm(q.trim());
  const shown = term
    ? tasks.filter((t) => norm(t.title).includes(term) || norm(t.projectName ?? "").includes(term))
    : tasks;

  // Agrupar por responsable; incluye un grupo "Sin asignar" si hay tareas sueltas.
  const groups: { member: TeamTaskMember | null; key: string; items: TeamTask[] }[] = members.map((m) => ({
    member: m,
    key: m.id,
    items: shown.filter((t) => t.assigneeId === m.id),
  }));
  const unassigned = shown.filter((t) => !t.assigneeId);
  if (unassigned.length) groups.unshift({ member: null, key: UNASSIGNED, items: unassigned });

  const today = todayStr();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {tasks.length} tareas abiertas · {members.length} personas
          {!canReassign && !canEditDates ? " · solo lectura" : ""}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Conmutador de vista (mismo patrón de pills que ViewTabs). */}
          <div className="inline-flex w-fit items-center gap-1 rounded-lg bg-muted p-1">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => saveView(v.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  v.key === view ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.icon}
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 sm:w-72">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar tarea o proyecto…"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </div>
      </div>

      {error ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 text-lg leading-none text-destructive/70 hover:text-destructive" aria-label="Descartar">×</button>
        </div>
      ) : null}

      {view === "person" ? (
        // Vista POR PERSONA: una columna por miembro CON tareas abiertas (+ "Sin asignar" si aplica),
        // con avatar, nombre y contador; dentro, cada tarea con título, estado y proyecto.
        (() => {
          const cols = groups.filter((g) => g.items.length > 0);
          if (cols.length === 0) {
            return <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">Sin tareas abiertas.</p>;
          }
          return (
            <div className="flex items-start gap-3 overflow-x-auto pb-2">
              {cols.map((g) => (
                <section key={g.key} className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
                  <header className="flex items-center gap-2.5 border-b border-border bg-muted/40 px-3 py-2.5">
                    {g.member ? (
                      <UserAvatar initials={g.member.initials} color={g.member.color} size="sm" />
                    ) : (
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">?</span>
                    )}
                    <span className="flex-1 truncate text-sm font-semibold">{g.member?.name ?? "Sin asignar"}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{g.items.length}</span>
                  </header>
                  <ul className="flex flex-col gap-2 p-2">
                    {g.items.map((t) => (
                      <li key={t.id} className="rounded-lg border border-border bg-background px-3 py-2">
                        {t.projectId ? (
                          <Link href={`/proyectos/${t.projectId}?tab=tareas`} className="block truncate text-sm font-medium hover:underline">{t.title}</Link>
                        ) : (
                          <span className="block truncate text-sm font-medium">{t.title}</span>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className={cn("rounded-full px-1.5 py-0.5 font-medium", t.statusClass)}>{t.statusLabel}</span>
                          {t.projectName ? (
                            <span className="truncate"><EntityEmoji value={t.projectEmoji} /> {t.projectName}</span>
                          ) : (
                            <span>Personal</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          );
        })()
      ) : (
      <div className="space-y-3">
        {groups.map((g) => {
          // Retraído por defecto; al buscar se abren todos para ver las coincidencias.
          const isOpen = term.length > 0 || !!expanded[g.key];
          return (
            <section key={g.key} className="overflow-hidden rounded-xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setExpanded((c) => ({ ...c, [g.key]: !c[g.key] }))}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40"
              >
                <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
                {g.member ? (
                  <UserAvatar initials={g.member.initials} color={g.member.color} size="sm" />
                ) : (
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">?</span>
                )}
                <span className="flex-1 truncate text-sm font-semibold">{g.member?.name ?? "Sin asignar"}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{g.items.length}</span>
              </button>

              {isOpen ? (
                g.items.length === 0 ? (
                  <p className="px-4 pb-3 pl-11 text-xs text-muted-foreground">Sin tareas abiertas.</p>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {g.items.map((t) => {
                      const overdue = t.dueDate && t.dueDate < today;
                      const isBusy = busy.has(t.id);
                      return (
                        <li key={t.id} className={cn("flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center", isBusy && "opacity-60")}>
                          <div className="min-w-0 flex-1">
                            {t.projectId ? (
                              <Link href={`/proyectos/${t.projectId}?tab=tareas`} className="text-sm font-medium hover:underline">{t.title}</Link>
                            ) : (
                              <span className="text-sm font-medium">{t.title}</span>
                            )}
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span className={cn("rounded-full px-1.5 py-0.5 font-medium", t.statusClass)}>{t.statusLabel}</span>
                              {t.projectName ? <span className="truncate">· <EntityEmoji value={t.projectEmoji} /> {t.projectName}</span> : <span>· Personal</span>}
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {/* Fecha de entrega */}
                            <label className={cn("flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs", overdue && "border-destructive/50 text-destructive")} title="Fecha de entrega">
                              {overdue ? <AlertTriangle className="size-3.5" /> : <CalendarClock className="size-3.5 text-muted-foreground" />}
                              <input
                                type="date"
                                value={t.dueDate ?? ""}
                                disabled={!canEditDates || isBusy}
                                onChange={(e) => changeDue(t, e.target.value)}
                                className="bg-transparent outline-none disabled:cursor-not-allowed"
                              />
                            </label>

                            {/* Hora de entrega (opcional): la tarea sale en el calendario a esa hora */}
                            <label className="flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-xs" title="Hora de entrega (opcional)">
                              <CalendarClock className="size-3.5 text-muted-foreground" />
                              <input
                                type="time"
                                value={t.dueTime ?? ""}
                                disabled={!canEditDates || isBusy || !t.dueDate}
                                onChange={(e) => changeDueTime(t, e.target.value)}
                                title={t.dueDate ? "Hora de entrega" : "Primero fija una fecha de entrega"}
                                className="bg-transparent outline-none disabled:cursor-not-allowed disabled:opacity-50"
                              />
                            </label>

                            {/* Responsable */}
                            <select
                              value={t.assigneeId ?? ""}
                              disabled={!canReassign || isBusy}
                              onChange={(e) => reassign(t, e.target.value)}
                              title="Responsable"
                              className="max-w-40 cursor-pointer rounded-md border border-input bg-background px-2 py-1 text-xs outline-none disabled:cursor-not-allowed"
                            >
                              <option value="">Sin asignar</option>
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                              ))}
                            </select>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : null}
            </section>
          );
        })}
      </div>
      )}
    </div>
  );
}
