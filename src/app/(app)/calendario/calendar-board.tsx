"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { MyCalendar, type CalItem, type TeamMember } from "./my-calendar";
import { WeekView } from "./week-view";
import { EventModal, type EventModalState } from "./event-modal";
import { CAL_CREATE_EVENT, CAL_EDIT_EVENT } from "./calendar-detail";

const pad = (n: number) => String(n).padStart(2, "0");
function localDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function localTime(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

// Conmutador de vistas del calendario del equipo: Semana (rejilla detallada por
// horas con panel de detalle) o Mes (rejilla mensual). Aloja el modal de crear/editar
// citas, que cualquiera de las vistas (o el detalle del dock) abre por evento de ventana.
export function CalendarBoard({ items, onCreate, team = [] }: { items: CalItem[]; onCreate?: (fd: FormData) => Promise<void>; team?: TeamMember[] }) {
  const [view, setView] = React.useState<"semana" | "mes">("semana");
  const [modal, setModal] = React.useState<EventModalState | null>(null);

  React.useEffect(() => {
    const onCreateEv = (e: Event) => {
      const { date, time } = (e as CustomEvent<{ date: string; time?: string }>).detail;
      setModal({ mode: "create", date, time });
    };
    const onEditEv = (e: Event) => {
      const it = (e as CustomEvent<CalItem>).detail;
      if (!it?.eventId) return;
      const start = new Date(it.start ?? it.date);
      const end = it.end ? new Date(it.end) : null;
      setModal({
        mode: "edit",
        eventId: it.eventId,
        title: it.title,
        date: localDate(start),
        time: it.allDay ? "" : localTime(start),
        endTime: end && !it.allDay ? localTime(end) : "",
        description: it.description ?? "",
        attendeeIds: it.attendeeIds ?? [],
      });
    };
    window.addEventListener(CAL_CREATE_EVENT, onCreateEv);
    window.addEventListener(CAL_EDIT_EVENT, onEditEv);
    return () => {
      window.removeEventListener(CAL_CREATE_EVENT, onCreateEv);
      window.removeEventListener(CAL_EDIT_EVENT, onEditEv);
    };
  }, []);

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
    </div>
  );
}
