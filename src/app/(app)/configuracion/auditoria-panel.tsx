"use client";

import * as React from "react";
import { Download, ChevronLeft, ChevronRight } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { GROUP_META, groupOf } from "./auditoria-groups";
import { getAuditPage, getUserDay, type AuditFeedRow } from "./auditoria-actions";

// ── Panel de AUDITORÍA ──
// Dos vistas: «Actividad» (feed global con filtros por persona/grupo/rango, paginación
// server-side y export CSV) y «Por persona» (línea de tiempo de un día, agrupada por horas
// de Bogotá, con resumen del día y barras de la semana para saltar entre días).

export type AuditUserOption = { id: string; name: string };

const BOGOTA = "America/Bogota";
const hhmm = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: BOGOTA, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const hourOf = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: BOGOTA, hour: "2-digit", hour12: false }).format(new Date(iso));
const ymdOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: BOGOTA }).format(d);
const fullDay = (ymd: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: BOGOTA, weekday: "long", day: "numeric", month: "long" }).format(new Date(`${ymd}T12:00:00-05:00`));
const dayShift = (ymd: string, days: number) => ymdOf(new Date(new Date(`${ymd}T12:00:00-05:00`).getTime() + days * 86400_000));
const feedDay = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: BOGOTA, day: "2-digit", month: "short" }).format(new Date(iso));

