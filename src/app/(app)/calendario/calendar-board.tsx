"use client";

import * as React from "react";
import { CalendarDays, Check, GanttChartSquare, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { avatarHex } from "@/lib/ui";
import { MyCalendar, type CalItem, type TeamMember } from "./my-calendar";
import { WeekView } from "./week-view";
import { AgendaView } from "./agenda-view";
import { MiniCalendar } from "./mini-calendar";
import { CalendarStatsPanel } from "./calendar-stats";
import { computeCalendarStats } from "./stats-data";
import { EventModal, type EventModalState } from "./event-modal";
import { CAL_CREATE_EVENT, CAL_EDIT_EVENT, CAL_DETAIL_EVENT, CalendarDetailCard, emitCalendarCreate, type ColorBy } from "./calendar-detail";

const pad = (n: number) => String(n).padStart(2, "0");
// Los campos UTC del Date guardado SON la hora de pared (la app guarda en UTC sin convertir,
// el contenedor corre en UTC). Por eso al precargar el formulario de edición se leen en UTC:
// si se usara getHours() del navegador, en Colombia (UTC-5) saldría 5 horas antes.
function wallDate(d: Date) { return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
function wallTime(d: Date) { return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; }
// Fecha LOCAL "YYYY-MM-DD" (para crear en el día ancla del shell).
function localDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Vistas del calendario profesional (shell tipo Google): Día · Semana · Mes · Agenda.
type ShellView = "dia" | "semana" | "mes" | "agenda";
const SHELL_VIEWS: { key: ShellView; label: string }[] = [
  { key: "dia", label: "Día" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "agenda", label: "Agenda" },
];
// Capas de «Mis calendarios» (por tipo de evento). El color casa con calTone().solid.
const KIND_LAYERS: { key: CalItem["kind"]; label: string; color: string }[] = [
  { key: "event", label: "Citas y reuniones", color: "#6366f1" },
  { key: "task", label: "Entregas", color: "#f59e0b" },
  { key: "shoot", label: "Rodajes", color: "#f43f5e" },
  { key: "milestone", label: "Hitos de proyecto", color: "#0ea5e9" },
];

// Conmutador de vistas del calendario. En modo `shell` (solo /calendario) presenta la
// experiencia completa tipo Google Calendar: mini-calendario + «Mis calendarios» a la izquierda,
// Día/Semana/Mes/Agenda en el centro y panel de estadísticas a la derecha. En los calendarios
// EMBEBIDOS (proyecto, cliente) se conserva la interfaz compacta de siempre (Semana/Mes).
export function CalendarBoard({
  items,
  onCreate,
  team = [],
  projectId = null,
  detailMode = "inline",
  defaultView = "semana",
  timelineNode = null,
  shell = false,
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
  // Experiencia completa (mini-calendario + capas + estadísticas + Día/Agenda). Solo /calendario.
  shell?: boolean;
}) {
  const [view, setView] = React.useState<"semana" | "mes">(defaultView);
  // En móvil la vista Semana (7 columnas × 24 horas) es ilegible; arranca en Mes. No se
  // persiste la vista, así que esto solo fija el ARRANQUE: el usuario puede tocar "Semana".
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setView("mes");
  }, []);
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

  // ── Estado del shell (fecha ancla + vista de 4 + capas ocultas), persistido ──
  const [anchor, setAnchor] = React.useState<Date>(() => new Date());
  const [shellView, setShellView] = React.useState<ShellView>("mes");
  const [hiddenKinds, setHiddenKinds] = React.useState<Set<string>>(() => new Set());
  const [hiddenPeople, setHiddenPeople] = React.useState<Set<string>>(() => new Set());
  React.useEffect(() => {
    if (!shell || typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem("cal:view:v1");
      if (v === "dia" || v === "semana" || v === "mes" || v === "agenda") setShellView(v);
      const hk = window.localStorage.getItem("cal:hiddenKinds:v1");
      if (hk) setHiddenKinds(new Set(JSON.parse(hk) as string[]));
      const hp = window.localStorage.getItem("cal:hiddenPeople:v1");
      if (hp) setHiddenPeople(new Set(JSON.parse(hp) as string[]));
    } catch { /* localStorage no disponible: valores por defecto */ }
    if (window.innerWidth < 768) setShellView("mes");
  }, [shell]);
  const pickShellView = (v: ShellView) => {
    setShellView(v);
    try { window.localStorage.setItem("cal:view:v1", v); } catch { /* ignore */ }
  };
  const toggleKind = (k: string) => setHiddenKinds((prev) => {
    const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k);
    try { window.localStorage.setItem("cal:hiddenKinds:v1", JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });
  const togglePerson = (name: string) => setHiddenPeople((prev) => {
    const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name);
    try { window.localStorage.setItem("cal:hiddenPeople:v1", JSON.stringify([...n])); } catch { /* ignore */ }
    return n;
  });

  // Personas presentes en los items (responsables + asistentes), para el filtro (no-shell).
  const people = React.useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.assignee) set.add(it.assignee.name);
      for (const a of it.attendees ?? []) set.add(a.name);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [items]);
  // Personas con su color (para «Mis calendarios» del shell).
  const peopleWithColor = React.useMemo(() => {
    const map = new Map<string, string | null>();
    for (const it of items) {
      if (it.assignee && !map.has(it.assignee.name)) map.set(it.assignee.name, it.assignee.color);
      for (const a of it.attendees ?? []) if (!map.has(a.name)) map.set(a.name, a.color);
    }
    return [...map.entries()].map(([name, color]) => ({ name, color })).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  // Items a mostrar (no-shell): filtro por persona única (select).
  const shownItems = React.useMemo(() => {
    if (!personFilter) return items;
    return items.filter((it) => it.assignee?.name === personFilter || (it.attendees ?? []).some((a) => a.name === personFilter));
  }, [items, personFilter]);

  // Items a mostrar (shell): oculta capas por tipo y por persona.
  const shellItems = React.useMemo(() => items.filter((it) => {
    if (hiddenKinds.has(it.kind)) return false;
    const ppl = [it.assignee?.name, ...(it.attendees ?? []).map((a) => a.name)].filter(Boolean) as string[];
    if (ppl.length && ppl.every((n) => hiddenPeople.has(n))) return false;
    return true;
  }), [items, hiddenKinds, hiddenPeople]);

  // Días con eventos (para el punto del mini-calendario) y estadísticas del rango visible.
  const markers = React.useMemo(() => new Set(shellItems.map((it) => it.date.slice(0, 10))), [shellItems]);
  const stats = React.useMemo(() => computeCalendarStats(shellItems, anchor), [shellItems, anchor]);

  // Navegación del shell según la vista (mes/semana/día/agenda).
  const navShell = (dir: -1 | 1) => setAnchor((a) => {
    const d = new Date(a);
    if (shellView === "mes") d.setMonth(d.getMonth() + dir);
    else if (shellView === "semana") d.setDate(d.getDate() + dir * 7);
    else if (shellView === "dia") d.setDate(d.getDate() + dir);
    else d.setDate(d.getDate() + dir * 30);
    return d;
  });
  const shellTitle = shellView === "dia"
    ? cap(new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(anchor))
    : shellView === "agenda"
      ? "Agenda · próximos 30 días"
      : cap(new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(anchor));

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

  // Conmutador Calendario/Cronograma (compartido).
  const cronoSwitch = timelineNode ? (
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
  ) : null;

  // Conmutador Color (tipo/persona), compartido.
  const colorSwitch = (
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
  );

  // El modal de crear/editar y el detalle inline se renderizan una sola vez (comunes a ambos modos).
  const overlays = (
    <>
      {modal && onCreate ? <EventModal state={modal} team={team} onClose={() => setModal(null)} /> : null}
      {detailMode === "inline" && detail ? (
        <div className="fixed inset-0 z-40 flex items-start justify-end bg-black/30 p-4 sm:p-6" onClick={() => setDetail(null)}>
          <div className="mt-2 max-h-[85vh] w-full max-w-sm overflow-hidden rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <CalendarDetailCard item={detail} onClose={() => setDetail(null)} />
          </div>
        </div>
      ) : null}
    </>
  );

  // ── Modo SHELL: experiencia completa tipo Google Calendar ──
  if (shell) {
    return (
      <div className="flex h-full flex-col gap-3">
        {/* Barra superior: cal/crono + Hoy/‹/›/título · vistas + color */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {cronoSwitch}
            {showingCrono ? null : (
              <div className="flex items-center gap-1">
                <button onClick={() => setAnchor(new Date())} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">Hoy</button>
                <button onClick={() => navShell(-1)} aria-label="Anterior" className="rounded-md border border-border px-2 py-1.5 text-sm hover:bg-muted">‹</button>
                <button onClick={() => navShell(1)} aria-label="Siguiente" className="rounded-md border border-border px-2 py-1.5 text-sm hover:bg-muted">›</button>
                <h3 className="ml-1 text-sm font-semibold capitalize">{shellTitle}</h3>
              </div>
            )}
          </div>
          {showingCrono ? null : (
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
                {SHELL_VIEWS.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => pickShellView(v.key)}
                    className={cn("rounded-md px-2.5 py-1 text-sm font-medium transition-colors", shellView === v.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              {colorSwitch}
            </div>
          )}
        </div>

        {showingCrono ? (
          <div className="min-h-0 flex-1 overflow-auto">{timelineNode}</div>
        ) : (
          <div className="flex min-h-0 flex-1 gap-4">
            {/* Sidebar: crear + mini-calendario + Mis calendarios */}
            <aside className="hidden w-56 shrink-0 flex-col gap-4 overflow-y-auto pr-1 lg:flex">
              {onCreate ? (
                <button
                  onClick={() => emitCalendarCreate(localDateStr(anchor))}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  <Plus className="size-4" /> Crear
                </button>
              ) : null}
              <MiniCalendar anchor={anchor} onSelect={setAnchor} markers={markers} />
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mis calendarios</p>
                <div className="space-y-1.5">
                  {KIND_LAYERS.map((L) => {
                    const on = !hiddenKinds.has(L.key);
                    return (
                      <label key={L.key} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input type="checkbox" checked={on} onChange={() => toggleKind(L.key)} className="sr-only" />
                        <span className="flex size-4 shrink-0 items-center justify-center rounded" style={{ background: on ? L.color : "transparent", border: `1.5px solid ${L.color}` }}>
                          {on ? <Check className="size-3 text-white" /> : null}
                        </span>
                        <span className={cn("truncate", on ? "" : "text-muted-foreground")}>{L.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              {peopleWithColor.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personas</p>
                  <div className="max-h-56 space-y-1.5 overflow-y-auto">
                    {peopleWithColor.map((p) => {
                      const on = !hiddenPeople.has(p.name);
                      const hex = p.color ? avatarHex(p.color) : "#6366f1";
                      return (
                        <label key={p.name} className="flex cursor-pointer items-center gap-2 text-sm">
                          <input type="checkbox" checked={on} onChange={() => togglePerson(p.name)} className="sr-only" />
                          <span className="flex size-4 shrink-0 items-center justify-center rounded-full" style={{ background: on ? hex : "transparent", border: `1.5px solid ${hex}` }}>
                            {on ? <Check className="size-2.5 text-white" /> : null}
                          </span>
                          <span className={cn("truncate", on ? "" : "text-muted-foreground")}>{p.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </aside>

            {/* Centro: la vista activa */}
            <div className="flex min-h-0 flex-1 flex-col">
              {shellView === "mes" ? (
                <div className="min-h-0 flex-1 overflow-y-auto"><MyCalendar items={shellItems} canCreate={Boolean(onCreate)} colorBy={colorBy} anchor={anchor} onAnchorChange={setAnchor} /></div>
              ) : shellView === "agenda" ? (
                <AgendaView items={shellItems} anchor={anchor} days={30} colorBy={colorBy} />
              ) : (
                <div className="min-h-0 flex-1"><WeekView items={shellItems} canCreate={Boolean(onCreate)} colorBy={colorBy} anchor={anchor} onAnchorChange={setAnchor} days={shellView === "dia" ? 1 : 7} /></div>
              )}
            </div>

            {/* Estadísticas de tiempo */}
            <aside className="hidden w-64 shrink-0 overflow-y-auto pl-1 xl:block">
              <CalendarStatsPanel data={stats} />
            </aside>
          </div>
        )}
        {overlays}
      </div>
    );
  }

  // ── Modo EMBEBIDO (proyecto/cliente): interfaz compacta de siempre ──
  return (
    <div className="flex h-full flex-col gap-3">
      <div className={cn("flex shrink-0 flex-wrap items-center gap-2", timelineNode ? "justify-between" : "justify-end")}>
        {cronoSwitch}
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
        {colorSwitch}
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
          {(["semana", "mes"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors", view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-4" /> {v === "semana" ? "Semana" : "Mes"}
              </span>
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
      {overlays}
    </div>
  );
}
