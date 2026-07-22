"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import { ProjectColorPicker } from "./project-color-picker";
import { setProjectStatus } from "./status-actions";
import { finishProject } from "./[id]/actions";
import { useRouter } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";

// ── Las TRES vistas de /proyectos (rediseño aprobado por artifact) ──
// Pipeline: kanban por estado (reemplaza los tableros vertical/horizontal).
// Tabla: UNA tabla densa con grupos plegables (reemplaza la mini-tabla por cliente).
// Portafolio: tarjetas grandes con punto de salud.
// El servidor arma el payload (fechas ya formateadas y semáforo calculado: evita
// desfases de zona horaria/hidración) y aquí solo se pinta e interactúa.

export type ViewTeam = { initials: string | null; color: string | null };
export type ViewProject = {
  id: string;
  name: string;
  emoji: string | null;
  color: string | null; // token de tono (lo edita ProjectColorPicker)
  bandHex: string; // hex resuelto para franjas/bandas
  status: string;
  progress: number;
  dueLabel: string | null;
  dueTone: "bad" | "warn" | null;
  dueMs: number | null;
  clientId: string;
  clientName: string;
  clientEmoji: string | null;
  team: ViewTeam[];
  teamCount: number;
  deliverables: number;
  nextDueLabel: string | null;
  canMove: boolean;
};
export type StatusCol = { key: string; label: string; className: string };

// Cambio de estado compartido (Pipeline y Tabla): optimista + revierte si el servidor dice no.
function useProjectMove() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [moves, setMoves] = React.useState<Record<string, string>>({});
  const [err, setErr] = React.useState<string | null>(null);
  // Ciclo de vida: al soltar en Entregado/Cerrado se OFRECE (no se impone) marcar Terminado —
  // banner descartable; Terminar lo saca de las listas activas (router.refresh lo refleja).
  const [suggest, setSuggest] = React.useState<{ id: string; name: string } | null>(null);
  const eff = React.useCallback((p: ViewProject) => moves[p.id] ?? p.status, [moves]);
  const move = React.useCallback((p: ViewProject, status: string) => {
    if (!p.canMove || status === (moves[p.id] ?? p.status)) return;
    setErr(null);
    setMoves((m) => ({ ...m, [p.id]: status }));
    start(async () => {
      const r = await setProjectStatus(p.id, status);
      if (!r.ok) {
        setMoves((m) => { const n = { ...m }; delete n[p.id]; return n; });
        setErr(r.error ?? "No se pudo mover el proyecto.");
      } else if (["ENTREGADO", "CERRADO"].includes(status)) {
        setSuggest({ id: p.id, name: p.name });
      }
    });
  }, [moves]);
  const finishNow = React.useCallback((id: string) => {
    setSuggest(null);
    start(async () => {
      const r = await finishProject(id);
      if (!r.ok) setErr(r.error ?? "No se pudo terminar el proyecto.");
      else router.refresh();
    });
  }, [router]);
  const dismissSuggest = React.useCallback(() => setSuggest(null), []);
  return { eff, move, err, pending, suggest, finishNow, dismissSuggest };
}

// Banner de sugerencia «¿también Terminado?» (compartido por Pipeline y Tabla).
function FinishSuggest({ suggest, onFinish, onDismiss }: { suggest: { id: string; name: string } | null; onFinish: (id: string) => void; onDismiss: () => void }) {
  if (!suggest) return null;
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm animate-in fade-in slide-in-from-top-1">
      <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
      <span className="min-w-0 flex-1">«{suggest.name}» quedó cerrado. ¿Lo marcamos también como <b>Terminado</b> (archivo, reversible)?</span>
      <button onClick={() => onFinish(suggest.id)} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90">Terminar</button>
      <button onClick={onDismiss} aria-label="Ahora no" className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button>
    </div>
  );
}

function dueText(p: ViewProject, effStatus?: string) {
  const s = effStatus ?? p.status;
  const done = ["APROBADO", "ENTREGADO", "CERRADO", "CANCELADO"].includes(s);
  return (
    <span className={cn(
      "text-[11px]",
      !done && p.dueTone === "bad" ? "font-semibold text-red-600 dark:text-red-400"
        : !done && p.dueTone === "warn" ? "font-semibold text-amber-600 dark:text-amber-400"
          : "text-muted-foreground",
    )}>
      {p.dueLabel ? (!done && p.dueTone === "bad" ? `● venció ${p.dueLabel}` : p.dueLabel) : "sin fecha"}
    </span>
  );
}

function TeamStack({ team, count }: { team: ViewTeam[]; count: number }) {
  if (count === 0) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <span className="flex items-center">
      <span className="flex -space-x-1.5">
        {team.slice(0, 3).map((t, i) => (
          <UserAvatar key={i} initials={t.initials} color={t.color} size="sm" ring />
        ))}
      </span>
      {count > 3 ? <span className="ml-1 text-[10px] font-semibold text-muted-foreground">+{count - 3}</span> : null}
    </span>
  );
}

