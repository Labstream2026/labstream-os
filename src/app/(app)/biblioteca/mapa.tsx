"use client";

import { useMemo, useState } from "react";
import { Check, Download, Map as MapIcon, Plus, X } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MATERIAL_ROLES, ROLE_LABEL, type MaterialHealth } from "@/lib/material-health";
import { addMaterialLocation, removeMaterialLocation, verifyMaterialLocation } from "./disk-actions";

export type MapLocation = {
  id: string;
  role: string;
  path: string | null;
  diskId: string;
  diskName: string;
  diskColor: string | null;
  verifiedDays: number | null;
};

export type MapProject = {
  id: string;
  name: string;
  clientName: string | null;
  finished: boolean;
  locations: MapLocation[];
  health: MaterialHealth;
};

export type MapDiskOption = { id: string; name: string; color: string | null };

const inputCls = "rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function HealthChip({ h }: { h: MaterialHealth }) {
  const tone =
    h.level === "OK"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : h.level === "PARCIAL"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : h.level === "SIN_RESPALDO"
          ? "bg-red-500/10 text-red-600 dark:text-red-400"
          : "bg-accent text-muted-foreground";
  const title =
    h.level === "OK"
      ? "3 copias, 2 soportes, 1 fuera del estudio"
      : h.level === "SIN_REGISTRO"
        ? "Nadie ha registrado dónde vive este material"
        : `${h.copies} copia(s) en ${h.media} soporte(s), ${h.offsite} fuera del estudio`;
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      ● {h.label}
    </span>
  );
}

// Chip de una ubicación: disco + acciones (verificar / quitar).
function LocChip({ loc, canManage }: { loc: MapLocation; canManage: boolean }) {
  const stale = loc.verifiedDays != null && loc.verifiedDays > 180;
  const title = [
    loc.path ? `Ruta: ${loc.path}` : null,
    loc.verifiedDays == null ? "Sin verificar" : loc.verifiedDays === 0 ? "Verificado hoy" : `Verificado hace ${loc.verifiedDays} días`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      title={title}
      className="group/chip inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 text-xs font-medium"
    >
      <span className="size-2 shrink-0 rounded-sm" style={{ background: loc.diskColor ?? "#94a3b8" }} />
      <span className="truncate">{loc.diskName}</span>
      {stale ? <span title="Hace más de 6 meses nadie confirma esta copia">⚠️</span> : null}
      {canManage ? (
        <span className="hidden items-center gap-0.5 group-hover/chip:inline-flex">
          <form action={verifyMaterialLocation.bind(null, loc.id)} className="inline-flex">
            <button className="text-muted-foreground hover:text-emerald-500" title="Sigue ahí (verificar hoy)">
              <Check className="size-3" />
            </button>
          </form>
          <form action={removeMaterialLocation.bind(null, loc.id)} className="inline-flex">
            <button className="text-muted-foreground hover:text-destructive" title="Quitar del mapa">
              <X className="size-3" />
            </button>
          </form>
        </span>
      ) : null}
    </span>
  );
}

