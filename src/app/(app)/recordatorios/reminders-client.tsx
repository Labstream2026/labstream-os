"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pause, Play, Trash2, Loader2, Check, Clock, Pencil, X, Users, ArrowUpRight, Bell, Star, SlidersHorizontal } from "lucide-react";
import { IconRecordatorios } from "@/components/icons";
import { UserAvatar } from "@/components/user-avatar";
import { parseReminderText, type ParsedReminder } from "@/lib/reminder-parse";
import { EmojiPicker } from "@/components/chat/emoji-picker";
import { EntityEmoji, SECTOR_MARKS, PROJECT_MARKS } from "@/components/icons/marks";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  describeSchedule,
  WEEKDAY_LABELS,
  REMINDER_COLORS,
  reminderColorHex,
  PRIORITY_LABELS,
} from "@/lib/reminder-schedule";
import { cn } from "@/lib/utils";
import {
  createReminder,
  updateReminder,
  toggleReminder,
  deleteReminder,
  snoozeReminder,
  completeReminder,
  type NewReminderInput,
} from "./actions";

export type AlertRow = { id: string; fireAtIso: string; offsetMin: number | null; sentAtIso: string | null; active: boolean };
export type ReminderRow = {
  id: string;
  title: string;
  notes: string | null;
  icon: string | null;
  color: string | null;
  priority: number;
  frequency: string;
  weekdays: string | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  untilYmd: string | null;
  maxFires: number | null;
  nextFireAtIso: string;
  lastFiredAtIso: string | null;
  doneAtIso: string | null;
  active: boolean;
  forUser: { id: string; name: string };
  createdBy: { id: string; name: string };
  task: { id: string; title: string } | null;
  event: { id: string; title: string } | null;
  alerts: AlertRow[];
  canManage: boolean;
};
export type TeamOption = { id: string; name: string; initials: string | null; avatarColor: string | null; avatarUrl: string | null };
export type AnchorTask = { id: string; title: string; dueIso: string | null; dueTime: string | null };
export type AnchorEvent = { id: string; title: string; startIso: string };

