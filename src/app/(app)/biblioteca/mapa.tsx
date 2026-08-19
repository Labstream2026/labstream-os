"use client";

import { useMemo, useState } from "react";
import { Check, Download, Hourglass, Pencil, Plus, X } from "lucide-react";
import { IconMapa } from "@/components/icons";
import { EmptyState } from "@/components/ui/empty-state";
import { MATERIAL_ROLES, ROLE_LABEL, type ExpiryLevel, type MaterialHealth } from "@/lib/material-health";
import { addMaterialLocation, removeMaterialLocation, updateMaterialLocation, verifyMaterialLocation } from "./disk-actions";

export type MapLocation = {
  id: string;
  role: string;
  path: string | null;
  notes: string | null;
  diskId: string;
  diskName: string;
  diskColor: string | null;
  verifiedDays: number | null;
  // Fecha de caducidad en "YYYY-MM-DD" (formato del <input type=date>), y sus días restantes
  // ya calculados en el servidor para no depender del reloj del navegador.
  expiresOn: string | null;
  expiresDays: number | null;
  expiresLabel: string;
  expiresLevel: ExpiryLevel;
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

// Tono del reloj de caducidad. NINGUNA no se pinta: la ausencia de fecha no es una alerta.
const EXPIRY_CLS: Record<ExpiryLevel, string> = {
  NINGUNA: "",
  VENCIDO: "text-red-600 dark:text-red-400",
  PRONTO: "text-red-600 dark:text-red-400",
  MEDIO: "text-amber-600 dark:text-amber-400",
  OK: "text-muted-foreground",
};

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

// Chip de una ubicación: disco + sus dos relojes + acciones.
//
// Son DOS relojes distintos y por eso se pintan por separado: ⚠️ es «hace medio año que nadie
// confirma que esta copia siga ahí» y ⏳ es «hasta cuándo hay que conservarla». Un material
// puede estar perfectamente verificado y aun así tocar borrarlo mañana.
function LocChip({ loc, canManage, onEdit }: { loc: MapLocation; canManage: boolean; onEdit: () => void }) {
  const stale = loc.verifiedDays != null && loc.verifiedDays > 180;
  const title = [
    loc.path ? `Ruta: ${loc.path}` : null,
    loc.verifiedDays == null ? "Sin verificar" : loc.verifiedDays === 0 ? "Verificado hoy" : `Verificado hace ${loc.verifiedDays} días`,
    loc.expiresLevel === "NINGUNA" ? null : `Caducidad: ${loc.expiresLabel}`,
    loc.notes ? `Notas: ${loc.notes}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      title={title}
      className="group/chip inline-flex max-w-36 items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 text-xs font-medium"
    >
      <span className="size-2 shrink-0 rounded-sm" style={{ background: loc.diskColor ?? "#94a3b8" }} />
      <span className="truncate">{loc.diskName}</span>
      {stale ? <span title="Hace más de 6 meses nadie confirma esta copia">⚠️</span> : null}
      {loc.expiresLevel !== "NINGUNA" ? (
        <Hourglass className={`size-3 shrink-0 ${EXPIRY_CLS[loc.expiresLevel]}`} aria-label={`Caducidad: ${loc.expiresLabel}`} />
      ) : null}
      {canManage ? (
        <span className="hidden items-center gap-0.5 group-hover/chip:inline-flex">
          <form action={verifyMaterialLocation.bind(null, loc.id)} className="inline-flex">
            <button className="text-muted-foreground hover:text-emerald-500" title="Sigue ahí (verificar hoy)">
              <Check className="size-3" />
            </button>
          </form>
          <button type="button" onClick={onEdit} className="text-muted-foreground hover:text-foreground" title="Editar ruta, caducidad y notas">
            <Pencil className="size-3" />
          </button>
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

// Formulario de alta y de edición. En edición el disco y el rol no se tocan: son la clave de
// la entrada, y cambiarlos es registrar otra cosa (se quita esta y se añade la nueva).
function LocationForm({ projectId, disks, loc, onDone }: {
  projectId: string;
  disks: MapDiskOption[];
  loc?: MapLocation;
  onDone: () => void;
}) {
  const editando = Boolean(loc);
  return (
    <form
      action={loc ? updateMaterialLocation.bind(null, loc.id) : addMaterialLocation}
      onSubmit={onDone}
      className="flex flex-wrap items-end gap-2 bg-accent/40 px-3 py-2.5"
    >
      {!editando ? <input type="hidden" name="projectId" value={projectId} /> : null}

      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-muted-foreground">
        Tipo
        {editando ? (
          <span className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">{ROLE_LABEL[loc!.role] ?? loc!.role}</span>
        ) : (
          <select name="role" defaultValue="BRUTO" className={`w-32 ${inputCls}`}>
            {MATERIAL_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        )}
      </label>

      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-muted-foreground">
        Disco
        {editando ? (
          <span className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground">{loc!.diskName}</span>
        ) : (
          <select name="diskId" required defaultValue="" className={`w-48 ${inputCls}`}>
            <option value="" disabled>Disco…</option>
            {disks.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </label>

      <label className="flex min-w-52 flex-1 flex-col gap-0.5 text-[11px] font-medium text-muted-foreground">
        Ruta dentro del disco
        <input name="path" defaultValue={loc?.path ?? ""} placeholder="(opcional)" className={`font-mono ${inputCls}`} />
      </label>

      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-muted-foreground" title="Hasta cuándo hay que conservar este material">
        Caducidad
        <input type="date" name="expiresAt" defaultValue={loc?.expiresOn ?? ""} className={`w-40 ${inputCls}`} />
      </label>

      <label className="flex min-w-44 flex-1 flex-col gap-0.5 text-[11px] font-medium text-muted-foreground">
        Notas
        <input name="notes" defaultValue={loc?.notes ?? ""} placeholder="(opcional)" className={inputCls} />
      </label>

      <button className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        {editando ? "Guardar" : "Registrar"}
      </button>
      <button type="button" onClick={onDone} className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent" title="Cancelar">
        <X className="size-4" />
      </button>
    </form>
  );
}

export function Mapa({ projects, disks, canManage, initialRiesgo = false }: {
  projects: MapProject[];
  disks: MapDiskOption[];
  canManage: boolean;
  // Llega encendido desde el resumen («Material en riesgo»): entrar ya filtrado ahorra el
  // paso de buscar el filtro después de haber hecho clic justo en ese dato.
  initialRiesgo?: boolean;
}) {
  const [q, setQ] = useState("");
  const [soloRiesgo, setSoloRiesgo] = useState(initialRiesgo);
  const [soloPorVencer, setSoloPorVencer] = useState(false);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);

  const porVencer = (p: MapProject) =>
    p.locations.some((l) => l.expiresLevel === "VENCIDO" || l.expiresLevel === "PRONTO");

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    return projects.filter((p) => {
      if (soloRiesgo && p.health.level !== "SIN_RESPALDO" && p.health.level !== "SIN_REGISTRO") return false;
      if (soloPorVencer && !porVencer(p)) return false;
      if (!nq) return true;
      return norm(`${p.name} ${p.clientName ?? ""}`).includes(nq);
    });
  }, [projects, q, soloRiesgo, soloPorVencer]);

  const enRiesgo = projects.filter((p) => p.health.level === "SIN_RESPALDO" || p.health.level === "SIN_REGISTRO").length;
  const nPorVencer = projects.filter(porVencer).length;

  return (
    <div className="mt-5">
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
        {nPorVencer > 0 ? (
          <button
            type="button"
            onClick={() => setSoloPorVencer((v) => !v)}
            title="Material cuya caducidad ya pasó o llega dentro de 30 días"
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium ${
              soloPorVencer ? "border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <Hourglass className="size-3" /> Por vencer · {nPorVencer}
          </button>
        ) : null}
        <a
          href="/api/material-map/export"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          title="Descarga el mapa completo (proyecto × disco × ruta × verificación × caducidad)"
        >
          <Download className="size-3.5" /> CSV
        </a>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<IconMapa className="size-6" />}
            title={projects.length === 0 ? "Sin proyectos a la vista" : "Nada coincide"}
            description={projects.length === 0 ? "Cuando haya proyectos, aquí se registra en qué disco vive su material." : "Prueba con otro término o quita el filtro."}
          />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5">Proyecto</th>
                {MATERIAL_ROLES.map((r) => (
                  <th key={r} className="px-3 py-2.5">{ROLE_LABEL[r]}</th>
                ))}
                {/* Fija a la derecha: es la conclusión de la fila y con cuatro discos por
                    proyecto se salía de la pantalla justo cuando más falta hacía. */}
                <th
                  className="sticky right-0 z-10 border-l border-border bg-card px-3.5 py-2.5"
                  title="Respaldo 3-2-1 y, debajo, la caducidad más próxima"
                >
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <RowGroup
                  key={p.id}
                  p={p}
                  disks={disks}
                  canManage={canManage}
                  adding={addingFor === p.id}
                  setAdding={(v) => { setAddingFor(v ? p.id : null); setEditando(null); }}
                  editando={editando}
                  setEditando={(v) => { setEditando(v); setAddingFor(null); }}
                />
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
        <span className="inline-flex items-center gap-1"><Hourglass className="size-3" /> Caducidad — hasta cuándo conservarlo</span>
      </div>
    </div>
  );
}

function RowGroup({ p, disks, canManage, adding, setAdding, editando, setEditando }: {
  p: MapProject;
  disks: MapDiskOption[];
  canManage: boolean;
  adding: boolean;
  setAdding: (v: boolean) => void;
  editando: string | null;
  setEditando: (v: string | null) => void;
}) {
  const cols = MATERIAL_ROLES.length + 2; // Proyecto + los cuatro roles + Estado
  const enEdicion = p.locations.find((l) => l.id === editando) ?? null;

  // La caducidad del proyecto es la MÁS PRÓXIMA de sus copias: es la fecha que manda para
  // saber cuándo hay que hacer algo.
  const proxima = p.locations
    .filter((l) => l.expiresDays != null)
    .sort((a, b) => (a.expiresDays ?? 0) - (b.expiresDays ?? 0))[0] ?? null;

  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="max-w-48 px-3 py-2.5 align-top">
          <div className="flex items-start gap-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {p.clientName ?? "Sin cliente"}
                {p.finished ? " · Terminado" : ""}
              </p>
            </div>
            {/* El «+» vive aquí, junto al proyecto al que añade: como última columna se
                perdía en el desplazamiento horizontal de la tabla. */}
            {canManage ? (
              <button
                type="button"
                onClick={() => setAdding(!adding)}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                title={`Registrar dónde vive el material de ${p.name}`}
              >
                <Plus className="size-4" />
              </button>
            ) : null}
          </div>
        </td>
        {MATERIAL_ROLES.map((role) => {
          const locs = p.locations.filter((l) => l.role === role);
          return (
            <td key={role} className="px-3 py-2.5 align-top">
              {locs.length === 0 ? (
                <span className="text-muted-foreground/50">—</span>
              ) : (
                <span className="flex flex-wrap gap-1">
                  {locs.map((l) => (
                    <LocChip key={l.id} loc={l} canManage={canManage} onEdit={() => setEditando(l.id)} />
                  ))}
                </span>
              )}
            </td>
          );
        })}
        {/* Salud del respaldo y caducidad más próxima en la MISMA columna: son las dos
            respuestas sobre el estado del proyecto, y separarlas empujaba la salud fuera de
            la pantalla en cuanto había cuatro discos por fila. */}
        <td className="sticky right-0 z-10 whitespace-nowrap border-l border-border bg-card px-3.5 py-2.5 align-top">
          <HealthChip h={p.health} />
          {proxima ? (
            <p
              className={`mt-1 inline-flex items-center gap-1 text-[11px] ${EXPIRY_CLS[proxima.expiresLevel] || "text-muted-foreground"}`}
              title={`Caducidad más próxima — ${proxima.diskName}: ${proxima.expiresLabel}`}
            >
              <Hourglass className="size-3 shrink-0" /> {proxima.expiresLabel}
            </p>
          ) : null}
        </td>
      </tr>
      {adding || enEdicion ? (
        <tr className="border-b border-border last:border-0">
          <td colSpan={cols} className="p-0">
            <LocationForm
              key={enEdicion?.id ?? "nueva"}
              projectId={p.id}
              disks={disks}
              loc={enEdicion ?? undefined}
              onDone={() => { setAdding(false); setEditando(null); }}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}
