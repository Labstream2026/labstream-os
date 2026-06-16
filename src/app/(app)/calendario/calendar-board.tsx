"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { MyCalendar, type CalItem, type TeamMember } from "./my-calendar";
import { WeekView } from "./week-view";
import { EventModal, type EventModalState } from "./event-modal";
import { CAL_CREATE_EVENT, CAL_EDIT_EVENT, CAL_DETAIL_EVENT, CalendarDetailCard } from "./calendar-detail";

const pad = (n: number) => String(n).padStart(2, "0");
function localDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function localTime(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

// Conmutador de vistas del calendario: Semana (rejilla por horas) o Mes (rejilla
// mensual). Aloja el modal de crear/editar citas. El detalle de la cita se muestra
// en el dock (sólo en /calendario) o aquí mismo en un panel (detailMode="inline"),
// para que CUALQUIER calendario de la app (proyecto, cliente, mis tareas) tenga las
// mismas opciones: crear, editar, borrar, arrastrar, asistentes e invitados.
export function CalendarBoard({
  items,
  onCreate,
  team = [],
  projectId = null,
  detailMode = "inline",
  defaultView = "semana",
}: {
  items: CalItem[];
  onCreate?: (fd: FormData) => Promise<void>;
  team?: TeamMember[];
  projectId?: string | null;
  detailMode?: "dock" | "inline";
  defaultView?: "semana" | "mes";
}) {
  const [view, setView] = React.useState<"semana" | "mes">(defaultView);
  const [modal, setModal] = React.useState<EventModalState | null>(null);
  const [detail, setDetail] = React.useState<CalItem | null>(null);

  React.useEffect(() => {
    const onCreateEv = (e: Event) => {
      const { date, time } = (e as CustomEvent<{ date: string; time?: string }>).detail;
      setDetail(null);
      setModal({ mode: "create", date, time, projectId });
    };
    const onEditEv = (e: Event) => {
      const it = (e as CustomEvent<CalItem>).detail;
      if (!it?.eventId) return;
      const start = new Date(it.start ?? it.date);
      const end = it.end ? new Date(it.end) : null;
      setDetail(null);
      setModal({
        mode: "edit",
        eventId: it.eventId,
        title: it.title,
        date: localDate(start),
        time: it.allDay ? "" : localTime(start),
        endTime: end && !it.allDay ? localTime(end) : "",
        description: it.description ?? "",
        location: it.location ?? "",
        attendeeIds: it.attendeeIds ?? [],
        guests: it.guests ?? [],
      });
    };
    const onDetailEv = (e: Event) => {
      if (detailMode !== "inline") return;
      setDetail((e as CustomEvent<CalItem | null>).detail ?? null);
    };
    window.addEventListener(CAL_CREATE_EVENT, onCreateEv);
    window.addEventListener(CAL_EDIT_EVENT, onEditEv);
    window.addEventListener(CAL_DETAIL_EVENT, onDetailEv);
    return () => {
      window.removeEventListener(CAL_CREATE_EVENT, onCreateEv);
      window.removeEventListener(CAL_EDIT_EVENT, onEditEv);
      window.removeEventListener(CAL_DETAIL_EVENT, onDetailEv);
    };
  }, [projectId, detailMode]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg bg-muted p-1">
        {(["semana", "mes"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors", view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {v === "semana" ? "🗓️ Semana" : "📅 Mes"}
          </button>
        ))}
      </div>
      {view === "semana" ? (
        <div className="min-h-0 flex-1"><WeekView items={items} canCreate={Boolean(onCreate)} /></div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto"><MyCalendar items={items} canCreate={Boolean(onCreate)} /></div>
      )}

      {modal && onCreate ? <EventModal state={modal} team={team} onClose={() => setModal(null)} /> : null}

      {/* Detalle en panel propio (cuando no está el dock del calendario disponible) */}
      {detailMode === "inline" && detail ? (
        <div className="fixed inset-0 z-40 flex items-start justify-end bg-black/30 p-4 sm:p-6" onClick={() => setDetail(null)}>
          <div className="mt-2 max-h-[85vh] w-full max-w-sm overflow-hidden rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <CalendarDetailCard item={detail} onClose={() => setDetail(null)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
