"use client";

import * as React from "react";
import { Trash2, Loader2, Plus } from "lucide-react";
import { IconRecordatorios } from "@/components/icons";
import { cn } from "@/lib/utils";
import { createReminder, getTaskReminders, deleteReminder, type TaskReminderItem } from "@/app/(app)/recordatorios/actions";

// Recordatorios de una TAREA (panel de detalle): "avísame el día anterior / el mismo día /
// cuando yo diga". Crean un Reminder de una sola vez ligado a la tarea, PARA QUIEN LO CREA
// (cada quien decide cómo quiere que le suene). Suenan por campana + push + Marcebot.

const FMT = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

function ymdPlus(ymd: string, days: number): string {
  return new Date(new Date(`${ymd}T12:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

function bogotaTomorrow(): string {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  return ymdPlus(hoy, 1);
}

export function TaskReminders({ taskId, taskTitle, dueDateValue }: { taskId: string; taskTitle: string; dueDateValue: string }) {
  const [items, setItems] = React.useState<TaskReminderItem[] | null>(null);
  const [date, setDate] = React.useState(dueDateValue ? ymdPlus(dueDateValue, -1) : bogotaTomorrow());
  const [time, setTime] = React.useState("08:00");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const reload = React.useCallback(() => {
    getTaskReminders(taskId).then(setItems).catch(() => setItems([]));
  }, [taskId]);

  React.useEffect(() => { reload(); }, [reload]);

  const create = (d: string, t: string) => {
    setError(null);
    start(async () => {
      const res = await createReminder({ title: taskTitle, taskId, frequency: "UNA_VEZ", date: d, timeOfDay: t });
      if (!res.ok) { setError(res.error ?? "No se pudo crear"); return; }
      reload();
    });
  };

  const remove = (id: string) => {
    start(async () => { await deleteReminder(id); reload(); });
  };

  const chip = "rounded-full border border-input px-2.5 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-50";

  return (
    <div className="border-t border-border pt-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <IconRecordatorios className="size-4" /> Recordatorios
      </p>

      {/* Existentes */}
      {items === null ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : items.length > 0 ? (
        <div className="mb-2 space-y-1">
          {items.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate" suppressHydrationWarning>
                ⏰ {FMT.format(new Date(r.nextFireAtIso))}
                {r.schedule !== "Una vez" ? ` · ${r.schedule}` : ""} · para {r.forUserName}
              </span>
              {r.canManage ? (
                <button onClick={() => remove(r.id)} title="Quitar" className="rounded p-0.5 text-muted-foreground hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Atajos (si la tarea tiene fecha de entrega) + fecha/hora libre */}
      <div className="flex flex-wrap items-center gap-1.5">
        {dueDateValue ? (
          <>
            <button disabled={pending} onClick={() => create(ymdPlus(dueDateValue, -1), "08:00")} className={chip}>
              Día anterior, 8:00
            </button>
            <button disabled={pending} onClick={() => create(dueDateValue, "07:00")} className={chip}>
              El mismo día, 7:00
            </button>
          </>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring" />
        <button
          disabled={pending}
          onClick={() => create(date, time)}
          className={cn(chip, "inline-flex items-center gap-1 border-primary/40 text-primary")}
        >
          {pending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />} Recordarme
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      <p className="mt-1 text-[10px] text-muted-foreground">Te llega por campana y push; Marcebot también te lo recuerda.</p>
    </div>
  );
}
