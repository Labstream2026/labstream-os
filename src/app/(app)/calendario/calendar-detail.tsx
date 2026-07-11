"use client";

import * as React from "react";
import { CalendarPlus, ChevronDown, Download, Mail, MapPin, Pencil, Trash2, Video } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { avatarHex } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { EntityEmoji } from "@/components/icons/marks";
import { googleCalUrl, outlookCalUrl, downloadIcs, type CalExport } from "@/lib/add-to-calendar";
import type { CalItem } from "./my-calendar";
import { deleteMyEvent, respondToEvent } from "./actions";

// Modo de color del calendario: por tipo (cita/tarea/rodaje) o por persona responsable.
export type ColorBy = "tipo" | "persona";

// Color del bloque según la persona responsable (asignado, o primer asistente de la cita).
// Devuelve null si no hay persona/color → el llamador cae al color por tipo.
export function personColor(item: CalItem): string | null {
  const c = item.assignee?.color ?? item.attendees?.[0]?.color ?? null;
  return c ? avatarHex(c) : null;
}

// Color por tipo. `bar` = acento sólido, `bg` = relleno tenue (franja todo-el-día
// y detalle), `solid` = relleno saturado para los bloques cronometrados estilo
// Notion Calendar (texto blanco encima).
export function calTone(kind: CalItem["kind"], shoot?: boolean) {
  if (shoot || kind === "shoot") return { bar: "#f43f5e", bg: "rgba(244,63,94,0.12)", solid: "#f43f5e", soft: "rgba(244,63,94,0.16)" };
  if (kind === "event") return { bar: "#6366f1", bg: "rgba(99,102,241,0.12)", solid: "#6366f1", soft: "rgba(99,102,241,0.16)" };
  if (kind === "milestone") return { bar: "#0ea5e9", bg: "rgba(14,165,233,0.12)", solid: "#0ea5e9", soft: "rgba(14,165,233,0.16)" };
  return { bar: "#f59e0b", bg: "rgba(245,158,11,0.14)", solid: "#f59e0b", soft: "rgba(245,158,11,0.18)" };
}

// Color sólido base de un item en modo "tipo": las ENTREGAS (tareas con fecha) se pintan por
// URGENCIA (termómetro vencida→lejana, coherente con el resto de la app); el resto, por su tipo.
export function itemSolid(it: CalItem): string {
  if (it.kind === "task" && it.urgencyHex) return it.urgencyHex;
  return calTone(it.kind, it.kind === "shoot").solid;
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
  const typeLabel = item.kind === "event" ? "Cita / reunión" : isShoot ? "Rodaje" : item.kind === "milestone" ? "Hito del proyecto" : "Tarea";
  // El día se saca de la fecha de PARED (it.start.slice(0,10), UTC), no de convertir el
  // instante a la TZ del navegador —así un evento de madrugada no salta al día anterior—.
  const [dY, dM, dD] = (item.start ?? item.date).slice(0, 10).split("-").map(Number);
  const dateLabel = new Date(dY, dM - 1, dD).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
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
        {item.projectName ? <p className="text-sm text-muted-foreground"><EntityEmoji value={item.projectEmoji} fallback="🗂️" /> {item.projectName}</p> : null}
        {item.location ? (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4 shrink-0 mt-0.5" />
            <span>{/^https?:\/\//.test(item.location)
              ? <a href={item.location} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 break-all">{item.location}</a>
              : item.location}</span>
          </p>
        ) : null}
        {/* Botón prominente para unirse cuando el lugar es un enlace de reunión (Meet/Zoom). */}
        {item.location && /^https?:\/\//.test(item.location) ? (
          <a href={item.location} target="_blank" rel="noopener noreferrer" className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            <Video className="size-4" /> Unirse a la reunión
          </a>
        ) : null}
        {/* RSVP: solo si el usuario actual es invitado de esta cita (Sí / Tal vez / No). */}
        {item.kind === "event" && item.canRsvp && item.eventId ? (
          <RsvpBar eventId={item.eventId} myStatus={item.myStatus} />
        ) : null}
        {item.description ? <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm text-foreground/90">{item.description}</p> : null}
        {item.guests && item.guests.length > 0 ? (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Invitados externos</p>
            <div className="flex flex-wrap gap-1.5">
              {item.guests.map((g) => (
                <span key={g} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"><Mail className="size-3.5 text-muted-foreground" /> {g}</span>
              ))}
            </div>
          </div>
        ) : null}
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
        <AddToCalendarMenu item={item} />
        {item.link ? (
          <a href={item.link} className="inline-flex w-full items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Abrir</a>
        ) : null}
        {item.canEdit && item.eventId ? <EventControls item={item} onClose={onClose} /> : null}
      </div>
    </div>
  );
}