function GroupChip({ action }: { action: string }) {
  const g = groupOf(action);
  const meta = g ? GROUP_META[g] : null;
  if (!meta) return null;
  return (
    <span
      className="shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider"
      style={{ background: `${meta.color}1f`, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

function FeedRow({ r, showDay }: { r: AuditFeedRow; showDay?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm shadow-sm">
      <UserAvatar initials={r.userInitials} color={r.userColor} size="sm" />
      <p className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{r.userName ?? "Sistema"}</span>{" "}
        <span className="text-muted-foreground">{r.summary}</span>
        {r.projectName ? <span className="text-muted-foreground"> — <b className="font-medium text-foreground">{r.projectName}</b></span> : r.clientName ? <span className="text-muted-foreground"> — <b className="font-medium text-foreground">{r.clientName}</b></span> : null}
      </p>
      <GroupChip action={r.action} />
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title={r.ip ?? undefined}>
        {showDay ? `${feedDay(r.when)} · ` : ""}
        {hhmm(r.when)}
      </span>
    </div>
  );
}

export function AuditoriaPanel({
  initialRows,
  initialCursor,
  users,
  today,
}: {
  initialRows: AuditFeedRow[];
  initialCursor: string | null;
  users: AuditUserOption[];
  today: string; // ymd de Bogotá calculado en el servidor
}) {
  const [tab, setTab] = React.useState<"feed" | "pp">("feed");

  // ── Feed ──
  const [rows, setRows] = React.useState(initialRows);
  const [cursor, setCursor] = React.useState(initialCursor);
  const [fUser, setFUser] = React.useState("");
  const [fGroup, setFGroup] = React.useState("");
  const [fRange, setFRange] = React.useState("todo");
  const [loading, startLoad] = React.useTransition();

  const rangeFrom = (r: string): string | undefined => {
    if (r === "hoy") return `${today}T00:00:00.000-05:00`;
    if (r === "7d") return new Date(Date.now() - 7 * 86400_000).toISOString();
    if (r === "30d") return new Date(Date.now() - 30 * 86400_000).toISOString();
    return undefined;
  };
  const reload = (user = fUser, group = fGroup, range = fRange) =>
    startLoad(async () => {
      const page = await getAuditPage({ userId: user || undefined, group: group || undefined, from: rangeFrom(range) });
      setRows(page.rows);
      setCursor(page.nextCursor);
    });
  const loadMore = () =>
    startLoad(async () => {
      if (!cursor) return;
      const page = await getAuditPage({ cursor, userId: fUser || undefined, group: fGroup || undefined, from: rangeFrom(fRange) });
      setRows((r) => [...r, ...page.rows]);
      setCursor(page.nextCursor);
    });

  const csvHref = `/api/audit/export?${new URLSearchParams({
    ...(fUser ? { userId: fUser } : {}),
    ...(fGroup ? { group: fGroup } : {}),
    ...(rangeFrom(fRange) ? { from: rangeFrom(fRange)! } : {}),
  }).toString()}`;

  // ── Por persona ──
  const [ppUser, setPpUser] = React.useState(users[0]?.id ?? "");
  const [ppDay, setPpDay] = React.useState(today);
  const [ppRows, setPpRows] = React.useState<AuditFeedRow[]>([]);
  const [ppWeek, setPpWeek] = React.useState<{ ymd: string; count: number }[]>([]);
  const [ppLoading, startPp] = React.useTransition();
  const loadPp = React.useCallback((user: string, ymd: string) => {
    if (!user) return;
    startPp(async () => {
      const d = await getUserDay(user, ymd);
      setPpRows(d.rows);
      setPpWeek(d.week);
    });
  }, []);
  React.useEffect(() => {
    if (tab === "pp") loadPp(ppUser, ppDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const horas = React.useMemo(() => {
    const map = new Map<string, AuditFeedRow[]>();
    for (const r of ppRows) {
      const h = `${hourOf(r.when)}:00`;
      if (!map.has(h)) map.set(h, []);
      map.get(h)!.push(r);
    }
    return [...map.entries()];
  }, [ppRows]);
  const resumen = React.useMemo(() => {
    if (!ppRows.length) return null;
    const proys = new Set(ppRows.map((r) => r.projectName).filter(Boolean));
    const clis = new Set(ppRows.map((r) => r.clientName).filter(Boolean));
    return {
      total: ppRows.length,
      desde: hhmm(ppRows[0].when),
      hasta: hhmm(ppRows[ppRows.length - 1].when),
      proyectos: proys.size,
      clientes: clis.size,
    };
  }, [ppRows]);
  const maxWeek = Math.max(1, ...ppWeek.map((w) => w.count));
  const DIAS = ["L", "M", "X", "J", "V", "S", "D"];

  const selCls = "rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setTab("feed")}
          className={cn("rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors", tab === "feed" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground")}
        >
          Actividad
        </button>
        <button
          type="button"
          onClick={() => { setTab("pp"); }}
          className={cn("rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors", tab === "pp" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground")}
        >
          Por persona
        </button>
      </div>

      {tab === "feed" ? (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={fUser} onChange={(e) => { setFUser(e.target.value); reload(e.target.value, fGroup, fRange); }} className={selCls}>
              <option value="">Todas las personas</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select value={fGroup} onChange={(e) => { setFGroup(e.target.value); reload(fUser, e.target.value, fRange); }} className={selCls}>
              <option value="">Todos los grupos</option>
              {Object.entries(GROUP_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
            <select value={fRange} onChange={(e) => { setFRange(e.target.value); reload(fUser, fGroup, e.target.value); }} className={selCls}>
              <option value="todo">Todo el historial</option>
              <option value="hoy">Hoy</option>
              <option value="7d">Últimos 7 días</option>
              <option value="30d">Últimos 30 días</option>
            </select>
            <a href={csvHref} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
              <Download className="size-3.5" /> Exportar CSV
            </a>
          </div>

          <div className={cn("grid gap-1.5", loading && "opacity-60")}>
            {rows.map((r) => <FeedRow key={r.id} r={r} showDay />)}
            {rows.length === 0 && !loading ? <p className="py-6 text-center text-sm text-muted-foreground">No hay actividad con esos filtros.</p> : null}
          </div>
          {cursor ? (
            <div className="mt-3 text-center">
              <button type="button" onClick={loadMore} disabled={loading} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50">
                {loading ? "Cargando…" : "Cargar más"}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <select value={ppUser} onChange={(e) => { setPpUser(e.target.value); loadPp(e.target.value, ppDay); }} className={selCls}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => { const d = dayShift(ppDay, -1); setPpDay(d); loadPp(ppUser, d); }} aria-label="Día anterior" className="grid size-7 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground"><ChevronLeft className="size-4" /></button>
              <span className="min-w-[180px] text-center text-sm font-semibold capitalize">{fullDay(ppDay)}</span>
              <button type="button" onClick={() => { const d = dayShift(ppDay, 1); setPpDay(d); loadPp(ppUser, d); }} aria-label="Día siguiente" disabled={ppDay >= today} className="grid size-7 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-40"><ChevronRight className="size-4" /></button>
            </div>
            {/* Barras de la semana (L→D): clic para saltar a ese día */}
            <div className="ml-auto flex items-end gap-1.5" style={{ height: 46 }}>
              {ppWeek.map((w, i) => (
                <button
                  key={w.ymd}
                  type="button"
                  onClick={() => { setPpDay(w.ymd); loadPp(ppUser, w.ymd); }}
                  title={`${w.ymd} · ${w.count} acciones`}
                  className="relative w-4"
                  style={{ height: "100%" }}
                >
                  <span
                    className={cn("absolute bottom-3 left-0 right-0 rounded-t", w.ymd === ppDay ? "bg-primary" : "bg-primary/25 hover:bg-primary/50")}
                    style={{ height: Math.max(4, (w.count / maxWeek) * 28) }}
                  />
                  <span className="absolute bottom-0 left-0 right-0 text-center text-[9px] text-muted-foreground">{DIAS[i]}</span>
                </button>
              ))}
            </div>
          </div>

          {resumen ? (
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"><b className="mr-1 text-sm text-foreground tabular-nums">{resumen.total}</b> acciones</span>
              <span className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">activo <b className="text-foreground tabular-nums">{resumen.desde} → {resumen.hasta}</b></span>
              <span className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"><b className="mr-1 text-sm text-foreground tabular-nums">{resumen.proyectos}</b> proyectos</span>
              <span className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"><b className="mr-1 text-sm text-foreground tabular-nums">{resumen.clientes}</b> clientes</span>
            </div>
          ) : null}

          <div className={cn(ppLoading && "opacity-60")}>
            {horas.length === 0 && !ppLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Sin actividad registrada ese día.</p>
            ) : (
              <div className="ml-1.5 border-l-2 border-border pl-5">
                {horas.map(([h, evs]) => (
                  <div key={h} className="relative mb-4">
                    <span className="absolute -left-[27px] top-1 size-2.5 rounded-full border-2 border-background bg-primary" />
                    <p className="mb-1.5 text-[11px] font-extrabold tracking-widest text-muted-foreground">{h}</p>
                    <div className="grid gap-1.5">
                      {evs.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm shadow-sm">
                          <span className="w-11 shrink-0 text-xs font-bold tabular-nums text-primary">{hhmm(r.when)}</span>
                          <p className="min-w-0 flex-1 truncate text-muted-foreground">
                            {r.summary}
                            {r.projectName ? <span> — <b className="font-medium text-foreground">{r.projectName}</b></span> : r.clientName ? <span> — <b className="font-medium text-foreground">{r.clientName}</b></span> : null}
                          </p>
                          <GroupChip action={r.action} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
