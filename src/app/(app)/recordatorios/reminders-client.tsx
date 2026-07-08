"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pause, Play, Trash2, Loader2 } from "lucide-react";
import { IconRecordatorios } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { describeSchedule, WEEKDAY_LABELS } from "@/lib/reminder-schedule";
import { cn } from "@/lib/utils";
import { createReminder, toggleReminder, deleteReminder } from "./actions";

export type ReminderRow = {
  id: string;
  title: string;
  notes: string | null;
  frequency: string;
  weekdays: string | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  nextFireAtIso: string;
  lastFiredAtIso: string | null;
  active: boolean;
  forUser: { id: string; name: string };
  createdBy: { id: string; name: string };
  task: { id: string; title: string } | null;
  canManage: boolean;
};

type TeamOption = { id: string; name: string };

// Formato absoluto en hora de Bogotá (la app entera "habla" en hora de Colombia).
const FMT = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

function relativo(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "ya";
  const min = Math.round(ms / 60000);
  if (min < 60) return `en ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `en ${h} h`;
  return `en ${Math.round(h / 24)} días`;
}

// Mañana en calendario de Bogotá (valor por defecto del campo fecha).
function bogotaTomorrowYmd(): string {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  return new Date(new Date(`${ymd}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}

const FREQ_OPTIONS = [
  { key: "UNA_VEZ", label: "Una vez" },
  { key: "DIARIO", label: "Cada día" },
  { key: "SEMANAL", label: "Cada semana" },
  { key: "MENSUAL", label: "Cada mes" },
] as const;