// Barra de RSVP (¿asistirás?) para el invitado de una cita: Sí / Tal vez / No. Llama al server
// action respondToEvent, que actualiza CalendarAttendee.status, avisa al organizador y re-escribe
// el .ics (PARTSTAT) en los Synology conectados. Optimista: marca la respuesta al instante.
const RSVP_OPTS: { key: string; label: string; icon: string; on: string }[] = [
  { key: "ACCEPTED", label: "Sí", icon: "✓", on: "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  { key: "TENTATIVE", label: "Tal vez", icon: "?", on: "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  { key: "DECLINED", label: "No", icon: "✕", on: "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300" },
];

function RsvpBar({ eventId, myStatus }: { eventId: string; myStatus?: string | null }) {
  const [pending, start] = React.useTransition();
  const [choice, setChoice] = React.useState<string | null>(myStatus ?? null);
  React.useEffect(() => { setChoice(myStatus ?? null); }, [myStatus]);
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">¿Asistirás?</p>
      <div className="flex items-center gap-1.5">
        {RSVP_OPTS.map((o) => {
          const active = choice === o.key;
          return (
            <button
              key={o.key}
              type="button"
              disabled={pending}
              onClick={() => { setChoice(o.key); start(async () => { await respondToEvent(eventId, o.key); }); }}
              className={cn(
                "flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
                active ? o.on : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {o.icon} {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Menú «Añadir a mi calendario»: enlaces a Google/Outlook y descarga .ics (Apple y cualquier
// otro). Sirve para citas, entregas y rodajes — todo lo que tiene fecha. No necesita conexión
// previa: la conversión de zona horaria es la misma que usa el .ics del sistema (toInstant).
function AddToCalendarMenu({ item }: { item: CalItem }) {
  const [open, setOpen] = React.useState(false);
  const start = new Date(item.start ?? item.date);
  if (Number.isNaN(start.getTime())) return null;
  const exp: CalExport = {
    uid: item.eventId ? `${item.eventId}@labstreamsas.com` : item.taskId ? `task-${item.taskId}@labstreamsas.com` : undefined,
    title: item.title,
    start,
    end: item.end ? new Date(item.end) : null,
    // Las citas usan su bandera; entregas/rodajes/hitos sin hora son de todo el día.
    allDay: item.allDay ?? item.kind !== "event",
    location: item.location ?? null,
    description: item.description ?? null,
  };
  const chip = "inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent";
  return (
    <div className="border-t border-border pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <span className="inline-flex items-center gap-1.5"><CalendarPlus className="size-4" /> Añadir a mi calendario</span>
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <a href={googleCalUrl(exp)} target="_blank" rel="noopener noreferrer" className={chip}>Google</a>
          <button type="button" onClick={() => downloadIcs(exp)} className={chip}>Apple</button>
          <a href={outlookCalUrl(exp)} target="_blank" rel="noopener noreferrer" className={chip}>Outlook</a>
          <button type="button" onClick={() => downloadIcs(exp)} className={chip}><Download className="size-3.5" /> .ics</button>
        </div>
      ) : null}
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
