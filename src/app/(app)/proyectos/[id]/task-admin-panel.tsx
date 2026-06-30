"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X, Pencil, Bell, Printer, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminUpdateTask, getTaskDescription } from "./actions";
import { type Task, type TeamMember, toDateInputValue } from "./task-shared";
import { type LabelRow, labelOptions } from "@/lib/colors";

// Botón ✏️ autónomo (con su propio estado) para abrir el panel desde una vista de SERVIDOR
// (p. ej. la Lista de tareas), sin tener que volverla cliente.
export function TaskAdminButton(props: {
  task: Task;
  projectId: string;
  team: TeamMember[];
  stages: string[];
  statuses: LabelRow[];
  priorities: LabelRow[];
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Editar tarea (admin)"
        aria-label="Editar tarea"
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Pencil className="size-3.5" />
      </button>
      {open ? <TaskAdminPanel {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

// Panel CENTRAL para que un administrador edite TODA la tarea de una vez (título, estado,
// prioridad, fase, responsable, fechas y descripción) y la guarde junta. Al guardar se
// notifica al responsable anterior y al nuevo con el detalle del cambio. Se abre igual desde
// las vistas Tablero y Lista.
export function TaskAdminPanel({
  task,
  projectId,
  team,
  stages,
  statuses,
  priorities,
  onClose,
}: {
  task: Task;
  projectId: string;
  team: TeamMember[];
  stages: string[];
  statuses: LabelRow[];
  priorities: LabelRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [descLoaded, setDescLoaded] = React.useState(false);

  const stageOpts = stages.length ? stages : ["Por hacer"];
  const curStage = task.stage && stages.includes(task.stage) ? task.stage : stageOpts[0];

  const [form, setForm] = React.useState({
    title: task.title,
    status: task.status,
    stage: curStage,
    priority: task.priority,
    assigneeId: task.assigneeId ?? "",
    startDate: toDateInputValue(task.startDate ?? null) ?? "",
    dueDate: toDateInputValue(task.dueDate) ?? "",
    dueTime: task.dueTime ?? (task.dueDate ? "09:00" : ""),
    description: "",
  });

  // La descripción no viaja en el tipo Task; se carga al abrir el panel.
  React.useEffect(() => {
    let alive = true;
    getTaskDescription(task.id)
      .then((d) => { if (alive) { setForm((f) => ({ ...f, description: d })); setDescLoaded(true); } })
      .catch(() => { if (alive) setDescLoaded(true); });
    return () => { alive = false; };
  }, [task.id]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setError(null);
  }

  function save() {
    if (!form.title.trim()) { setError("El título no puede quedar vacío."); return; }
    const fd = new FormData();
    fd.set("title", form.title.trim());
    fd.set("status", form.status);
    fd.set("stage", form.stage);
    fd.set("priority", form.priority);
    fd.set("assigneeId", form.assigneeId);
    fd.set("startDate", form.startDate);
    fd.set("dueDate", form.dueDate);
    fd.set("dueTime", form.dueTime);
    fd.set("description", form.description);
    setError(null);
    start(async () => {
      const r = await adminUpdateTask(task.id, projectId, fd);
      if (r.ok) { router.refresh(); onClose(); }
      else setError(r.error ?? "No se pudo guardar.");
    });
  }

  const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
  const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Pencil className="size-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Editar tarea</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">GESTIÓN</span>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-4">
          {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}

          <div>
            <label className={labelCls}>Título</label>
            <input value={form.title} onChange={(e) => set("title", e.target.value)} className={cn(inputCls, "font-medium")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Estado</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>
                {labelOptions(statuses).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Prioridad</label>
              <select value={form.priority} onChange={(e) => set("priority", e.target.value)} className={inputCls}>
                {labelOptions(priorities).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Fase</label>
              <select value={form.stage} onChange={(e) => set("stage", e.target.value)} className={inputCls}>
                {stageOpts.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Responsable</label>
              <select value={form.assigneeId} onChange={(e) => set("assigneeId", e.target.value)} className={inputCls}>
                <option value="">Sin asignar</option>
                {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Fecha de inicio</label>
              <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fecha de entrega</label>
              <input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Hora de entrega</label>
            <input type="time" value={form.dueTime} onChange={(e) => set("dueTime", e.target.value)} className={inputCls} />
            <p className="mt-1 text-[11px] text-muted-foreground">Con hora, la tarea aparece en el calendario a esa hora (no «todo el día»).</p>
          </div>

          <div>
            <label className={labelCls}>Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              placeholder={descLoaded ? "Sin descripción…" : "Cargando…"}
              className={cn(inputCls, "resize-y")}
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2">
            <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-xs text-muted-foreground">
              Al guardar se avisa al responsable <strong>anterior</strong> y al <strong>nuevo</strong>, con el detalle de lo que cambió.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">
            <Printer className="size-4" /> Imprimir
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">Cancelar</button>
            <button type="button" onClick={save} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {pending ? "Guardando…" : <><Check className="size-4" /> Guardar cambios</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
