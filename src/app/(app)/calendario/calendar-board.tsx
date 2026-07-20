"use client";

import * as React from "react";
import { CalendarDays, Check, ChevronDown, GanttChartSquare, PieChart, Plus, Users } from "lucide-react";
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
const KIND_LAYERS: { key: CalItem["kind"]; label: string; short: string; emoji: string; color: string }[] = [
  { key: "event", label: "Citas y reuniones", short: "Citas", emoji: "📅", color: "#6366f1" },
  { key: "task", label: "Entregas", short: "Entregas", emoji: "📦", color: "#f59e0b" },
  { key: "shoot", label: "Rodajes", short: "Rodajes", emoji: "🎬", color: "#f43f5e" },
  { key: "milestone", label: "Hitos de proyecto", short: "Hitos", emoji: "🚩", color: "#0ea5e9" },
];

// Vistas del calendario EMBEBIDO (proyecto/cliente): ahora también Agenda y Día.
type EmbView = "agenda" | "dia" | "semana" | "mes";
const EMB_VIEWS: { key: EmbView; label: string }[] = [
  { key: "agenda", label: "Agenda" },
  { key: "dia", label: "Día" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
];
// Fechas del strip «Próximo»: los items guardan la hora de pared en campos UTC → se formatea en UTC.
const NEXT_DAY_FMT = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const MONTH_FMT = new Intl.DateTimeFormat("es-CO", { month: "short" });
// «en 3 h» / «mañana» / «en 2 días», comparando instantes de pared.
function relWall(targetMs: number, nowMs: number): string {
  const d = Math.floor(targetMs / 86_400_000) - Math.floor(nowMs / 86_400_000);
  if (d <= 0) {
    const h = Math.round((targetMs - nowMs) / 3_600_000);
    return h <= 0 ? "ya" : h === 1 ? "en 1 h" : `en ${h} h`;
  }
  return d === 1 ? "mañana" : `en ${d} días`;
}

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
  const [view, setView] = React.useState<EmbView>(defaultView);
  // Vista embebida: restaura la última elegida EN ESTA SUPERFICIE (clave por ruta: cada
  // proyecto/cliente recuerda la suya). Sin guardada, en móvil arranca en Mes (la semana de
  // 7 columnas es ilegible en pantalla chica).
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    let v: EmbView | null = null;
    try {
      const s = window.localStorage.getItem(`cal:embview:${window.location.pathname}`);
      if (s === "agenda" || s === "dia" || s === "semana" || s === "mes") v = s;
    } catch { /* ignore */ }
    if (!v && window.innerWidth < 768) v = "mes";
    if (v) setView(v);
  }, []);
  const pickView = (v: EmbView) => {
    setView(v);
    try { window.localStorage.setItem(`cal:embview:${window.location.pathname}`, v); } catch { /* ignore */ }
  };
  const [colorBy, setColorBy] = React.useState<ColorBy>("tipo");
  // Persistir el modo de color (Tipo/Persona): al reabrir el calendario se conserva el elegido.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const restore = () => {
      try { const c = window.localStorage.getItem("cal:color:v1"); if (c === "tipo" || c === "persona") setColorBy(c); } catch { /* ignore */ }
    };
    restore();
  }, []);
  const pickColorBy = (c: ColorBy) => {
    setColorBy(c);
    try { window.localStorage.setItem("cal:color:v1", c); } catch { /* ignore */ }
  };
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
    let savedView = false;
    try {
      const v = window.localStorage.getItem("cal:view:v1");
      if (v === "dia" || v === "semana" || v === "mes" || v === "agenda") { setShellView(v); savedView = true; }
      const hk = window.localStorage.getItem("cal:hiddenKinds:v1");
      if (hk) setHiddenKinds(new Set(JSON.parse(hk) as string[]));
      const hp = window.localStorage.getItem("cal:hiddenPeople:v1");
      if (hp) setHiddenPeople(new Set(JSON.parse(hp) as string[]));
    } catch { /* localStorage no disponible: valores por defecto */ }
    // Solo se fuerza Mes en móvil si NO había una vista guardada: si el usuario eligió Semana, se respeta.
    if (!savedView && window.innerWidth < 768) setShellView("mes");
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

  // Una fila de persona (casilla de color + nombre) para el desplegable «Personas».
  const personRow = (p: { name: string; color: string | null }) => {
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
  };

  // Items a mostrar (no-shell): capas por tipo + filtro por persona única (select).
  const shownItems = React.useMemo(() => items.filter((it) => {
    if (hiddenKinds.has(it.kind)) return false;
    if (personFilter && !(it.assignee?.name === personFilter || (it.attendees ?? []).some((a) => a.name === personFilter))) return false;
    return true;
  }), [items, personFilter, hiddenKinds]);

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

  // ── Piezas del calendario EMBEBIDO ──
  // «Ahora» de pared: la app guarda horas de pared en campos UTC, así que la hora local del
  // equipo (Colombia) se lee como si fuera UTC para poder comparar contra los items.
  const wallNowMs = React.useMemo(
    () => Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), anchor.getHours(), anchor.getMinutes()),
    [anchor],
  );
  // Lo PRÓXIMO del proyecto/cliente (respeta capas y filtro de persona): franja de arriba.
  const nextUp = React.useMemo(() => {
    let best: CalItem | null = null;
    let bestMs = Infinity;
    for (const it of shownItems) {
      const ms = new Date(it.start ?? it.date).getTime();
      if (!Number.isNaN(ms) && ms >= wallNowMs - 5 * 60_000 && ms < bestMs) { best = it; bestMs = ms; }
    }
    return best;
  }, [shownItems, wallNowMs]);
  // Contadores del MES visible por tipo (se pintan en las tarjetas-interruptor de capa).
  const monthKey = `${anchor.getFullYear()}-${pad(anchor.getMonth() + 1)}`;
  const kindCounts = React.useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of items) if (it.date.slice(0, 7) === monthKey) c[it.kind] = (c[it.kind] ?? 0) + 1;
    return c;
  }, [items, monthKey]);

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
          onClick={() => pickColorBy(c)}
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
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm duration-150 animate-in fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setDetail(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card shadow-2xl duration-200 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
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
            {/* Sidebar: crear + mini-calendario + Mis calendarios + desplegables (Personas y
                Estadísticas de tiempo). Todo colapsable para aprovechar el espacio; el calendario
                usa el resto del ancho (ya no hay panel a la derecha). */}
            <aside className="hidden w-56 shrink-0 flex-col gap-4 overflow-y-auto pr-1 lg:flex">
              {onCreate ? (
                <button
                  onClick={() => emitCalendarCreate(localDateStr(anchor))}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                >
                  <Plus className="size-4" /> Crear
                </button>
              ) : null}
              <div className="shrink-0"><MiniCalendar anchor={anchor} onSelect={setAnchor} markers={markers} /></div>
              <div className="shrink-0">
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
                <details className="group shrink-0" open>
                  <summary className="flex cursor-pointer list-none items-center justify-between rounded-md py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
                    <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" /> Personas · {peopleWithColor.length}</span>
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto pr-1">
                    {peopleWithColor.map(personRow)}
                  </div>
                </details>
              ) : null}
              <details className="group shrink-0" open>
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-md py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
                  <span className="inline-flex items-center gap-1.5"><PieChart className="size-3.5" /> Estadísticas de tiempo</span>
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2"><CalendarStatsPanel data={stats} /></div>
              </details>
            </aside>

            {/* Centro: la vista activa (usa todo el ancho restante) */}
            <div className="flex min-h-0 flex-1 flex-col">
              {shellView === "mes" ? (
                <div className="min-h-0 flex-1 overflow-y-auto"><MyCalendar items={shellItems} canCreate={Boolean(onCreate)} colorBy={colorBy} anchor={anchor} onAnchorChange={setAnchor} /></div>
              ) : shellView === "agenda" ? (
                <AgendaView items={shellItems} anchor={anchor} days={30} colorBy={colorBy} />
              ) : (
                <div className="min-h-0 flex-1"><WeekView items={shellItems} canCreate={Boolean(onCreate)} colorBy={colorBy} anchor={anchor} onAnchorChange={setAnchor} days={shellView === "dia" ? 1 : 7} /></div>
              )}
            </div>
          </div>
        )}
        {overlays}
      </div>
    );
  }

  // ── Modo EMBEBIDO (proyecto/cliente): Agenda/Día/Semana/Mes + «Próximo» + capas con contador ──
  const nextStart = nextUp ? new Date(nextUp.start ?? nextUp.date) : null;
  const nextPeople = nextUp
    ? [...new Set([nextUp.assignee?.name, ...(nextUp.attendees ?? []).map((a) => a.name)].filter(Boolean) as string[])]
    : [];
  const maxKindCount = Math.max(1, ...KIND_LAYERS.map((L) => kindCounts[L.key] ?? 0));
  const monthShort = MONTH_FMT.format(anchor).replace(".", "").toUpperCase();

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
          {EMB_VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => pickView(v.key)}
              className={cn("rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors", view === v.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {v.label}
            </button>
          ))}
        </div>
        </div>
        )}
      </div>

      {/* Franja «Próximo»: lo más inmediato del proyecto/cliente siempre a la vista; clic → detalle. */}
      {!showingCrono && nextUp && nextStart ? (
        <button
          type="button"
          onClick={() => setDetail(nextUp)}
          className="group flex w-full shrink-0 items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] px-3.5 py-2.5 text-left transition-colors hover:bg-primary/10"
        >
          <span className="relative flex size-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50 motion-reduce:hidden" />
            <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {KIND_LAYERS.find((L) => L.key === nextUp.kind)?.emoji} {nextUp.title}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {cap(NEXT_DAY_FMT.format(nextStart))}
              {!nextUp.allDay ? <> · {wallTime(nextStart)}{nextUp.endTime ? `–${nextUp.endTime}` : ""}</> : null}
              {" · "}
              <strong className="font-semibold text-primary">{relWall(nextStart.getTime(), wallNowMs)}</strong>
              {nextPeople.length ? <> · con {nextPeople.slice(0, 2).join(" y ")}{nextPeople.length > 2 ? ` +${nextPeople.length - 2}` : ""}</> : null}
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-primary opacity-70 transition-opacity group-hover:opacity-100">Ver →</span>
        </button>
      ) : null}

      {/* Capas por tipo con contador del mes: cada tarjeta es también el interruptor de su capa. */}
      {!showingCrono && items.length > 0 ? (
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
          {KIND_LAYERS.map((L) => {
            const on = !hiddenKinds.has(L.key);
            const n = kindCounts[L.key] ?? 0;
            return (
              <button
                key={L.key}
                type="button"
                onClick={() => toggleKind(L.key)}
                title={on ? `Ocultar ${L.label.toLowerCase()}` : `Mostrar ${L.label.toLowerCase()}`}
                className={cn("rounded-xl border px-3 py-2 text-left transition-all", on ? "border-border bg-card hover:border-border/70" : "border-dashed border-border opacity-40 hover:opacity-70")}
              >
                <span className="text-base font-bold leading-none tabular-nums">{n}</span>
                <span className="mt-0.5 block truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{L.emoji} {L.short} · {monthShort}</span>
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full transition-all" style={{ width: `${(n / maxKindCount) * 100}%`, background: L.color }} />
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {showingCrono ? (
        <div className="min-h-0 flex-1 overflow-auto">{timelineNode}</div>
      ) : view === "agenda" ? (
        <div className="min-h-0 flex-1 overflow-y-auto"><AgendaView items={shownItems} anchor={anchor} days={30} colorBy={colorBy} /></div>
      ) : view === "mes" ? (
        <div className="min-h-0 flex-1 overflow-y-auto"><MyCalendar items={shownItems} canCreate={Boolean(onCreate)} colorBy={colorBy} /></div>
      ) : (
        <div className="min-h-0 flex-1"><WeekView items={shownItems} canCreate={Boolean(onCreate)} colorBy={colorBy} days={view === "dia" ? 1 : 7} /></div>
      )}
      {overlays}
    </div>
  );
}