const FMT = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const bogCA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" });
function bogYmd(ms: number): string {
  return bogCA.format(new Date(ms));
}
function bogotaTomorrowYmd(): string {
  const ymd = bogYmd(Date.now());
  return new Date(new Date(`${ymd}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
}
// Hora de pared de Bogotá "HH:mm" de un instante (para prefill de edición).
const bogTimeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });

function relativo(iso: string, nowMs: number): string {
  const ms = new Date(iso).getTime() - nowMs;
  if (ms <= 0) return "ya";
  const min = Math.round(ms / 60000);
  if (min < 60) return `en ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `en ${h} h`;
  return `en ${Math.round(h / 24)} días`;
}

function humanOffset(m: number): string {
  if (m === 0) return "al empezar";
  if (m < 60) return `${m} min antes`;
  if (m < 1440) return `${Math.round(m / 60)} h antes`;
  const d = Math.round(m / 1440);
  return d === 1 ? "1 día antes" : `${d} días antes`;
}

// Instante real (UTC) de una cita: el calendario guarda "hora de pared en UTC" (+5 h).
function eventInstantMs(startIso: string): number {
  return new Date(startIso).getTime() + 5 * 3_600_000;
}
// Instante real (UTC) de una tarea: su fecha + hora de pared de Bogotá (o 09:00).
function taskInstantMs(dueIso: string, dueTime: string | null): number {
  const ymd = dueIso.slice(0, 10);
  const hhmm = dueTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime) ? dueTime : "09:00";
  return new Date(`${ymd}T${hhmm}:00.000-05:00`).getTime();
}

const FREQ_OPTIONS = [
  { key: "UNA_VEZ", label: "Una vez" },
  { key: "DIARIO", label: "Cada día" },
  { key: "SEMANAL", label: "Cada semana" },
  { key: "MENSUAL", label: "Cada mes" },
] as const;
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const OFFSET_OPTIONS = [
  { m: 0, label: "al empezar" },
  { m: 15, label: "15 min antes" },
  { m: 60, label: "1 h antes" },
  { m: 180, label: "3 h antes" },
  { m: 1440, label: "1 día antes" },
];
const SNOOZE_OPTIONS = [
  { k: "10m", label: "+10 minutos" },
  { k: "1h", label: "+1 hora" },
  { k: "3h", label: "+3 horas" },
  { k: "tarde", label: "Esta tarde (18:00)" },
  { k: "manana", label: "Mañana 8:00" },
  { k: "semana", label: "En una semana" },
];
const inputCls = "rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

// ── Plantillas (localStorage, por dispositivo) ──
// Se leen con useSyncExternalStore (nada de setState en efectos): el servidor ve "[]" y el
// cliente se sincroniza solo tras hidratar. Un evento propio avisa los cambios de esta pestaña.
export type ReminderTemplate = {
  id: string;
  title: string;
  icon: string | null;
  color: string | null;
  priority: number;
  frequency: string;
  timeOfDay: string;
  weekdays: number[];
  dayOfMonth: number;
};
const TPL_KEY = "lsos:reminder-tpl:v1";
const TPL_EVENT = "lsos:reminder-tpl-changed";
function subscribeTpl(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  window.addEventListener(TPL_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(TPL_EVENT, cb);
  };
}
function readTplRaw(): string {
  try { return window.localStorage.getItem(TPL_KEY) ?? "[]"; } catch { return "[]"; }
}
function writeTpls(list: ReminderTemplate[]): void {
  try { window.localStorage.setItem(TPL_KEY, JSON.stringify(list.slice(0, 12))); } catch {}
  try { window.dispatchEvent(new Event(TPL_EVENT)); } catch {}
}

// Prefill del formulario (viene de la captura rápida o de una plantilla).
type FormPrefill = {
  title?: string;
  icon?: string | null;
  color?: string | null;
  priority?: number;
  frequency?: string;
  alerts?: { date: string; time: string }[];
  timeOfDay?: string;
  weekdays?: number[];
  dayOfMonth?: number;
};

type DrawerState = { mode: "new"; prefill?: FormPrefill; seq: number } | { mode: "edit"; row: ReminderRow } | null;

// ── Reloj vivo ──
// Tick de 30 s vía useSyncExternalStore (nada de setState en efectos). El snapshot se CUANTIZA
// al tick para que sea estable entre renders (Date.now() crudo re-renderizaría sin parar); en el
// servidor/hidratación se usa el nowMs de la página cuantizado igual (HTML consistente).
const NOW_TICK = 30_000;
function subscribeNowTick(cb: () => void): () => void {
  const id = window.setInterval(cb, NOW_TICK);
  return () => window.clearInterval(id);
}
function readNowTick(): number {
  return Math.floor(Date.now() / NOW_TICK) * NOW_TICK;
}
function quantize(ms: number): number {
  return Math.floor(ms / NOW_TICK) * NOW_TICK;
}

// Nombre corto para las píldoras de «Para»: primer nombre + inicial del segundo.
function shortName(name: string): string {
  const words = name.split(/\s+[-–—]\s+/)[0].trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return name;
  return words.length === 1 ? words[0] : `${words[0]} ${words[1][0]}.`;
}

export function RemindersClient({
  rows,
  team,
  anchorTasks,
  anchorEvents,
  meId,
  nowMs,
}: {
  rows: ReminderRow[];
  team: TeamOption[];
  anchorTasks: AnchorTask[];
  anchorEvents: AnchorEvent[];
  meId: string;
  nowMs: number;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  // «Ahora» vivo: avanza cada 30 s → cuenta regresiva del destacado, marcador «ahora» del
  // timeline y agrupación por día siempre al día aunque la pestaña quede abierta.
  const now = React.useSyncExternalStore(subscribeNowTick, readNowTick, () => quantize(nowMs));
  // Panel deslizante: crear (con prefill opcional) o editar; null cerrado.
  const [drawer, setDrawer] = React.useState<DrawerState>(null);
  const [colorFilter, setColorFilter] = React.useState<string | null>(null);

  const closeDrawer = React.useCallback(() => setDrawer(null), []);
  // `seq` fuerza a remontar el formulario en cada apertura (para que el prefill entre limpio).
  const seqRef = React.useRef(0);
  const openNew = (prefill?: FormPrefill) => {
    seqRef.current += 1;
    setDrawer({ mode: "new", prefill, seq: seqRef.current });
  };

  // Plantillas guardadas en este dispositivo.
  const tplRaw = React.useSyncExternalStore(subscribeTpl, readTplRaw, () => "[]");
  const templates = React.useMemo<ReminderTemplate[]>(() => {
    try {
      const j = JSON.parse(tplRaw) as unknown;
      if (!Array.isArray(j)) return [];
      return j.filter((t): t is ReminderTemplate => !!t && typeof (t as { id?: unknown }).id === "string" && typeof (t as { title?: unknown }).title === "string");
    } catch {
      return [];
    }
  }, [tplRaw]);
  const saveTemplate = (t: ReminderTemplate) => writeTpls([t, ...templates.filter((x) => x.title !== t.title)]);
  const deleteTemplate = (id: string) => writeTpls(templates.filter((x) => x.id !== id));
  const applyTemplate = (t: ReminderTemplate) =>
    openNew({
      title: t.title,
      icon: t.icon,
      color: t.color,
      priority: t.priority,
      frequency: t.frequency,
      timeOfDay: t.timeOfDay,
      weekdays: t.weekdays,
      dayOfMonth: t.dayOfMonth,
      alerts: t.frequency === "UNA_VEZ" ? [{ date: bogotaTomorrowYmd(), time: t.timeOfDay }] : undefined,
    });

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) { setError(res.error ?? "No se pudo"); return; }
      router.refresh();
    });
  };

  const onDelete = async (r: ReminderRow) => {
    if (!(await confirm({ title: "Eliminar recordatorio", message: `¿Eliminar «${r.title}»? No volverá a sonar.`, confirmLabel: "Eliminar" }))) return;
    run(() => deleteReminder(r.id));
  };

  // Crear directo desde la captura rápida (lo interpretado por el parser).
  const quickCreate = (p: ParsedReminder) => {
    const input: NewReminderInput = { title: p.title, frequency: p.frequency, forUserIds: [meId] };
    if (p.frequency === "UNA_VEZ") input.alerts = p.alerts;
    else {
      input.timeOfDay = p.timeOfDay;
      if (p.frequency === "SEMANAL") input.weekdays = p.weekdays;
      if (p.frequency === "MENSUAL") input.dayOfMonth = p.dayOfMonth;
    }
    run(() => createReminder(input));
  };

  const active = rows.filter((r) => r.active && !r.doneAtIso);
  const paused = rows.filter((r) => !r.active && !r.doneAtIso);
  const done = rows.filter((r) => r.doneAtIso);

  // Destacado «Ahora sigue»: el activo más próximo (independiente del filtro de color).
  const hero = active[0] ?? null;

  // Sugeridos: tareas/citas próximas (mías) que aún no tienen recordatorio → avisar 15 min antes.
  const linkedTaskIds = new Set(rows.filter((r) => r.task).map((r) => r.task!.id));
  const linkedEventIds = new Set(rows.filter((r) => r.event).map((r) => r.event!.id));
  const suggestions: { kind: "task" | "event"; id: string; title: string; whenIso: string }[] = [];
  for (const ev of anchorEvents) {
    if (linkedEventIds.has(ev.id)) continue;
    const ms = eventInstantMs(ev.startIso);
    if (ms > now + 16 * 60_000) suggestions.push({ kind: "event", id: ev.id, title: ev.title, whenIso: new Date(ms).toISOString() });
  }
  for (const t of anchorTasks) {
    if (!t.dueIso || linkedTaskIds.has(t.id)) continue;
    const ms = taskInstantMs(t.dueIso, t.dueTime);
    if (ms > now + 16 * 60_000) suggestions.push({ kind: "task", id: t.id, title: t.title, whenIso: new Date(ms).toISOString() });
  }
  suggestions.sort((a, b) => new Date(a.whenIso).getTime() - new Date(b.whenIso).getTime());
  const shownSuggestions = suggestions.slice(0, 3);

  const addSuggestion = (s: { kind: "task" | "event"; id: string; title: string }) => {
    const input: NewReminderInput = { title: s.title, frequency: "UNA_VEZ", forUserIds: [meId], offsets: [15] };
    if (s.kind === "task") input.taskId = s.id; else input.eventId = s.id;
    run(() => createReminder(input));
  };

  // El resto de activos (sin el destacado), agrupados por día.
  const shown = (colorFilter ? active.filter((r) => r.color === colorFilter) : active).filter((r) => r.id !== hero?.id);
  const buckets: { key: string; label: string; items: ReminderRow[] }[] = [
    { key: "hoy", label: "Hoy", items: [] },
    { key: "manana", label: "Mañana", items: [] },
    { key: "semana", label: "Esta semana", items: [] },
    { key: "despues", label: "Más adelante", items: [] },
  ];
  const todayY = bogYmd(now);
  const tomY = bogYmd(now + 86_400_000);
  const weekY = bogYmd(now + 7 * 86_400_000);
  for (const r of shown) {
    const d = bogYmd(new Date(r.nextFireAtIso).getTime());
    const b = d <= todayY ? 0 : d === tomY ? 1 : d <= weekY ? 2 : 3;
    buckets[b].items.push(r);
  }

  const rowHandlers = (r: ReminderRow) => ({
    onEdit: () => setDrawer({ mode: "edit", row: r }),
    onToggle: (a: boolean) => run(() => toggleReminder(r.id, a)),
    onDone: () => run(() => completeReminder(r.id)),
    onSnooze: (k: string) => run(() => snoozeReminder(r.id, k)),
    onDelete: () => onDelete(r),
  });

  const nothing = active.length === 0 && shownSuggestions.length === 0;

  return (
    <div>
      {dialog}

      {/* Panel deslizante de crear/editar */}
      <Drawer open={drawer !== null} title={drawer?.mode === "edit" ? "Editar recordatorio" : "Nuevo recordatorio"} onClose={closeDrawer}>
        {drawer !== null ? (
          <ReminderForm
            key={drawer.mode === "edit" ? drawer.row.id : `new-${drawer.seq}`}
            initial={drawer.mode === "edit" ? drawer.row : undefined}
            prefill={drawer.mode === "new" ? drawer.prefill : undefined}
            team={team}
            anchorTasks={anchorTasks}
            anchorEvents={anchorEvents}
            meId={meId}
            onClose={closeDrawer}
            onSaved={() => { closeDrawer(); router.refresh(); }}
            onSaveTemplate={saveTemplate}
          />
        ) : null}
      </Drawer>

      {/* Captura rápida: escribe con fecha/hora («mañana 7am», «cada lunes 9:00») y crea al
          instante; «Más opciones» abre el panel completo con lo interpretado ya puesto. */}
      <QuickCapture
        nowMs={now}
        busy={pending}
        onCreate={quickCreate}
        onAdvanced={(p) =>
          openNew(
            p
              ? { title: p.title, frequency: p.frequency, alerts: p.alerts, timeOfDay: p.timeOfDay, weekdays: p.weekdays, dayOfMonth: p.dayOfMonth }
              : undefined,
          )
        }
      />

      {/* Plantillas guardadas (chips de un toque) */}
      {templates.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">Plantillas:</span>
          {templates.map((t) => (
            <span key={t.id} className="group inline-flex items-center overflow-hidden rounded-full border border-input bg-card text-xs">
              <button onClick={() => applyTemplate(t)} title="Usar esta plantilla" className="inline-flex items-center gap-1.5 py-1 pl-2.5 pr-1.5 font-medium text-foreground hover:bg-accent">
                {t.icon ? <EntityEmoji value={t.icon} fallback="⏰" /> : null} {t.title}
              </button>
              <button onClick={() => deleteTemplate(t.id)} title="Quitar plantilla" className="py-1 pl-0.5 pr-2 text-muted-foreground opacity-50 hover:text-destructive group-hover:opacity-100">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      <div className="mb-5" />

      {nothing ? (
        <EmptyState
          icon={<IconRecordatorios />}
          title="No tienes recordatorios activos"
          description="Crea el primero: puede sonar varias veces, para ti o para el equipo, y atarse a una tarea o cita."
          action={
            <button onClick={() => openNew()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="size-4" /> Crear recordatorio
            </button>
          }
        />
      ) : (
        <>
          {/* ── Destacado «Ahora sigue» ── */}
          {hero ? <NextUpHero r={hero} nowMs={now} pending={pending} {...rowHandlers(hero)} /> : null}

          {/* ── Sugeridos ── */}
          {shownSuggestions.length > 0 ? (
            <div className="mt-6">
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"><Bell className="size-3.5" /> Sugeridos</h2>
              <div className="space-y-2">
                {shownSuggestions.map((s) => (
                  <div key={`${s.kind}:${s.id}`} className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card px-4 py-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-base">{s.kind === "task" ? "📋" : "📅"}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.kind === "task" ? "Tarea" : "Cita"}: {s.title}</p>
                      <p className="text-xs text-muted-foreground" suppressHydrationWarning>{FMT.format(new Date(s.whenIso))} · sin recordatorio</p>
                    </div>
                    <button onClick={() => addSuggestion(s)} disabled={pending} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50">
                      <Plus className="size-3.5" /> Avísame 15 min antes
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── Filtro por color ── */}
          {active.length > 1 && REMINDER_COLORS.some((c) => active.some((r) => r.color === c.key)) ? (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                onClick={() => setColorFilter(null)}
                className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", !colorFilter ? "border-primary bg-primary/10 text-foreground" : "border-input text-muted-foreground hover:bg-accent")}
              >
                Todos
              </button>
              {REMINDER_COLORS.filter((c) => active.some((r) => r.color === c.key)).map((c) => (
                <button
                  key={c.key}
                  onClick={() => setColorFilter(colorFilter === c.key ? null : c.key)}
                  className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", colorFilter === c.key ? "border-foreground text-foreground" : "border-input text-muted-foreground hover:bg-accent")}
                >
                  <span className="size-2.5 rounded-full" style={{ background: c.hex }} /> {c.label}
                </button>
              ))}
            </div>
          ) : null}

          {/* ── Próximos, agrupados por día ── */}
          {buckets.map((b) =>
            b.items.length === 0 ? null : (
              <div key={b.key}>
                <h2 className="mt-7 mb-2 text-sm font-semibold text-muted-foreground">{b.label} ({b.items.length})</h2>
                {b.key === "hoy" ? (
                  // «Hoy» como línea de tiempo: hora a la izquierda, punto sobre la línea y marcador «ahora».
                  <DayTimeline items={b.items} now={now} meId={meId} pending={pending} handlers={rowHandlers} />
                ) : (
                  <div className="space-y-2">
                    {b.items.map((r) => (
                      <Row key={r.id} r={r} meId={meId} nowMs={now} pending={pending} {...rowHandlers(r)} />
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
        </>
      )}

      {/* ── Pausados ── */}
      {paused.length > 0 ? (
        <>
          <h2 className="mt-8 mb-2 text-sm font-semibold text-muted-foreground">Pausados ({paused.length})</h2>
          <div className="space-y-2 opacity-80">
            {paused.map((r) => (
              <Row key={r.id} r={r} meId={meId} nowMs={now} pending={pending} {...rowHandlers(r)} />
            ))}
          </div>
        </>
      ) : null}

      {/* ── Hechos (historial) ── */}
      {done.length > 0 ? (
        <details className="mt-8">
          <summary className="mb-2 cursor-pointer text-sm font-semibold text-muted-foreground">Hechos ({done.length})</summary>
          <div className="space-y-2 opacity-70">
            {done.map((r) => (
              <Row key={r.id} r={r} meId={meId} nowMs={now} pending={pending} {...rowHandlers(r)} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

// ── Línea de tiempo del día (vista agenda para el bloque «Hoy») ──
// Hora a la izquierda, punto del color del recordatorio sobre la línea y un marcador «ahora»
// entre lo ya pasado y lo que viene (avanza solo con el reloj vivo).
type RowHandlers = { onEdit: () => void; onToggle: (a: boolean) => void; onDone: () => void; onSnooze: (k: string) => void; onDelete: () => void };
function DayTimeline({
  items,
  now,
  meId,
  pending,
  handlers,
}: {
  items: ReminderRow[];
  now: number;
  meId: string;
  pending: boolean;
  handlers: (r: ReminderRow) => RowHandlers;
}) {
  const sorted = items.slice().sort((a, b) => new Date(a.nextFireAtIso).getTime() - new Date(b.nextFireAtIso).getTime());
  // Índice del primer elemento futuro; el marcador «ahora» va justo antes (si hay algo pasado).
  let markerIdx = sorted.findIndex((r) => new Date(r.nextFireAtIso).getTime() > now);
  if (markerIdx === -1) markerIdx = sorted.length;
  const marker = (
    <div className="relative py-0.5">
      <span className="absolute -left-[25px] top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary" />
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-primary" suppressHydrationWarning>
          ahora · {bogTimeFmt.format(new Date(now))}
        </span>
        <span className="h-px flex-1 bg-primary/30" />
      </div>
    </div>
  );
  return (
    <div className="relative ml-14 space-y-2 border-l-2 border-border/70 pl-5">
      {sorted.map((r, i) => {
        const hex = reminderColorHex(r.color) ?? "#F47A20";
        return (
          <React.Fragment key={r.id}>
            {i === markerIdx && markerIdx > 0 ? marker : null}
            <div className="relative">
              <span className="absolute -left-[78px] top-3.5 w-12 text-right text-[11px] font-semibold text-muted-foreground tabular-nums" suppressHydrationWarning>
                {bogTimeFmt.format(new Date(r.nextFireAtIso))}
              </span>
              <span className="absolute -left-[26px] top-4 size-2.5 rounded-full border-2 bg-card" style={{ borderColor: hex }} />
              <Row r={r} meId={meId} nowMs={now} pending={pending} {...handlers(r)} />
            </div>
          </React.Fragment>
        );
      })}
      {markerIdx === sorted.length && sorted.length > 0 ? marker : null}
    </div>
  );
}

// ── Captura rápida ──
// Escribes en lenguaje natural y el parser (lib/reminder-parse) interpreta fecha/hora/recurrencia;
// los chips muestran lo entendido (grises = valor por defecto). Enter o «Crear» lo crea al tiro.
function QuickCapture({
  nowMs,
  busy,
  onCreate,
  onAdvanced,
}: {
  nowMs: number;
  busy: boolean;
  onCreate: (p: ParsedReminder) => void;
  onAdvanced: (p: ParsedReminder | null) => void;
}) {
  const [text, setText] = React.useState("");
  const parsed = React.useMemo(() => (text.trim() ? parseReminderText(text, nowMs) : null), [text, nowMs]);
  const create = () => {
    if (!parsed || !parsed.title.trim() || busy) return;
    onCreate(parsed);
    setText("");
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><IconRecordatorios /></div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") create(); }}
          placeholder="¿Qué hay que recordar? Prueba «Pagar nómina el 30 a las 9» o «Estiramiento cada día 3pm»"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
        />
        <button
          onClick={() => onAdvanced(parsed)}
          title="Todas las opciones: para quién, color, prioridad, atar a tarea/cita…"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <SlidersHorizontal className="size-4" /> <span className="hidden sm:inline">Más opciones</span>
        </button>
        <button
          onClick={create}
          disabled={busy || !text.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Crear
        </button>
      </div>
      {parsed ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[46px]">
          {parsed.chips.map((c, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                c.fallback ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
              )}
            >
              {c.kind === "rec" ? "🔁" : c.kind === "date" ? "📅" : "🕐"} {c.label}{c.fallback ? " · por defecto" : ""}
            </span>
          ))}
          <span className="text-[11px] text-muted-foreground">Enter para crear · «Más opciones» para afinar</span>
        </div>
      ) : null}
    </div>
  );
}

// ── Panel deslizante (slide-over) ──
// Siempre montado: cuando está cerrado se traslada fuera de pantalla y desactiva los clics
// (pointer-events-none en el contenedor cascada a hijos). Sin desmontar → animación fluida.
function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className={cn("fixed inset-0 z-50", !open && "pointer-events-none")} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={cn("absolute inset-0 bg-black/30 backdrop-blur-[1px] transition-opacity duration-300 motion-reduce:transition-none", open ? "opacity-100" : "opacity-0")}
      />
      <div
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300 ease-[cubic-bezier(.33,1,.68,1)] motion-reduce:transition-none",
          open ? "translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><IconRecordatorios /></div>
          <h2 className="flex-1 text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Un paso numerado del formulario (qué / cuándo / opcional).
function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{n}</div>
      <div className="min-w-0 flex-1">
        <p className="mb-2 text-sm font-semibold">{label}</p>
        {children}
      </div>
    </div>
  );
}

// ── Formulario de crear/editar (dentro del panel, por pasos) ──
function ReminderForm({
  initial,
  prefill,
  team,
  anchorTasks,
  anchorEvents,
  meId,
  onClose,
  onSaved,
  onSaveTemplate,
}: {
  initial?: ReminderRow;
  prefill?: FormPrefill;
  team: TeamOption[];
  anchorTasks: AnchorTask[];
  anchorEvents: AnchorEvent[];
  meId: string;
  onClose: () => void;
  onSaved: () => void;
  onSaveTemplate: (t: ReminderTemplate) => void;
}) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  // Prefill de edición
  const relOffsets = initial ? [...new Set(initial.alerts.filter((a) => a.offsetMin != null).map((a) => a.offsetMin as number))] : [];
  const initAnchor: "none" | "task" | "event" =
    initial?.event && relOffsets.length ? "event" : initial?.task && relOffsets.length ? "task" : "none";
  const fixedAlerts = initial
    ? initial.alerts.filter((a) => a.offsetMin == null).map((a) => ({ date: bogYmd(new Date(a.fireAtIso).getTime()), time: bogTimeFmt.format(new Date(a.fireAtIso)) }))
    : [];

  const [title, setTitle] = React.useState(initial?.title ?? prefill?.title ?? "");
  const [notes, setNotes] = React.useState(initial?.notes ?? "");
  const [icon, setIcon] = React.useState(initial?.icon ?? prefill?.icon ?? "");
  const [color, setColor] = React.useState<string | null>(initial?.color ?? prefill?.color ?? null);
  const [priority, setPriority] = React.useState(initial?.priority ?? prefill?.priority ?? 1);
  const [forIds, setForIds] = React.useState<string[]>(initial ? [initial.forUser.id] : [meId]);
  const [frequency, setFrequency] = React.useState(initAnchor === "none" ? initial?.frequency ?? prefill?.frequency ?? "UNA_VEZ" : "UNA_VEZ");
  const [alerts, setAlerts] = React.useState<{ date: string; time: string }[]>(
    fixedAlerts.length ? fixedAlerts : prefill?.alerts?.length ? prefill.alerts : [{ date: bogotaTomorrowYmd(), time: "08:00" }],
  );
  const [timeOfDay, setTimeOfDay] = React.useState(initial?.timeOfDay ?? prefill?.timeOfDay ?? "08:00");
  const [weekdays, setWeekdays] = React.useState<number[]>(
    initial?.weekdays
      ? initial.weekdays.split(",").map(Number).filter((n) => n >= 0 && n <= 6)
      : prefill?.weekdays?.length
        ? prefill.weekdays
        : [1],
  );
  const [dayOfMonth, setDayOfMonth] = React.useState(initial?.dayOfMonth ?? prefill?.dayOfMonth ?? 1);
  const [endMode, setEndMode] = React.useState<"never" | "date" | "count">(initial?.untilYmd ? "date" : initial?.maxFires ? "count" : "never");
  const [untilYmd, setUntilYmd] = React.useState(initial?.untilYmd ?? bogotaTomorrowYmd());
  const [maxFires, setMaxFires] = React.useState(initial?.maxFires ?? 5);
  const [anchorKind, setAnchorKind] = React.useState<"none" | "task" | "event">(initAnchor);
  const [anchorId, setAnchorId] = React.useState<string>(initial?.event?.id ?? initial?.task?.id ?? "");
  const [offsets, setOffsets] = React.useState<number[]>(relOffsets.length ? relOffsets : [15]);
  const [iconOpen, setIconOpen] = React.useState(false);
  const [optOpen, setOptOpen] = React.useState(
    Boolean(initial && (initial.color || initial.priority !== 1 || initial.forUser.id !== meId)) ||
      Boolean(prefill && (prefill.color || (prefill.priority ?? 1) !== 1)),
  );
  const iconBtn = React.useRef<HTMLButtonElement>(null);

  const anchored = anchorKind !== "none";
  const markList = [...PROJECT_MARKS, ...SECTOR_MARKS];
  // «Para»: yo primero, luego el resto por nombre; y selección de todo el equipo en un toque.
  const sortedTeam = React.useMemo(
    () => [...team].sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.name.localeCompare(b.name))),
    [team, meId],
  );
  const allSelected = team.length > 0 && forIds.length === team.length;
  const [tplSaved, setTplSaved] = React.useState(false);
  const saveTpl = () => {
    if (!title.trim() || tplSaved) return;
    onSaveTemplate({
      id: crypto.randomUUID(),
      title: title.trim(),
      icon: icon || null,
      color,
      priority,
      frequency: anchored ? "UNA_VEZ" : frequency,
      timeOfDay: !anchored && frequency !== "UNA_VEZ" ? timeOfDay : alerts[0]?.time ?? "08:00",
      weekdays,
      dayOfMonth,
    });
    setTplSaved(true);
  };

  const submit = () => {
    setError(null);
    const input: NewReminderInput = {
      title,
      notes: notes || undefined,
      icon: icon || null,
      color,
      priority,
      forUserIds: forIds.length ? forIds : [meId],
      frequency: anchored ? "UNA_VEZ" : frequency,
    };
    if (anchored) {
      if (!anchorId) { setError("Elige la tarea o cita"); return; }
      if (anchorKind === "task") input.taskId = anchorId;
      else input.eventId = anchorId;
      input.offsets = offsets.length ? offsets : [15];
    } else {
      // Conserva un vínculo de etiqueta preexistente (p. ej. recordatorio de una tarea).
      if (initial?.task) input.taskId = initial.task.id;
      if (initial?.event) input.eventId = initial.event.id;
      if (frequency === "UNA_VEZ") input.alerts = alerts;
      else {
        input.timeOfDay = timeOfDay;
        if (frequency === "SEMANAL") input.weekdays = weekdays;
        if (frequency === "MENSUAL") input.dayOfMonth = dayOfMonth;
        if (endMode === "date") input.untilYmd = untilYmd;
        if (endMode === "count") input.maxFires = maxFires;
      }
    }
    start(async () => {
      const res = initial ? await updateReminder(initial.id, input) : await createReminder(input);
      if (!res.ok) { setError(res.error ?? "No se pudo guardar"); return; }
      onSaved();
    });
  };

  const toggleFor = (id: string) => setForIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const toggleOffset = (m: number) => setOffsets((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-auto px-4 py-4">
        <div className="flex flex-col gap-6">
          {/* Paso 1 — Qué */}
          <Step n={1} label="¿Qué hay que recordar?">
            <div className="flex items-center gap-2">
              <button ref={iconBtn} type="button" onClick={() => setIconOpen((o) => !o)} title="Icono" className="flex size-10 shrink-0 items-center justify-center rounded-md border border-input bg-background text-xl hover:bg-accent">
                <EntityEmoji value={icon} fallback="⏰" />
              </button>
              {iconOpen ? (
                <EmojiPicker
                  anchorRef={iconBtn}
                  onClose={() => setIconOpen(false)}
                  onPick={(e) => { setIcon(e); setIconOpen(false); }}
                  marks={markList}
                  marksOnly
                  footer={icon ? (
                    <button type="button" onClick={() => { setIcon(""); setIconOpen(false); }} className="flex w-full items-center justify-center gap-1 rounded px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted">Quitar icono</button>
                  ) : undefined}
                />
              ) : null}
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="p. ej. Grabación, Pagar nómina, Estiramiento…" className={cn(inputCls, "w-full")} />
            </div>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nota opcional (aparece en la notificación)" className={cn(inputCls, "mt-2 w-full")} />
          </Step>

          {/* Paso 2 — Cuándo */}
          <Step n={2} label="¿Cuándo?">
            <div className="flex flex-col gap-3">
              {/* Atar a tarea/cita */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Atar a</span>
                <div className="flex overflow-hidden rounded-md border border-input">
                  {[{ k: "none", l: "Nada" }, { k: "task", l: "Una tarea" }, { k: "event", l: "Una cita" }].map((o) => (
                    <button key={o.k} type="button" onClick={() => { setAnchorKind(o.k as typeof anchorKind); setAnchorId(""); }} className={cn("px-2.5 py-1.5 text-xs font-medium transition-colors", anchorKind === o.k ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{o.l}</button>
                  ))}
                </div>
              </div>
              {anchorKind === "task" ? (
                <select value={anchorId} onChange={(e) => setAnchorId(e.target.value)} className={cn(inputCls, "h-9 w-full py-1")}>
                  <option value="">Elige una tarea…</option>
                  {anchorTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              ) : null}
              {anchorKind === "event" ? (
                <select value={anchorId} onChange={(e) => setAnchorId(e.target.value)} className={cn(inputCls, "h-9 w-full py-1")}>
                  <option value="">Elige una cita…</option>
                  {anchorEvents.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
                </select>
              ) : null}

              {anchored ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">avísame</span>
                  {OFFSET_OPTIONS.map((o) => (
                    <button key={o.m} type="button" onClick={() => toggleOffset(o.m)} className={cn("rounded-full px-2.5 py-1 text-xs font-medium transition-colors", offsets.includes(o.m) ? "bg-primary text-primary-foreground" : "border border-input text-muted-foreground hover:bg-accent")}>{o.label}</button>
                  ))}
                  {anchorTasks.length === 0 && anchorKind === "task" ? <span className="text-[11px] text-muted-foreground">(no tienes tareas con fecha)</span> : null}
                  {anchorEvents.length === 0 && anchorKind === "event" ? <span className="text-[11px] text-muted-foreground">(no tienes citas próximas)</span> : null}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap overflow-hidden rounded-md border border-input self-start">
                    {FREQ_OPTIONS.map((f) => (
                      <button key={f.key} type="button" onClick={() => setFrequency(f.key)} className={cn("px-2.5 py-1.5 text-xs font-medium transition-colors", frequency === f.key ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{f.label}</button>
                    ))}
                  </div>

                  {frequency === "UNA_VEZ" ? (
                    <div className="flex flex-col gap-1.5">
                      {alerts.map((a, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type="date" value={a.date} onChange={(e) => setAlerts((cur) => cur.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} className={cn(inputCls, "h-9 py-1")} />
                          <input type="time" value={a.time} onChange={(e) => setAlerts((cur) => cur.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} className={cn(inputCls, "h-9 py-1")} />
                          {alerts.length > 1 ? (
                            <button type="button" onClick={() => setAlerts((cur) => cur.filter((_, j) => j !== i))} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"><X className="size-4" /></button>
                          ) : null}
                        </div>
                      ))}
                      <button type="button" onClick={() => setAlerts((cur) => [...cur, { date: cur[cur.length - 1]?.date ?? bogotaTomorrowYmd(), time: "09:00" }])} className="inline-flex w-fit items-center gap-1 rounded-full border border-input px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"><Plus className="size-3.5" /> Añadir aviso</button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {frequency === "SEMANAL" ? (
                          <div className="flex gap-1">
                            {WEEK_ORDER.map((d) => (
                              <button key={d} type="button" onClick={() => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]))} className={cn("size-8 rounded-full text-xs font-medium transition-colors", weekdays.includes(d) ? "bg-primary text-primary-foreground" : "border border-input hover:bg-accent")}>{WEEKDAY_LABELS[d]}</button>
                            ))}
                          </div>
                        ) : null}
                        {frequency === "MENSUAL" ? (
                          <label className="flex items-center gap-1.5 text-sm">el día
                            <input type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value) || 1)))} className={cn(inputCls, "h-9 w-16 py-1")} />
                          </label>
                        ) : null}
                        <label className="flex items-center gap-1.5 text-sm">a las
                          <input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} className={cn(inputCls, "h-9 py-1")} />
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-xs font-medium text-muted-foreground">Termina</span>
                        <div className="flex overflow-hidden rounded-md border border-input">
                          {[{ k: "never", l: "Nunca" }, { k: "date", l: "En fecha" }, { k: "count", l: "Tras N veces" }].map((o) => (
                            <button key={o.k} type="button" onClick={() => setEndMode(o.k as typeof endMode)} className={cn("px-2.5 py-1.5 text-xs font-medium transition-colors", endMode === o.k ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{o.l}</button>
                          ))}
                        </div>
                        {endMode === "date" ? <input type="date" value={untilYmd} onChange={(e) => setUntilYmd(e.target.value)} className={cn(inputCls, "h-9 py-1")} /> : null}
                        {endMode === "count" ? (
                          <label className="flex items-center gap-1.5">
                            <input type="number" min={1} max={999} value={maxFires} onChange={(e) => setMaxFires(Math.max(1, Number(e.target.value) || 1))} className={cn(inputCls, "h-9 w-20 py-1")} /> veces
                          </label>
                        ) : null}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </Step>

          {/* Paso 3 — Opcional (colapsado) */}
          <Step n={3} label="Opcional">
            <button type="button" onClick={() => setOptOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
              <span className={cn("transition-transform", optOpen && "rotate-90")}>›</span> Para quién · color · prioridad
            </button>
            {optOpen ? (
              <div className="mt-3 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Users className="size-3.5" /> Para</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {sortedTeam.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleFor(u.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs font-medium transition-colors",
                          forIds.includes(u.id) ? "bg-primary text-primary-foreground" : "border border-input text-muted-foreground hover:bg-accent",
                        )}
                      >
                        <UserAvatar size="sm" name={u.name} initials={u.initials} color={u.avatarColor} url={u.avatarUrl} />
                        {u.id === meId ? "Mí" : shortName(u.name)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setForIds(allSelected ? [meId] : team.map((u) => u.id))}
                      className="rounded-full border border-dashed border-input px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
                    >
                      {allSelected ? "Solo yo" : "Todo el equipo"}
                    </button>
                  </div>
                  {forIds.length > 1 ? <p className="text-[11px] text-muted-foreground">Se creará un recordatorio para cada persona ({forIds.length}).</p> : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Prioridad</span>
                  <div className="flex w-fit overflow-hidden rounded-md border border-input">
                    {PRIORITY_LABELS.map((label, i) => (
                      <button key={i} type="button" onClick={() => setPriority(i)} className={cn("px-2.5 py-1.5 text-xs font-medium transition-colors", priority === i ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>{label}</button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Color</span>
                  <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setColor(null)} title="Sin color" className={cn("flex size-6 items-center justify-center rounded-full border border-input text-muted-foreground", !color && "ring-2 ring-foreground ring-offset-1 ring-offset-background")}><X className="size-3" /></button>
                    {REMINDER_COLORS.map((c) => (
                      <button key={c.key} type="button" onClick={() => setColor(c.key)} title={c.label} className={cn("size-6 rounded-full", color === c.key && "ring-2 ring-offset-1 ring-offset-background")} style={{ background: c.hex, boxShadow: color === c.key ? `0 0 0 2px ${c.hex}` : undefined }} />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </Step>
        </div>
      </div>

      {/* Footer del panel */}
      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <button
          onClick={saveTpl}
          disabled={!title.trim() || tplSaved}
          title="Guardar como plantilla: queda como chip de un toque arriba de la lista (en este dispositivo)"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors",
            tplSaved ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40",
          )}
        >
          <Star className={cn("size-4", tplSaved && "fill-current")} /> <span className="hidden sm:inline">{tplSaved ? "Plantilla guardada" : "Plantilla"}</span>
        </button>
        {error ? <p className="mr-auto text-xs text-destructive">{error}</p> : <span className="mr-auto" />}
        <button onClick={onClose} className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent">Cancelar</button>
        <button onClick={submit} disabled={pending || !title.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? <Loader2 className="size-4 animate-spin" /> : initial ? <Check className="size-4" /> : <Plus className="size-4" />} {initial ? "Guardar cambios" : "Crear recordatorio"}
        </button>
      </div>
    </div>
  );
}

// Menú de posponer reutilizable (fila y destacado).
function SnoozeMenu({ onPick, variant = "ghost" }: { onPick: (kind: string) => void; variant?: "ghost" | "hero" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Posponer"
        className={cn(
          variant === "hero"
            ? "inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-white/30"
            : "flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Clock className="size-4" /> {variant === "hero" ? "Posponer" : null}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-popover p-1 text-foreground shadow-lg">
            {SNOOZE_OPTIONS.map((o) => (
              <button key={o.k} onClick={() => { setOpen(false); onPick(o.k); }} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-muted">{o.label}</button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ── Destacado «Ahora sigue» ── (vista tipo agenda: lo próximo, en grande)
function NextUpHero({
  r,
  nowMs,
  pending,
  onEdit,
  onDone,
  onSnooze,
}: {
  r: ReminderRow;
  nowMs: number;
  pending: boolean;
  onEdit: () => void;
  onToggle: (active: boolean) => void;
  onDone: () => void;
  onSnooze: (kind: string) => void;
  onDelete: () => void;
}) {
  const hex = reminderColorHex(r.color) ?? "#F47A20";
  const recurrente = r.frequency !== "UNA_VEZ";
  const scheduleLabel = recurrente ? describeSchedule({ frequency: r.frequency, weekdays: r.weekdays, dayOfMonth: r.dayOfMonth, timeOfDay: r.timeOfDay }) : null;
  const link = r.task ? "/mis-tareas" : r.event ? "/calendario" : null;
  const linkLabel = r.task ? "Ir a la tarea" : r.event ? "Ver en calendario" : null;

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 text-white shadow-lg"
      style={{ backgroundColor: hex, backgroundImage: `linear-gradient(135deg, ${hex}, color-mix(in srgb, ${hex} 78%, #000))` }}
    >
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/20 text-2xl backdrop-blur">
          <EntityEmoji value={r.icon} fallback="⏰" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/80">Ahora sigue</p>
          <h2 className="mt-0.5 truncate text-lg font-bold tracking-tight">{r.title}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/90" suppressHydrationWarning>
            <span className="font-medium">{FMT.format(new Date(r.nextFireAtIso))}</span>
            <span className="text-white/70">· {relativo(r.nextFireAtIso, nowMs)}</span>
            {r.priority >= 2 ? <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">{PRIORITY_LABELS[r.priority]}</span> : null}
            {scheduleLabel ? <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">{scheduleLabel}</span> : null}
          </p>
          {r.notes ? <p className="mt-1 truncate text-xs text-white/75">{r.notes}</p> : null}
        </div>
      </div>

      {r.canManage ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={onDone} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-neutral-900 shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-60" style={{ color: hex }}>
            <Check className="size-4" /> Hecho
          </button>
          <SnoozeMenu onPick={onSnooze} variant="hero" />
          {link ? (
            <Link href={link} className="inline-flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-white/30">
              {linkLabel} <ArrowUpRight className="size-3.5" />
            </Link>
          ) : null}
          <button onClick={onEdit} disabled={pending} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/15 hover:text-white">
            <Pencil className="size-3.5" /> Editar
          </button>
        </div>
      ) : null}
    </div>
  );
}

function esHoyBogota(iso: string, nowMs: number): boolean {
  return bogYmd(new Date(iso).getTime()) === bogYmd(nowMs);
}

function Row({
  r,
  meId,
  nowMs,
  pending,
  onEdit,
  onToggle,
  onDone,
  onSnooze,
  onDelete,
}: {
  r: ReminderRow;
  meId: string;
  nowMs: number;
  pending: boolean;
  onEdit: () => void;
  onToggle: (active: boolean) => void;
  onDone: () => void;
  onSnooze: (kind: string) => void;
  onDelete: () => void;
}) {
  const recurrente = r.frequency !== "UNA_VEZ";
  const scheduleLabel = recurrente ? describeSchedule({ frequency: r.frequency, weekdays: r.weekdays, dayOfMonth: r.dayOfMonth, timeOfDay: r.timeOfDay }) : null;
  const reactivable = recurrente || r.alerts.some((a) => !a.sentAtIso && new Date(a.fireAtIso).getTime() > nowMs);
  const suenaHoy = r.active && !r.doneAtIso && esHoyBogota(r.nextFireAtIso, nowMs);
  const hex = reminderColorHex(r.color);
  const pendingAlerts = r.alerts.filter((a) => a.active && !a.sentAtIso).sort((a, b) => new Date(a.fireAtIso).getTime() - new Date(b.fireAtIso).getTime());
  const stripe = hex ?? (suenaHoy ? "#F47A20" : undefined);

  // ── Gestos táctiles (solo móvil): deslizar → derecha = Hecho · izquierda = posponer +1 h ──
  // touch-action pan-y deja el scroll vertical nativo; solo se arma con dedo (pointerType touch)
  // y nunca arrancando sobre un botón (evita disparar gesto + clic a la vez).
  const swipeable = r.canManage && r.active && !r.doneAtIso && !pending;
  const [dx, setDx] = React.useState(0);
  const dragRef = React.useRef<{ x: number; id: number } | null>(null);
  const SWIPE_TRIGGER = 72;
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!swipeable || e.pointerType !== "touch") return;
    if ((e.target as HTMLElement).closest("button, a")) return;
    dragRef.current = { x: e.clientX, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || e.pointerId !== dragRef.current.id) return;
    setDx(Math.max(-120, Math.min(120, e.clientX - dragRef.current.x)));
  };
  const endDrag = (commit: boolean) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (commit) {
      if (dx > SWIPE_TRIGGER) onDone();
      else if (dx < -SWIPE_TRIGGER) onSnooze("1h");
    }
    setDx(0);
  };

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Fondo revelado por el gesto */}
      {dx !== 0 ? (
        <div className={cn("absolute inset-0 flex items-center justify-between rounded-xl px-4", dx > 0 ? "bg-emerald-500/10" : "bg-amber-500/10")}>
          <span className={cn("flex items-center gap-1.5 text-xs font-bold text-emerald-600 transition-opacity dark:text-emerald-400", dx > 24 ? "opacity-100" : "opacity-0")}>
            <Check className="size-4" /> Hecho
          </span>
          <span className={cn("flex items-center gap-1.5 text-xs font-bold text-amber-600 transition-opacity dark:text-amber-400", dx < -24 ? "opacity-100" : "opacity-0")}>
            <Clock className="size-4" /> +1 hora
          </span>
        </div>
      ) : null}
      <div
        className={cn(
          "rounded-xl border border-border bg-card transition-colors hover:border-border/80",
          suenaHoy && !hex && "bg-[#F47A20]/[0.04]",
          dx === 0 && "transition-transform duration-200 ease-out motion-reduce:transition-none",
        )}
        style={{
          ...(stripe ? { borderLeft: `3px solid ${stripe}`, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 } : null),
          transform: dx ? `translateX(${dx}px)` : undefined,
          touchAction: "pan-y",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endDrag(true)}
        onPointerCancel={() => endDrag(false)}
      >
      <div className="flex items-start gap-3 px-4 py-3">
        {r.icon ? (
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-lg"><EntityEmoji value={r.icon} fallback="⏰" /></div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
            <span className={cn("truncate", r.doneAtIso && "line-through opacity-70")}>{r.title}</span>
            {r.priority >= 2 ? (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", r.priority === 3 ? "bg-red-500/15 text-red-700 dark:text-red-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300")}>{PRIORITY_LABELS[r.priority]}</span>
            ) : null}
            {r.task ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">tarea: {r.task.title}</span> : null}
            {r.event ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">cita: {r.event.title}</span> : null}
          </p>

          {/* Chips de avisos */}
          <div className="mt-1 flex flex-wrap items-center gap-1.5" suppressHydrationWarning>
            {scheduleLabel ? <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">{scheduleLabel}{r.untilYmd ? ` · hasta ${r.untilYmd}` : r.maxFires ? ` · ${r.maxFires}×` : ""}</span> : null}
            {suenaHoy ? <span className="rounded-full bg-[#F47A20]/15 px-2 py-0.5 text-[10px] font-semibold text-[#F47A20]">hoy</span> : null}
            {r.active && !r.doneAtIso ? (
              pendingAlerts.slice(0, 5).map((a) => (
                <span key={a.id} className="rounded-full border border-input px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {a.offsetMin != null ? humanOffset(a.offsetMin) : FMT.format(new Date(a.fireAtIso))}
                </span>
              ))
            ) : null}
            {pendingAlerts.length > 5 ? <span className="text-[10px] text-muted-foreground">+{pendingAlerts.length - 5}</span> : null}
            {r.doneAtIso ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">hecho {FMT.format(new Date(r.doneAtIso))}</span> : null}
            {!r.active && !r.doneAtIso ? <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">pausado</span> : null}
          </div>

          <p className="mt-1 text-xs text-muted-foreground" suppressHydrationWarning>
            {r.active && !r.doneAtIso && pendingAlerts.length ? <>próximo {relativo(r.nextFireAtIso, nowMs)}</> : null}
            {r.forUser.id !== meId ? <> · para <strong className="font-medium text-foreground">{r.forUser.name}</strong></> : null}
            {r.createdBy.id !== meId ? <> · de {r.createdBy.name}</> : null}
          </p>
          {r.notes ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.notes}</p> : null}
        </div>

        {r.canManage ? (
          <div className="flex shrink-0 items-center gap-0.5">
            {r.active && !r.doneAtIso ? (
              <button onClick={onDone} disabled={pending} title="Marcar hecho" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-600"><Check className="size-4" /></button>
            ) : null}
            {r.active && !r.doneAtIso ? <SnoozeMenu onPick={onSnooze} /> : null}
            <button onClick={onEdit} disabled={pending} title="Editar" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><Pencil className="size-4" /></button>
            {r.active && !r.doneAtIso ? (
              <button onClick={() => onToggle(false)} disabled={pending} title="Pausar" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><Pause className="size-4" /></button>
            ) : reactivable ? (
              <button onClick={() => onToggle(true)} disabled={pending} title="Reactivar" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"><Play className="size-4" /></button>
            ) : null}
            <button onClick={onDelete} disabled={pending} title="Eliminar" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-4" /></button>
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}
