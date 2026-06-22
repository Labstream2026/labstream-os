"use client";

import * as React from "react";
import { CalendarDays, GanttChartSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { MyCalendar, type CalItem, type TeamMember } from "./my-calendar";
import { WeekView } from "./week-view";
import { EventModal, type EventModalState } from "./event-modal";
import { CAL_CREATE_EVENT, CAL_EDIT_EVENT, CAL_DETAIL_EVENT, CalendarDetailCard, type ColorBy } from "./calendar-detail";

const pad = (n: number) => String(n).padStart(2, "0");
// Los campos UTC del Date guardado SON la hora de pared (la app guarda en UTC sin convertir,
// el contenedor corre en UTC). Por eso al precargar el formulario de edición se leen en UTC:
// si se usara getHours() del navegador, en Colombia (UTC-5) saldría 5 horas antes.
function wallDate(d: Date) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function wallTime(d: Date) { return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; }

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
  timelineNode = null,
}: {
  items: CalItem[];
  onCreate?: (fd: FormData) => Promise<void>;
  team?: TeamMember[];
  projectId?: string | null;
  detailMode?: "dock" | "inline";
  defaultView?: "semana" | "mes";
  // Si se pasa, la barra muestra el conmutador Calendario/Cronograma (mismo renglón) y al
  // elegir "Cronograma" se renderiza este nodo en lugar de la rejilla. Compacta la interfaz.
  timelineNode?: React.ReactNode | null;
}) {
  const [view, setView] = React.useState<"semana" | "mes">(defaultView);
  const [colorBy, setColorBy] = React.useState<ColorBy>("tipo");
  const [personFilter, setPersonFilter] = React.useState<string>("");
  const [modal, setModal] = React.useState<EventModalState | null>(null);
  const [detail, setDetail] = React.useState<CalItem | null>(null);
  // Vista principal: calendario o cronograma (solo si hay timelineNode). Preferencia
  // persistida con la misma clave que usaba el conmutador anterior.
  const [mainView, setMainView] = React.useState<"cal" | "crono">("cal");
  React.useEffect(() => {
    if (!timelineNode) return;
    if (window.localStorage.getItem("calendario-vista") === "crono") setMainView("crono");
  }, [timelineNode]);
  const pickMain = (v: "cal" | "crono") => {
    setMainView(v);
    window.localStorage.setItem("calendario-vista", v);
  };
  const showingCrono = Boolean(timelineNode) && mainView === "crono";

  // Personas presentes en los items (responsables + asistentes), para el filtro.
  const people = React.useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.assignee) set.add(it.assignee.name);
      for (const a of it.attendees ?? []) set.add(a.name);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [items]);
  // Items a mostrar: si hay filtro de persona, solo donde participa esa persona.
  const shownItems = React.useMemo(() => {
    if (!personFilter) return items;
    return items.filter((it) => it.assignee?.name === personFilter || (it.attendees ?? []).some((a) => a.name === personFilter));
  }, [items, personFilter]);

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
        date: wallDate(start),
        time: it.allDay ? "" : wallTime(start),
        endTime: end && !it.allDay ? wallTime(end) : "",
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
      <div className={cn("flex shrink-0 flex-wrap items-center gap-2", timelineNode ? "justify-between" : "justify-end")}>
        {/* Conmutador Calendario/Cronograma: a la izquierda, en el MISMO renglón que los
            controles, para compactar y ver más del calendario/cronograma. */}
        {timelineNode ? (
          <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
            {(["cal", "crono"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => pickMain(v)}
                className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors", mainView === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {v === "cal" ? <><CalendarDays className="size-4" /> Calendario</> : <><GanttChartSquare className="size-4" /> Cronograma</>}
              </button>
            ))}
          </div>
        ) : null}
        {/* Controles propios del calendario: ocultos en vista Cronograma. */}
        {showingCrono ? null : (
        <div className="flex flex-wrap items-center gap-2">
        {/* Filtro por persona: ver el calendario de un colaborador */}
        {people.length > 1 ? (
          <select
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
            className="max-w-[160px] truncate rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
            title="Filtrar por persona"
          >
            <option value="">👥 Todo el equipo</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : null}
        {/* Color por: tipo de evento o persona responsable */}
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1 text-xs">
          <span className="px-1.5 text-muted-foreground">Color:</span>
          {(["tipo", "persona"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setColorBy(c)}
              className={cn("rounded-md px-2 py-1 font-medium capitalize transition-colors", colorBy === c ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {c === "tipo" ? "Tipo" : "Persona"}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
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
        </div>
        )}
      </div>
      {showingCrono ? (
        <div className="min-h-0 flex-1 overflow-auto">{timelineNode}</div>
      ) : view === "semana" ? (
        <div className="min-h-0 flex-1"><WeekView items={shownItems} canCreate={Boolean(onCreate)} colorBy={colorBy} /></div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto"><MyCalendar items={shownItems} canCreate={Boolean(onCreate)} colorBy={colorBy} /></div>
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
