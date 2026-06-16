"use client";

import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import type { CalItem } from "./my-calendar";
import { deleteMyEvent } from "./actions";

// Color por tipo. `bar` = acento sólido, `bg` = relleno tenue (franja todo-el-día
// y detalle), `solid` = relleno saturado para los bloques cronometrados estilo
// Notion Calendar (texto blanco encima).
export function calTone(kind: CalItem["kind"], shoot?: boolean) {
  if (shoot || kind === "shoot") return { bar: "#f43f5e", bg: "rgba(244,63,94,0.12)", solid: "#f43f5e", soft: "rgba(244,63,94,0.16)" };
  if (kind === "event") return { bar: "#6366f1", bg: "rgba(99,102,241,0.12)", solid: "#6366f1", soft: "rgba(99,102,241,0.16)" };
  return { bar: "#f59e0b", bg: "rgba(245,158,11,0.14)", solid: "#f59e0b", soft: "rgba(245,158,11,0.18)" };
}

// Eventos de ventana para comunicar el calendario (rejilla) con el panel derecho
// (dock) y con el modal de crear/editar que vive en CalendarBoard.
export const CAL_DETAIL_EVENT = "calendar:detail"; // seleccionar → mostrar detalle
export const CAL_EDIT_EVENT = "calendar:edit"; // pedir editar una cita
export const CAL_CREATE_EVENT = "calendar:create"; // pedir crear en un día/hora

export function emitCalendarDetail(item: CalItem | null) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CAL_DETAIL_EVENT, { detail: item }));
}
export function emitCalendarEdit(item: CalItem) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CAL_EDIT_EVENT, { detail: item }));
}
export function emitCalendarCreate(date: string, time?: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CAL_CREATE_EVENT, { detail: { date, time } }));
}

// Tarjeta de detalle de una cita/tarea/rodaje. Se usa en el panel derecho del calendario.
export function CalendarDetailCard({ item, onClose }: { item: CalItem; onClose?: () => void }) {
  const isShoot = item.kind === "shoot";
  const typeLabel = item.kind === "event" ? "Cita / reunión" : isShoot ? "Rodaje" : "Tarea";
  const start = new Date(item.start ?? item.date);
  const dateLabel = start.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  const t = calTone(item.kind, isShoot);
  const people = item.attendees ?? (item.assignee ? [item.assignee] : []);
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="h-1.5 w-full shrink-0" style={{ background: t.bar }} />
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{typeLabel}</p>
          {onClose ? <button onClick={onClose} aria-label="Cerrar" className="text-muted-foreground hover:text-foreground">✕</button> : null}
        </div>
        <h3 className="text-base font-semibold leading-snug">{item.title}</h3>
        <p className="text-sm capitalize text-muted-foreground">
          {dateLabel}
          {item.time ? ` · ${item.time}${item.endTime ? `–${item.endTime}` : ""}` : item.allDay || item.kind !== "event" ? " · todo el día" : ""}
        </p>
        {item.projectName ? <p className="text-sm text-muted-foreground">{item.projectEmoji ?? "🗂️"} {item.projectName}</p> : null}
        {item.description ? <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm text-foreground/90">{item.description}</p> : null}
        {people.length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{item.kind === "event" ? "Asistentes" : "Responsable"}</p>
            <div className="flex flex-wrap gap-1.5">
              {people.map((u, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs">
                  <UserAvatar initials={u.initials} color={u.color} size="sm" /> {u.name}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {item.link ? (
          <a href={item.link} className="inline-flex w-full items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Abrir</a>
        ) : null}
        {item.canEdit && item.eventId ? <EventControls item={item} onClose={onClose} /> : null}
      </div>
    </div>
  );
}

// Botones Editar / Eliminar para citas creadas por el usuario actual (eventos app).
function EventControls({ item, onClose }: { item: CalItem; onClose?: () => void }) {
  const [confirming, setConfirming] = React.useState(false);
  const [pending, start] = React.useTransition();
  return (
    <div className="flex items-center gap-2 border-t border-border pt-3">
      <button
        onClick={() => emitCalendarEdit(item)}
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
      >
        <Pencil className="size-4" /> Editar
      </button>
      {confirming ? (
        <button
          onClick={() => start(async () => { await deleteMyEvent(item.eventId!); onClose?.(); })}
          disabled={pending}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-destructive px-3 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-60"
        >
          <Trash2 className="size-4" /> {pending ? "Borrando…" : "Confirmar"}
        </button>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-destructive/40 px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4" /> Eliminar
        </button>
      )}
    </div>
  );
}
