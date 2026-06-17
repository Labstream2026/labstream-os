"use client";

import * as React from "react";
import { type LabelRow, defaultKey } from "@/lib/colors";
import { createMyTask } from "./actions";

// Formulario para crear una tarea personal o asignarla a alguien del equipo.
export function MyTaskForm({ team, priorities }: { team: { id: string; name: string }[]; priorities: LabelRow[] }) {
  const [open, setOpen] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/40"
        >
          + Nueva tarea (para mí o para alguien del equipo)
        </button>
      ) : (
        <form
          ref={formRef}
          action={async (fd) => {
            await createMyTask(fd);
            formRef.current?.reset();
            setOpen(false);
          }}
          className="space-y-2"
        >
          <input
            name="title"
            required
            autoFocus
            placeholder="¿Qué hay que hacer? (ej. comprar café)"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            name="description"
            rows={2}
            placeholder="Descripción (opcional): detalles de la tarea…"
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Para
              <select name="assigneeId" defaultValue="" className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
                <option value="">mí</option>
                {team.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </label>
            <select name="priority" defaultValue={defaultKey(priorities)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm">
              {priorities.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Inicio
              <input name="startDate" type="date" title="Cuándo empieza (agéndala a futuro)" className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Entrega
              <input name="dueDate" type="date" className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input name="isPrivate" type="checkbox" className="size-3.5" /> 🔒 Privada
            </label>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
              Cancelar
            </button>
            <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Crear tarea
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
