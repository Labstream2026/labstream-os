"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { TeamMember } from "./my-calendar";
import { createMyEvent, updateMyEvent } from "./actions";

export type EventModalState =
  | { mode: "create"; date: string; time?: string; projectId?: string | null }
  | {
      mode: "edit";
      eventId: string;
      title: string;
      date: string;
      time: string;
      endTime: string;
      description: string;
      location: string;
      attendeeIds: string[];
      guests: string[];
    };

// Modal único para crear o editar una cita: título, hora inicio/fin, descripción y
// asistentes (menciones). Al guardar llama al server action correspondiente.
export function EventModal({ state, team, onClose }: { state: EventModalState; team: TeamMember[]; onClose: () => void }) {
  const isEdit = state.mode === "edit";
  const [attendees, setAttendees] = React.useState<Set<string>>(
    () => new Set(isEdit ? state.attendeeIds.filter((id) => team.some((m) => m.id === id)) : []),
  );
  const [pending, start] = React.useTransition();

  const dayLabel = new Date(`${state.date}T00:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold">{isEdit ? "Editar cita" : "Nueva cita"}</h3>
        <p className="mt-0.5 text-xs capitalize text-muted-foreground">{dayLabel}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("date", state.date);
            if (state.mode === "create" && state.projectId) fd.set("projectId", state.projectId);
            attendees.forEach((id) => fd.append("attendees", id));
            start(async () => {
              if (isEdit) await updateMyEvent(state.eventId, fd);
              else await createMyEvent(fd);
              onClose();
            });
          }}
          className="mt-3 space-y-2"
        >
          <input
            name="title" required autoFocus placeholder="Título de la cita"
            defaultValue={isEdit ? state.title : ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input type="date" name="date" defaultValue={state.date} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" title="Fecha" />
          <div className="flex items-center gap-2">
            <input name="time" type="time" defaultValue={isEdit ? state.time : (state.mode === "create" ? state.time ?? "" : "")} className="rounded-md border border-input bg-background px-3 py-2 text-sm" title="Hora de inicio" />
            <span className="text-muted-foreground">→</span>
            <input name="endTime" type="time" defaultValue={isEdit ? state.endTime : ""} className="rounded-md border border-input bg-background px-3 py-2 text-sm" title="Hora de fin (opcional)" />
            <span className="text-xs text-muted-foreground">(vacío = todo el día)</span>
          </div>
          <input name="location" placeholder="Lugar o enlace de reunión (Meet/Zoom)" defaultValue={isEdit ? state.location : ""} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <textarea name="description" rows={2} placeholder="Descripción / notas (opcional)" defaultValue={isEdit ? state.description : ""} className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Invitar por correo (clientes/externos)</label>
            <textarea
              name="guests" rows={2}
              defaultValue={isEdit ? state.guests.join(", ") : ""}
              placeholder="cliente@empresa.com, otra@correo.com"
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-0.5 text-[11px] text-muted-foreground">Les llega un correo con la invitación de calendario (.ics) para añadirla a su agenda.</p>
          </div>
          {team.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Invitar a (les llega notificación y se les agrega a su calendario):</p>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {team.map((m) => {
                  const on = attendees.has(m.id);
                  return (
                    <button
                      key={m.id} type="button"
                      onClick={() => setAttendees((prev) => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })}
                      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors", on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted")}
                    >
                      <span className="grid size-4 place-items-center rounded-full text-[9px] font-semibold text-white" style={{ background: m.color ?? "#6366f1" }}>{m.initials ?? m.name.slice(0, 1)}</span>
                      {m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{pending ? "Guardando…" : isEdit ? "Guardar" : "Crear"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
