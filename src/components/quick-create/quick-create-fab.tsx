"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus, X, ListChecks, CalendarPlus, FolderPlus, Pencil, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROJECT_STATUS } from "@/lib/ui";
import { todayInputValue } from "@/lib/today";
import { createMyTask } from "@/app/(app)/mis-tareas/actions";
import { createMyEvent } from "@/app/(app)/calendario/actions";
import { createTask, updateProject, getProjectBasics, getProjectCapabilities } from "@/app/(app)/proyectos/[id]/actions";

type Person = { id: string; name: string };
type Opt = { value: string; label: string };

// Tipo de formulario que abre cada acción del botón flotante.
type ModalKind = "task-personal" | "task-project" | "event" | "edit-project";
type Action = { key: string; label: string; Icon: React.ComponentType<{ className?: string }>; run: () => void };

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export function QuickCreateFab({
  me,
  team,
  priorities,
  canCalendar,
  canCreateTasks,
  canCreateProjects,
}: {
  me: Person;
  team: Person[]; // equipo activo sin «yo»
  priorities: Opt[];
  canCalendar: boolean;
  canCreateTasks: boolean;
  canCreateProjects: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [dialOpen, setDialOpen] = React.useState(false);
  const [modal, setModal] = React.useState<ModalKind | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // Personas para los selectores (responsable/asistentes), con «yo» primero.
  const people: Person[] = React.useMemo(() => [{ id: me.id, name: `${me.name} (yo)` }, ...team], [me, team]);

  // ── Contexto por ruta ──
  const parts = pathname.split("/").filter(Boolean);
  const projectId = parts[0] === "proyectos" && parts[1] && parts[1] !== "nuevo" && parts.length === 2 ? parts[1] : null;
  const clientId = parts[0] === "clientes" && parts[1] ? parts[1] : null;
  const isClientes = parts[0] === "clientes";
  const isCalendario = pathname === "/calendario";
  const isMisTareas = pathname === "/mis-tareas";

  // ¿Puede el usuario escribir en ESTE proyecto? Se consulta al servidor para no fiarse
  // de un permiso global (crear_tareas/proyectos) que no implica acceso a este proyecto.
  const [projCanWrite, setProjCanWrite] = React.useState(false);
  React.useEffect(() => {
    if (!projectId) { setProjCanWrite(false); return; }
    let alive = true;
    getProjectCapabilities(projectId)
      .then((r) => { if (alive) setProjCanWrite(!!r?.canWrite); })
      .catch(() => { if (alive) setProjCanWrite(false); });
    return () => { alive = false; };
  }, [projectId]);

  // Cierra el speed-dial al navegar o con Escape.
  React.useEffect(() => { setDialOpen(false); }, [pathname]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDialOpen(false); if (!busy) setModal(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy]);

  function openModal(kind: ModalKind) {
    setErr(null);
    setDialOpen(false);
    setModal(kind);
  }

  // Crear desde FUERA del FAB (los accesos «Nueva tarea / Nueva cita» del cajón de «Más» en
  // móvil): un CustomEvent global abre el modal correspondiente respetando los permisos. En un
  // proyecto con escritura, la tarea se crea EN ese proyecto (igual que el propio FAB).
  React.useEffect(() => {
    const onQuick = (e: Event) => {
      const kind = (e as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind === "task" && canCreateTasks) openModal(projectId && projCanWrite ? "task-project" : "task-personal");
      if (kind === "event" && canCalendar) openModal("event");
    };
    window.addEventListener("lsos:quick-create", onQuick);
    return () => window.removeEventListener("lsos:quick-create", onQuick);
  }, [canCreateTasks, canCalendar, projectId, projCanWrite]);

  // Construye las acciones disponibles según la ruta actual.
  const actions: Action[] = [];
  if (isMisTareas) {
    if (canCreateTasks) actions.push({ key: "task", label: "Nueva tarea", Icon: ListChecks, run: () => openModal("task-personal") });
  } else if (isCalendario) {
    if (canCalendar) actions.push({ key: "event", label: "Nueva cita", Icon: CalendarPlus, run: () => openModal("event") });
    if (canCreateTasks) actions.push({ key: "task", label: "Nueva tarea", Icon: ListChecks, run: () => openModal("task-personal") });
  } else if (projectId) {
    // Crear tarea y editar el proyecto requieren ESCRITURA en este proyecto (no solo el
    // permiso global). Crear una cita solo requiere ver_calendario (la cita se asocia al
    // proyecto pero no muta el proyecto).
    if (canCreateTasks && projCanWrite) actions.push({ key: "task", label: "Nueva tarea", Icon: ListChecks, run: () => openModal("task-project") });
    if (canCalendar) actions.push({ key: "event", label: "Nueva cita", Icon: CalendarPlus, run: () => openModal("event") });
    if (projCanWrite) actions.push({ key: "edit", label: "Editar proyecto", Icon: Pencil, run: () => openModal("edit-project") });
  } else if (isClientes) {
    if (canCreateProjects)
      actions.push({
        key: "project",
        label: "Nuevo proyecto",
        Icon: FolderPlus,
        run: () => router.push(clientId ? `/proyectos/nuevo?clientId=${clientId}` : "/proyectos/nuevo"),
      });
  }

  // Ejecuta una server action de creación/edición y cierra el modal al terminar.
  async function run(fd: FormData, fn: (fd: FormData) => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn(fd);
      setModal(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  // OJO: aunque la ruta no aporte acciones para el FAB, el componente sigue montado — los
  // MODALES también sirven a los accesos del cajón de «Más» (evento lsos:quick-create).
  const single = actions.length === 1;
  const onFabClick = () => {
    if (single) actions[0].run();
    else setDialOpen((v) => !v);
  };

  return (
    <>
      {/* Botón flotante + speed-dial — SOLO ESCRITORIO (hidden md:flex): en móvil chocaba con
          la burbuja de chat, así que crear vive en el cajón de «Más» (evento lsos:quick-create,
          los modales de abajo son compartidos). Posición ABSOLUTA respecto al bloque central de
          la app (la columna de contenido tiene `relative`). Se oculta al imprimir.
          `qc-dial-open` (marcador, sin estilos): las BURBUJAS de chat flotantes —que se apilan
          justo encima del FAB— lo detectan vía CSS body:has() y se desvanecen mientras el dial
          está abierto, porque sus acciones suben exactamente al hueco de la burbuja y quedaban
          tapadas (la burbuja tiene z mayor). Sin estado compartido entre componentes. */}
      {actions.length > 0 ? (
      <div className={cn("absolute z-40 hidden flex-col items-end gap-3 md:bottom-6 md:right-6 md:flex print:hidden", !single && dialOpen && "qc-dial-open")}>
        {!single && dialOpen ? (
          <div className="flex flex-col items-end gap-2">
            {actions.map(({ key, label, Icon, run: act }) => (
              <button
                key={key}
                type="button"
                onClick={act}
                className="group flex items-center gap-2.5"
              >
                <span className="rounded-md bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md ring-1 ring-border">
                  {label}
                </span>
                <span className="flex size-11 items-center justify-center rounded-full bg-card text-foreground shadow-lg ring-1 ring-border transition-colors group-hover:bg-accent">
                  <Icon className="size-5" />
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onFabClick}
          aria-label={single ? actions[0].label : dialOpen ? "Cerrar" : "Crear"}
          title={single ? actions[0].label : "Crear"}
          className={cn(
            "flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:bg-primary/90 active:scale-95",
            dialOpen && "rotate-45",
          )}
        >
          <Plus className="size-7" />
        </button>
      </div>
      ) : null}

      {/* Backdrop para cerrar el speed-dial al tocar fuera. */}
      {dialOpen && !single ? (
        <div className="fixed inset-0 z-30" onClick={() => setDialOpen(false)} aria-hidden />
      ) : null}

      {/* Modal de creación/edición */}
      {modal ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => { if (!busy) setModal(null); }}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">
                {modal === "task-personal" || modal === "task-project"
                  ? "Nueva tarea"
                  : modal === "event"
                    ? "Nueva cita"
                    : "Editar proyecto"}
              </h3>
              <button type="button" aria-label="Cerrar" onClick={() => { if (!busy) setModal(null); }} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                <X className="size-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-4">
              {err ? <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</p> : null}

              {modal === "task-personal" ? (
                <TaskForm people={people} priorities={priorities} defaultAssignee={me.id} busy={busy} onSubmit={(fd) => run(fd, createMyTask)} personal />
              ) : null}

              {modal === "task-project" && projectId ? (
                <TaskForm people={people} priorities={priorities} defaultAssignee="" busy={busy} onSubmit={(fd) => run(fd, createTask.bind(null, projectId))} />
              ) : null}

              {modal === "event" ? (
                <EventForm people={people} projectId={projectId} busy={busy} onSubmit={(fd) => run(fd, createMyEvent)} />
              ) : null}

              {modal === "edit-project" && projectId ? (
                <EditProjectForm projectId={projectId} people={people} priorities={priorities} busy={busy} onSubmit={(fd) => run(fd, updateProject.bind(null, projectId))} />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ── Formulario de tarea (personal o de proyecto) ──
function TaskForm({
  people,
  priorities,
  defaultAssignee,
  personal = false,
  busy,
  onSubmit,
}: {
  people: Person[];
  priorities: Opt[];
  defaultAssignee: string;
  personal?: boolean;
  busy: boolean;
  onSubmit: (fd: FormData) => void;
}) {
  return (
    <form action={onSubmit} className="space-y-3">
      <input name="title" required autoFocus placeholder="¿Qué hay que hacer?" className={inputCls} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Responsable</span>
          <select name="assigneeId" defaultValue={defaultAssignee} className={inputCls}>
            {!personal ? <option value="">Sin asignar</option> : null}
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Prioridad</span>
          <select name="priority" defaultValue={priorities[0]?.value ?? "MEDIA"} className={inputCls}>
            {priorities.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Inicio</span>
          <input type="date" name="startDate" required defaultValue={todayInputValue()} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Fecha de entrega</span>
          <input type="date" name="dueDate" required className={inputCls} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">Descripción (opcional)</span>
        <textarea name="description" rows={2} className={inputCls} />
      </label>
      {personal ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="isPrivate" className="size-4 rounded border-input" />
          Tarea personal (privada)
        </label>
      ) : null}
      <SubmitBar busy={busy} label="Crear tarea" />
    </form>
  );
}

// ── Formulario de cita/evento ──
function EventForm({
  people,
  projectId,
  busy,
  onSubmit,
}: {
  people: Person[];
  projectId: string | null;
  busy: boolean;
  onSubmit: (fd: FormData) => void;
}) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return (
    <form action={onSubmit} className="space-y-3">
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
      <input name="title" required autoFocus placeholder="Título de la cita" className={inputCls} />
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-3 block sm:col-span-1">
          <span className="mb-1 block text-xs text-muted-foreground">Fecha</span>
          <input type="date" name="date" required defaultValue={todayStr} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Inicio</span>
          <input type="time" name="time" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Fin</span>
          <input type="time" name="endTime" className={inputCls} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">Lugar o enlace (opcional)</span>
        <input name="location" placeholder="Sala, dirección o enlace de Meet" className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">Asistentes (opcional)</span>
        <select name="attendees" multiple size={Math.min(4, Math.max(2, people.length))} className={cn(inputCls, "h-auto")}>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="mt-1 block text-[10px] text-muted-foreground">Ctrl/⌘ + clic para elegir varios.</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">Descripción (opcional)</span>
        <textarea name="description" rows={2} className={inputCls} />
      </label>
      <SubmitBar busy={busy} label="Crear cita" />
    </form>
  );
}

// ── Formulario de edición de proyecto (precarga datos al abrir) ──
function EditProjectForm({
  projectId,
  people,
  priorities,
  busy,
  onSubmit,
}: {
  projectId: string;
  people: Person[];
  priorities: Opt[];
  busy: boolean;
  onSubmit: (fd: FormData) => void;
}) {
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<Awaited<ReturnType<typeof getProjectBasics>>["project"] | null>(null);
  const [loadErr, setLoadErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    getProjectBasics(projectId)
      .then((r) => { if (!alive) return; if (r.ok && r.project) setData(r.project); else setLoadErr("No se pudo cargar el proyecto."); })
      .catch(() => { if (alive) setLoadErr("No tienes acceso para editar este proyecto."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId]);

  if (loading) return <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Cargando…</p>;
  if (loadErr || !data) return <p className="py-4 text-sm text-destructive">{loadErr ?? "No disponible."}</p>;

  const statusOptions = Object.entries(PROJECT_STATUS).map(([value, m]) => ({ value, label: m.label }));

  return (
    <form action={onSubmit} className="space-y-3">
      <div className="flex gap-2">
        <input name="emoji" defaultValue={data.emoji ?? ""} maxLength={4} placeholder="🎬" className={cn(inputCls, "w-16 text-center text-lg")} />
        <input name="name" required defaultValue={data.name} placeholder="Nombre del proyecto" className={inputCls} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Estado</span>
          <select name="status" defaultValue={data.status} className={inputCls}>
            {statusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Prioridad</span>
          <select name="priority" defaultValue={data.priority} className={inputCls}>
            {priorities.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">Responsable</span>
        <select name="leadId" defaultValue={data.leadId ?? ""} className={inputCls}>
          <option value="">Sin asignar</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Inicio</span>
          <input type="date" name="startDate" defaultValue={data.startDate} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Entrega</span>
          <input type="date" name="dueDate" defaultValue={data.dueDate} className={inputCls} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">Descripción (opcional)</span>
        <textarea name="description" rows={2} defaultValue={data.description ?? ""} className={inputCls} />
      </label>
      <SubmitBar busy={busy} label="Guardar cambios" />
    </form>
  );
}

function SubmitBar({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
      {label}
    </button>
  );
}