// Orden humano de la semana (lunes primero); los valores siguen siendo 0=domingo.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function RemindersClient({ rows, team, meId }: { rows: ReminderRow[]; team: TeamOption[]; meId: string }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  // ── Formulario ──
  const [open, setOpen] = React.useState(rows.length === 0);
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [forUserId, setForUserId] = React.useState(meId);
  const [frequency, setFrequency] = React.useState<string>("UNA_VEZ");
  const [date, setDate] = React.useState(bogotaTomorrowYmd());
  const [timeOfDay, setTimeOfDay] = React.useState("08:00");
  const [weekdays, setWeekdays] = React.useState<number[]>([1]);
  const [dayOfMonth, setDayOfMonth] = React.useState(1);

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await createReminder({
        title,
        notes: notes || undefined,
        forUserId,
        frequency,
        date: frequency === "UNA_VEZ" ? date : undefined,
        timeOfDay,
        weekdays: frequency === "SEMANAL" ? weekdays : undefined,
        dayOfMonth: frequency === "MENSUAL" ? dayOfMonth : undefined,
      });
      if (!res.ok) { setError(res.error ?? "No se pudo crear"); return; }
      setTitle(""); setNotes("");
      router.refresh();
    });
  };

  const onToggle = (id: string, active: boolean) => {
    setError(null);
    start(async () => {
      const res = await toggleReminder(id, active);
      if (!res.ok) setError(res.error ?? "No se pudo cambiar");
      router.refresh();
    });
  };

  const onDelete = async (r: ReminderRow) => {
    if (!(await confirm({ title: "Eliminar recordatorio", message: `¿Eliminar «${r.title}»? No volverá a sonar.`, confirmLabel: "Eliminar" }))) return;
    start(async () => {
      const res = await deleteReminder(r.id);
      if (!res.ok) setError(res.error ?? "No se pudo eliminar");
      router.refresh();
    });
  };

  const inputCls = "rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
  const upcoming = rows.filter((r) => r.active);
  const inactive = rows.filter((r) => !r.active);

  return (
    <div>
      {dialog}

      {/* ── Nuevo recordatorio ── */}
      {!open ? (
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="size-4" /> Nuevo recordatorio
        </button>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="¿Qué hay que recordar? (p. ej. Sacar la basura, Grabación con el cliente…)"
              className={cn(inputCls, "w-full")}
            />

            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-muted-foreground">Para</label>
              <select value={forUserId} onChange={(e) => setForUserId(e.target.value)} className={cn(inputCls, "h-9 py-1")}>
                {team.map((u) => (
                  <option key={u.id} value={u.id}>{u.id === meId ? "Mí" : u.name}</option>
                ))}
              </select>

              <div className="ml-1 flex overflow-hidden rounded-md border border-input">
                {FREQ_OPTIONS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFrequency(f.key)}
                    className={cn("px-2.5 py-1.5 text-xs font-medium transition-colors", frequency === f.key ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {frequency === "UNA_VEZ" ? (
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(inputCls, "h-9 py-1")} />
              ) : null}

              {frequency === "SEMANAL" ? (
                <div className="flex gap-1">
                  {WEEK_ORDER.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))}
                      className={cn(
                        "size-8 rounded-full text-xs font-medium transition-colors",
                        weekdays.includes(d) ? "bg-primary text-primary-foreground" : "border border-input hover:bg-accent",
                      )}
                    >
                      {WEEKDAY_LABELS[d]}
                    </button>
                  ))}
                </div>
              ) : null}

              {frequency === "MENSUAL" ? (
                <label className="flex items-center gap-1.5 text-sm">
                  el día
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value) || 1)))}
                    className={cn(inputCls, "h-9 w-16 py-1")}
                  />
                </label>
              ) : null}

              <label className="flex items-center gap-1.5 text-sm">
                a las
                <input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} className={cn(inputCls, "h-9 py-1")} />
              </label>
            </div>

            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Nota opcional (aparece en la notificación)"
              className={cn(inputCls, "w-full")}
            />

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="flex items-center gap-2">
              <button onClick={submit} disabled={pending || !title.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Crear recordatorio
              </button>
              <button onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Próximos ── */}
      <h2 className="mt-8 mb-2 text-sm font-semibold">Próximos ({upcoming.length})</h2>
      {upcoming.length === 0 ? (
        <EmptyState
          icon={<IconRecordatorios />}
          title="No tienes recordatorios activos"
          description="Crea el primero: puede ser para ti o para alguien del equipo, una sola vez o recurrente."
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {upcoming.map((r) => (
            <Row key={r.id} r={r} meId={meId} onToggle={onToggle} onDelete={onDelete} />
          ))}
        </div>
      )}

      {/* ── Pausados y pasados ── */}
      {inactive.length > 0 ? (
        <>
          <h2 className="mt-8 mb-2 text-sm font-semibold text-muted-foreground">Pausados y pasados ({inactive.length})</h2>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/50">
            {inactive.map((r) => (
              <Row key={r.id} r={r} meId={meId} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Row({ r, meId, onToggle, onDelete }: {
  r: ReminderRow;
  meId: string;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (r: ReminderRow) => void;
}) {
  const recurrente = r.frequency !== "UNA_VEZ";
  const schedule = recurrente
    ? describeSchedule({ frequency: r.frequency, weekdays: r.weekdays, dayOfMonth: r.dayOfMonth, timeOfDay: r.timeOfDay })
    : "Una vez";
  // Reactivable: recurrentes siempre; "una vez" solo si su momento no ha pasado.
  const reactivable = recurrente || new Date(r.nextFireAtIso).getTime() > Date.now();

  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", !r.active && "opacity-70")}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {r.title}
          {r.task ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">tarea: {r.task.title}</span> : null}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground" suppressHydrationWarning>
          <span className={cn("mr-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", recurrente ? "bg-violet-500/15 text-violet-700 dark:text-violet-300" : "bg-sky-500/15 text-sky-700 dark:text-sky-300")}>
            {schedule}
          </span>
          {r.active
            ? <>suena {FMT.format(new Date(r.nextFireAtIso))} · {relativo(r.nextFireAtIso)}</>
            : r.lastFiredAtIso
              ? <>sonó {FMT.format(new Date(r.lastFiredAtIso))}</>
              : <>pausado</>}
          {r.forUser.id !== meId ? <> · para <strong className="font-medium text-foreground">{r.forUser.name}</strong></> : null}
          {r.createdBy.id !== meId ? <> · de {r.createdBy.name}</> : null}
        </p>
        {r.notes ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.notes}</p> : null}
      </div>

      {r.canManage ? (
        <div className="flex shrink-0 items-center gap-1">
          {r.active ? (
            <button onClick={() => onToggle(r.id, false)} title="Pausar" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <Pause className="size-4" />
            </button>
          ) : reactivable ? (
            <button onClick={() => onToggle(r.id, true)} title="Reactivar" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <Play className="size-4" />
            </button>
          ) : null}
          <button onClick={() => onDelete(r)} title="Eliminar" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
