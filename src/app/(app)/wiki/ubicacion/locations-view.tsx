"use client";

import * as React from "react";
import { Search, Copy, Check, HardDrive, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { tone } from "@/lib/colors";
import { UserAvatar } from "@/components/user-avatar";

// Vista de "Ubicación del material": agrupa los respaldos por disco y resalta la
// CADUCIDAD con un semáforo (rojo = vence pronto, ámbar = este trimestre, verde = ok),
// para borrar a tiempo sin perder material por error. Lee las mismas columnas que la
// tabla (Cliente, Proyecto, Disco, Ruta, Optimizado, Responsable, Caducidad…).

type Option = { id: string; label: string; color: string };
type Column = { id: string; name: string; type: string; options: Option[] | null };
type Row = { id: string; cells: Record<string, unknown> };
type Member = { id: string; name: string; initials: string | null; color: string | null };

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// Días desde hoy hasta la fecha "YYYY-MM-DD" (negativo = ya venció). null si no hay fecha.
function daysUntil(date: string): number | null {
  if (!date) return null;
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

const monthFmt = new Intl.DateTimeFormat("es-CO", { month: "short", year: "numeric" });

// Semáforo de caducidad → {tono, etiqueta}.
function expiry(days: number | null, date: string): { color: "red" | "amber" | "emerald" | "slate"; label: string } {
  if (days === null) return { color: "slate", label: "Sin caducidad" };
  if (days < 0) return { color: "red", label: "Vencido" };
  if (days <= 30) return { color: "red", label: `Vence en ${days} d` };
  if (days <= 90) return { color: "amber", label: `~${Math.max(1, Math.round(days / 30))} meses` };
  const d = new Date(date + "T00:00:00");
  return { color: "emerald", label: monthFmt.format(d) };
}

export function LocationsView({ columns, rows, team }: { columns: Column[]; rows: Row[]; team: Member[] }) {
  const [query, setQuery] = React.useState("");
  const [onlySoon, setOnlySoon] = React.useState(false);

  const clienteCol = columns.find((c) => c.name === "Cliente");
  const proyectoCol = columns.find((c) => c.name === "Proyecto");
  const discoCol = columns.find((c) => c.name === "Disco");
  const rutaCol = columns.find((c) => c.name === "Ruta");
  const optCol = columns.find((c) => c.name === "Optimizado");
  const respCol = columns.find((c) => c.type === "PERSON");
  const cadCol = columns.find((c) => c.name === "Caducidad");
  const dosDiscosCol = columns.find((c) => c.type === "CHECKBOX");

  const discoOptions = discoCol?.options ?? [];

  type Item = {
    id: string;
    clientes: string[];
    proyecto: string;
    disco: Option | null;
    ruta: string;
    opt: Option | null;
    resp: Member | null;
    dos: boolean;
    days: number | null;
    cadDate: string;
  };
  const items: Item[] = rows.map((r) => {
    const cadDate = cadCol ? str(r.cells[cadCol.id]) : "";
    const clientIds = clienteCol && Array.isArray(r.cells[clienteCol.id]) ? (r.cells[clienteCol.id] as string[]) : [];
    return {
      id: r.id,
      clientes: clientIds.map((id) => clienteCol?.options?.find((o) => o.id === id)?.label ?? "").filter(Boolean),
      proyecto: proyectoCol ? str(r.cells[proyectoCol.id]) : "",
      disco: discoCol ? discoOptions.find((o) => o.id === r.cells[discoCol.id]) ?? null : null,
      ruta: rutaCol ? str(r.cells[rutaCol.id]) : "",
      opt: optCol ? optCol.options?.find((o) => o.id === r.cells[optCol.id]) ?? null : null,
      resp: respCol ? team.find((m) => m.id === r.cells[respCol.id]) ?? null : null,
      dos: dosDiscosCol ? Boolean(r.cells[dosDiscosCol.id]) : false,
      days: daysUntil(cadDate),
      cadDate,
    };
  });

  const isSoon = (it: Item) => it.days !== null && it.days <= 30;
  const total = items.length;
  const porVencer = items.filter(isSoon).length;
  const discosEnUso = new Set(items.map((it) => it.disco?.id).filter(Boolean)).size;
  const enDos = items.filter((it) => it.dos).length;

  const q = query.trim().toLowerCase();
  const filtered = items.filter((it) => {
    if (onlySoon && !isSoon(it)) return false;
    if (!q) return true;
    return (
      it.proyecto.toLowerCase().includes(q) ||
      it.ruta.toLowerCase().includes(q) ||
      it.clientes.some((c) => c.toLowerCase().includes(q))
    );
  });

  // Agrupa por disco, respetando el orden de las opciones; los sin disco al final.
  const groups: { disco: Option | null; items: Item[] }[] = [];
  for (const o of discoOptions) {
    const g = filtered.filter((it) => it.disco?.id === o.id);
    if (g.length) groups.push({ disco: o, items: g });
  }
  const sinDisco = filtered.filter((it) => !it.disco);
  if (sinDisco.length) groups.push({ disco: null, items: sinDisco });

  return (
    <div className="space-y-5">
      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Respaldos" value={total} />
        <Kpi label="Por vencer · 30 d" value={porVencer} danger={porVencer > 0} />
        <Kpi label="Discos en uso" value={discosEnUso} />
        <Kpi label="En 2 discos" value={enDos} />
      </div>

      {/* Alerta de caducidades próximas */}
      {porVencer > 0 ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0" />
          <p>
            <b>{porVencer} respaldo{porVencer === 1 ? "" : "s"}</b> vence{porVencer === 1 ? "" : "n"} en los próximos 30 días. Revísalos antes de liberar espacio.
          </p>
        </div>
      ) : null}

      {/* Buscador + filtro */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente, proyecto o ruta…"
            className="w-56 bg-transparent text-sm outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setOnlySoon((v) => !v)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            onlySoon ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Solo por vencer
        </button>
      </div>

      {/* Discos */}
      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No hay respaldos que coincidan.
        </p>
      ) : (
        groups.map(({ disco, items }) => {
          const soon = items.filter(isSoon).length;
          return (
            <div key={disco?.id ?? "sin"} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
                <HardDrive className="size-4 text-muted-foreground" />
                <span className="text-sm font-semibold">{disco?.label ?? "Sin disco asignado"}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", disco ? tone(disco.color).chip : "bg-muted text-muted-foreground")}>
                  {items.length} respaldo{items.length === 1 ? "" : "s"}
                </span>
                {soon > 0 ? (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">{soon} por vencer</span>
                ) : null}
              </div>
              <div className="divide-y divide-border">
                {items.map((it) => (
                  <BackupRow key={it.id} item={it} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function Kpi({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold", danger && "text-red-600 dark:text-red-400")}>{value}</p>
    </div>
  );
}

function BackupRow({ item }: { item: { clientes: string[]; proyecto: string; ruta: string; opt: { label: string; color: string } | null; resp: { initials: string | null; color: string | null; name: string } | null; days: number | null; cadDate: string } }) {
  const e = expiry(item.days, item.cadDate);
  const title = [item.clientes.join(", "), item.proyecto].filter(Boolean).join(" · ") || "Sin título";
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className={cn("size-2.5 shrink-0 rounded-full", tone(e.color).dot)} title={e.label} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {item.ruta ? <CopyPath path={item.ruta} /> : null}
      </div>
      {item.opt ? (
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium", tone(item.opt.color).chip)}>
          {item.opt.label === "Sí" ? "Optimizado" : "Sin optimizar"}
        </span>
      ) : null}
      {item.resp ? <UserAvatar initials={item.resp.initials} name={item.resp.name} color={item.resp.color} size="sm" /> : null}
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", tone(e.color).chip)}>{e.label}</span>
    </div>
  );
}

function CopyPath({ path }: { path: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(path);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* noop */
        }
      }}
      className="mt-0.5 flex max-w-full items-center gap-1 truncate font-mono text-[11px] text-muted-foreground hover:text-foreground"
      title="Copiar ruta"
    >
      <span className="truncate">{path}</span>
      {copied ? <Check className="size-3 shrink-0 text-emerald-600" /> : <Copy className="size-3 shrink-0" />}
    </button>
  );
}