function AddLocationRow({ projectId, disks, onDone }: { projectId: string; disks: MapDiskOption[]; onDone: () => void }) {
  return (
    <form action={addMaterialLocation} onSubmit={onDone} className="flex flex-wrap items-center gap-2 bg-accent/40 px-3 py-2.5">
      <input type="hidden" name="projectId" value={projectId} />
      <select name="role" defaultValue="BRUTO" className={`w-32 ${inputCls}`}>
        {MATERIAL_ROLES.map((r) => (
          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
        ))}
      </select>
      <select name="diskId" required defaultValue="" className={`w-48 ${inputCls}`}>
        <option value="" disabled>Disco…</option>
        {disks.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <input name="path" placeholder="Ruta dentro del disco (opcional)" className={`min-w-52 flex-1 font-mono ${inputCls}`} />
      <button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Registrar</button>
      <button type="button" onClick={onDone} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent" title="Cancelar">
        <X className="size-4" />
      </button>
    </form>
  );
}

export function Mapa({ projects, disks, canManage }: {
  projects: MapProject[];
  disks: MapDiskOption[];
  canManage: boolean;
}) {
  const [q, setQ] = useState("");
  const [soloRiesgo, setSoloRiesgo] = useState(false);
  const [addingFor, setAddingFor] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    return projects.filter((p) => {
      if (soloRiesgo && p.health.level !== "SIN_RESPALDO" && p.health.level !== "SIN_REGISTRO") return false;
      if (!nq) return true;
      return norm(`${p.name} ${p.clientName ?? ""}`).includes(nq);
    });
  }, [projects, q, soloRiesgo]);

  const enRiesgo = projects.filter((p) => p.health.level === "SIN_RESPALDO" || p.health.level === "SIN_REGISTRO").length;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar proyecto o cliente…"
          className={`min-w-56 flex-1 ${inputCls}`}
        />
        <button
          type="button"
          onClick={() => setSoloRiesgo((v) => !v)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
            soloRiesgo ? "border-red-500 bg-red-500/10 text-red-600 dark:text-red-400" : "border-border bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          ⚠ En riesgo · {enRiesgo}
        </button>
        <a
          href="/api/material-map/export"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          title="Descarga el mapa completo (proyecto × disco × ruta × verificación)"
        >
          <Download className="size-3.5" /> CSV
        </a>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<MapIcon className="size-6" />}
            title={projects.length === 0 ? "Sin proyectos a la vista" : "Nada coincide"}
            description={projects.length === 0 ? "Cuando haya proyectos, aquí se registra en qué disco vive su material." : "Prueba con otro término o quita el filtro."}
          />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3.5 py-2.5">Proyecto</th>
                {MATERIAL_ROLES.map((r) => (
                  <th key={r} className="px-3.5 py-2.5">{ROLE_LABEL[r]}</th>
                ))}
                <th className="px-3.5 py-2.5">Salud</th>
                {canManage ? <th className="w-10 px-2 py-2.5" /> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <RowGroup key={p.id} p={p} disks={disks} canManage={canManage} adding={addingFor === p.id} setAdding={(v) => setAddingFor(v ? p.id : null)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span><span className="text-emerald-500">●</span> 3-2-1 ✓ — 3 copias, 2 soportes, 1 fuera</span>
        <span><span className="text-amber-500">●</span> Parcial — hay copias pero falta algo</span>
        <span><span className="text-red-500">●</span> Sin respaldo — una sola copia</span>
        <span>● Sin registrar — nadie ha anotado dónde vive</span>
      </div>
    </div>
  );
}

function RowGroup({ p, disks, canManage, adding, setAdding }: {
  p: MapProject;
  disks: MapDiskOption[];
  canManage: boolean;
  adding: boolean;
  setAdding: (v: boolean) => void;
}) {
  const cols = canManage ? MATERIAL_ROLES.length + 3 : MATERIAL_ROLES.length + 2;
  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="max-w-56 px-3.5 py-2.5 align-top">
          <p className="truncate font-medium">{p.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {p.clientName ?? "Sin cliente"}
            {p.finished ? " · Terminado" : ""}
          </p>
        </td>
        {MATERIAL_ROLES.map((role) => {
          const locs = p.locations.filter((l) => l.role === role);
          return (
            <td key={role} className="px-3.5 py-2.5 align-top">
              {locs.length === 0 ? (
                <span className="text-muted-foreground/50">—</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {locs.map((l) => (
                    <LocChip key={l.id} loc={l} canManage={canManage} />
                  ))}
                </span>
              )}
            </td>
          );
        })}
        <td className="px-3.5 py-2.5 align-top">
          <HealthChip h={p.health} />
        </td>
        {canManage ? (
          <td className="px-2 py-2.5 align-top">
            <button
              type="button"
              onClick={() => setAdding(!adding)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Registrar ubicación"
            >
              <Plus className="size-4" />
            </button>
          </td>
        ) : null}
      </tr>
      {adding ? (
        <tr className="border-b border-border last:border-0">
          <td colSpan={cols} className="p-0">
            <AddLocationRow projectId={p.id} disks={disks} onDone={() => setAdding(false)} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