// Píldora de estado: estática, o un <select> disfrazado de píldora si puedes moverlo.
function StatusPill({ value, meta, allStatuses, canMove, onChange }: {
  value: string;
  meta: StatusCol | undefined;
  allStatuses: StatusCol[];
  canMove: boolean;
  onChange: (s: string) => void;
}) {
  const cls = cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", meta?.className ?? "bg-muted text-muted-foreground");
  if (!canMove) return <span className={cls}>{meta?.label ?? value}</span>;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      title="Cambiar estado"
      className={cn(cls, "cursor-pointer appearance-none border-0 outline-none")}
    >
      {allStatuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
    </select>
  );
}

// ── PIPELINE (kanban por estado) ──
export function PipelineView({ cols, allStatuses, projects }: { cols: StatusCol[]; allStatuses: StatusCol[]; projects: ViewProject[] }) {
  const { eff, move, err, pending, suggest, finishNow, dismissSuggest } = useProjectMove();
  const byId = React.useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const anyMovable = projects.some((p) => p.canMove);

  return (
    <div>
      <FinishSuggest suggest={suggest} onFinish={finishNow} onDismiss={dismissSuggest} />
      {err ? <p className="mb-2 text-xs text-destructive">{err}</p> : null}
      <div className="flex items-start gap-3 overflow-x-auto pb-2">
        {cols.map((col) => {
          const items = projects.filter((p) => eff(p) === col.key);
          return (
            <div
              key={col.key}
              className="flex w-64 shrink-0 flex-col rounded-xl border border-border bg-muted/20"
              onDragOver={(e) => { if (anyMovable) e.preventDefault(); }}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/plain");
                const p = id ? byId.get(id) : null;
                if (p) move(p, col.key);
              }}
            >
              <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", col.className)}>{col.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{items.length}</span>
              </div>
              <div className="flex min-h-20 flex-1 flex-col gap-2 p-2 pt-0">
                {items.length === 0 ? (
                  <div className="grid h-16 place-items-center rounded-lg border border-dashed border-border text-[11px] text-muted-foreground">
                    {anyMovable ? "Suelta aquí" : "Vacío"}
                  </div>
                ) : (
                  items.map((p) => (
                    <div
                      key={p.id}
                      draggable={p.canMove}
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
                      className={cn(
                        "rounded-lg border border-border bg-card p-2.5 shadow-sm",
                        p.canMove && "cursor-grab active:cursor-grabbing",
                        pending && "opacity-80",
                      )}
                      style={{ borderLeft: `3px solid ${p.bandHex}` }}
                    >
                      <Link href={`/proyectos/${p.id}`} className="block min-w-0">
                        <p className="truncate text-sm font-medium hover:underline">{p.emoji ? `${p.emoji} ` : ""}{p.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{p.clientEmoji ? `${p.clientEmoji} ` : ""}{p.clientName}</p>
                      </Link>
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
                        </div>
                        <span className="text-[10px] tabular-nums text-muted-foreground">{p.progress}%</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        {dueText(p, eff(p))}
                        <TeamStack team={p.team} count={p.teamCount} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      {anyMovable ? (
        <p className="mt-1 text-[11px] text-muted-foreground">Arrastra una tarjeta a otra columna para cambiar su estado (o usa la píldora de estado en la Tabla).</p>
      ) : null}
    </div>
  );
}

// ── TABLA MAESTRA (una sola tabla con grupos plegables y orden por columna) ──
type SortKey = "name" | "status" | "progress" | "due" | "deliverables";

export function MasterTable({ projects, allStatuses, grupo }: { projects: ViewProject[]; allStatuses: StatusCol[]; grupo: "cliente" | "estado" }) {
  const { eff, move, err, suggest, finishNow, dismissSuggest } = useProjectMove();
  const metaMap = React.useMemo(() => new Map(allStatuses.map((s, i) => [s.key, { ...s, idx: i }])), [allStatuses]);
  const [closed, setClosed] = React.useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = React.useState<SortKey | null>(null);
  const [dir, setDir] = React.useState<1 | -1>(1);

  const toggleGroup = (k: string) => setClosed((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const clickSort = (k: SortKey) => {
    if (sortKey === k) setDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setDir(1); }
  };

  const cmp = React.useCallback((a: ViewProject, b: ViewProject): number => {
    if (!sortKey) return 0;
    const v = (() => {
      switch (sortKey) {
        case "name": return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
        case "status": return (metaMap.get(eff(a))?.idx ?? 99) - (metaMap.get(eff(b))?.idx ?? 99);
        case "progress": return a.progress - b.progress;
        case "due": return (a.dueMs ?? Infinity) - (b.dueMs ?? Infinity);
        case "deliverables": return a.deliverables - b.deliverables;
        default: return 0;
      }
    })();
    return v * dir;
  }, [sortKey, dir, metaMap, eff]);

  // Grupos según «Agrupar» (cliente o estado); dentro de cada grupo manda el orden elegido.
  const groups = React.useMemo(() => {
    if (grupo === "estado") {
      return allStatuses
        .map((s) => ({ key: s.key, label: s.label, pill: s.className, items: projects.filter((p) => eff(p) === s.key).sort(cmp) }))
        .filter((g) => g.items.length > 0);
    }
    const byClient = new Map<string, { key: string; label: string; pill: null; items: ViewProject[] }>();
    for (const p of projects) {
      const g = byClient.get(p.clientId) ?? { key: p.clientId, label: `${p.clientEmoji ? `${p.clientEmoji} ` : ""}${p.clientName}`, pill: null, items: [] };
      g.items.push(p);
      byClient.set(p.clientId, g);
    }
    return [...byClient.values()].map((g) => ({ ...g, items: [...g.items].sort(cmp) }));
  }, [projects, grupo, allStatuses, eff, cmp]);

  const th = (label: string, k: SortKey, extra?: string) => (
    <th className={cn("px-3 py-2 font-medium", extra)}>
      <button type="button" onClick={() => clickSort(k)} className="inline-flex items-center gap-1 hover:text-foreground" title={`Ordenar por ${label.toLowerCase()}`}>
        {label}
        <ArrowUpDown className={cn("size-3", sortKey === k ? "text-foreground" : "opacity-40")} />
      </button>
    </th>
  );

  return (
    <div>
      <FinishSuggest suggest={suggest} onFinish={finishNow} onDismiss={dismissSuggest} />
      {err ? <p className="mb-2 text-xs text-destructive">{err}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              {th("Proyecto", "name")}
              {th("Estado", "status")}
              {th("Progreso", "progress")}
              {th("Entrega", "due")}
              <th className="px-3 py-2 font-medium">Equipo</th>
              {th("Entregables", "deliverables")}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={g.key}>
                <tr className="border-b border-border bg-primary/5">
                  <td colSpan={6} className="px-2 py-1.5">
                    <button type="button" onClick={() => toggleGroup(g.key)} className="flex w-full items-center gap-1.5 text-left text-xs font-bold">
                      {closed.has(g.key) ? <ChevronRight className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
                      {g.pill ? <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", g.pill)}>{g.label}</span> : <span>{g.label}</span>}
                      <span className="font-normal text-muted-foreground">· {g.items.length}</span>
                    </button>
                  </td>
                </tr>
                {!closed.has(g.key) ? g.items.map((p) => {
                  const m = metaMap.get(eff(p));
                  return (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <ProjectColorPicker projectId={p.id} color={p.color} />
                          <Link href={`/proyectos/${p.id}`} className="min-w-0 truncate font-medium hover:underline">
                            {p.emoji ? `${p.emoji} ` : ""}{p.name}
                          </Link>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <StatusPill value={eff(p)} meta={m} allStatuses={allStatuses} canMove={p.canMove} onChange={(s) => move(p, s)} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground">{p.progress}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">{dueText(p, eff(p))}</td>
                      <td className="px-3 py-2"><TeamStack team={p.team} count={p.teamCount} /></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {p.deliverables > 0 ? (
                          <>
                            <span className="tabular-nums">{p.deliverables}</span>
                            {p.nextDueLabel ? <span className="text-muted-foreground/70"> · próx. {p.nextDueLabel}</span> : null}
                          </>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                }) : null}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── PORTAFOLIO (tarjetas grandes con salud) ──
export function PortfolioView({ projects, allStatuses }: { projects: ViewProject[]; allStatuses: StatusCol[] }) {
  const metaMap = React.useMemo(() => new Map(allStatuses.map((s) => [s.key, s])), [allStatuses]);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => {
        const done = ["APROBADO", "ENTREGADO", "CERRADO", "CANCELADO"].includes(p.status);
        const health = done ? "bg-muted-foreground/40" : p.dueTone === "bad" ? "bg-red-500" : p.dueTone === "warn" ? "bg-amber-400" : "bg-emerald-500";
        const healthTitle = done ? "Terminado" : p.dueTone === "bad" ? "Entrega vencida" : p.dueTone === "warn" ? "Entrega en ≤7 días" : "Al día";
        const m = metaMap.get(p.status);
        return (
          <Link key={p.id} href={`/proyectos/${p.id}`} className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
            <div className="h-2.5" style={{ background: `linear-gradient(90deg, ${p.bandHex}, ${p.bandHex}99)` }} />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold group-hover:underline">{p.emoji ? `${p.emoji} ` : ""}{p.name}</p>
                <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", health)} title={healthTitle} />
              </div>
              <p className="truncate text-xs text-muted-foreground">{p.clientEmoji ? `${p.clientEmoji} ` : ""}{p.clientName}</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${p.progress}%` }} />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">{p.progress}%</span>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", m?.className ?? "bg-muted text-muted-foreground")}>{m?.label ?? p.status}</span>
                {dueText(p)}
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <TeamStack team={p.team} count={p.teamCount} />
                <span className="text-[11px] text-muted-foreground">
                  {p.deliverables > 0 ? `${p.deliverables} entregable${p.deliverables === 1 ? "" : "s"}` : "sin entregables"}
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
