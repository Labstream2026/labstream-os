"use client";

import { useState } from "react";
import { Check, HardDrive, MapPin, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { EmptyState } from "@/components/ui/empty-state";
import { DISK_KINDS, DISK_KIND_LABEL } from "@/lib/material-health";
import {
  addStorageDisk,
  deleteStorageDisk,
  markDiskChecked,
  toggleDiskStatus,
  updateStorageDisk,
} from "./disk-actions";

export type DiskRow = {
  id: string;
  name: string;
  kind: string;
  color: string | null;
  capacityGB: number | null;
  usedGB: number | null; // el del NAS ya llega calculado en vivo desde el servidor
  liveNas: boolean; // la ocupación vino del statfs (no editable a mano)
  location: string | null;
  offsite: boolean;
  isNas: boolean;
  status: string;
  notes: string | null;
  lastCheckDays: number | null; // días desde la última verificación; null = nunca
  nProjects: number;
  nLocations: number;
};

const inputCls = "rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function tbLabel(gb: number | null): string {
  if (gb == null) return "—";
  return `${(gb / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} TB`;
}

// Semáforo de verificación: verde < 3 meses, ámbar < 6, rojo después (o nunca).
function checkTone(days: number | null): { cls: string; label: string } {
  if (days == null) return { cls: "text-red-500", label: "Nunca verificado" };
  const label =
    days === 0 ? "Verificado hoy" : days === 1 ? "Verificado ayer" : days < 60 ? `Verificado hace ${days} días` : `Verificado hace ${Math.round(days / 30)} meses`;
  if (days < 90) return { cls: "text-emerald-600 dark:text-emerald-400", label };
  if (days < 180) return { cls: "text-amber-600 dark:text-amber-400", label };
  return { cls: "text-red-500", label };
}

// Formulario compartido de alta/edición de disco.
function DiskForm({ disk, onDone }: { disk?: DiskRow; onDone: () => void }) {
  const action = disk ? updateStorageDisk.bind(null, disk.id) : addStorageDisk;
  return (
    <form action={action} onSubmit={onDone} className="flex flex-wrap items-center gap-2 p-3">
      <input name="name" required defaultValue={disk?.name ?? ""} placeholder="Nombre (ej. LAB-01 · LaCie 4 TB)" className={`min-w-48 flex-1 ${inputCls}`} />
      <select name="kind" defaultValue={disk?.kind ?? "HDD"} className={`w-32 ${inputCls}`} title="Tipo de soporte">
        {DISK_KINDS.map((k) => (
          <option key={k} value={k}>{DISK_KIND_LABEL[k]}</option>
        ))}
      </select>
      <input name="capacityTB" defaultValue={disk?.capacityGB ? String(disk.capacityGB / 1000) : ""} placeholder="Capacidad TB" inputMode="decimal" className={`w-28 ${inputCls}`} title="Capacidad total en TB (ej. 4 o 3,5)" />
      {disk?.liveNas ? null : (
        <input name="usedTB" defaultValue={disk?.usedGB ? String(disk.usedGB / 1000) : ""} placeholder="Usado TB" inputMode="decimal" className={`w-24 ${inputCls}`} title="Espacio usado en TB (a mano; el NAS se lee solo)" />
      )}
      <input name="location" defaultValue={disk?.location ?? ""} placeholder="Dónde está (ej. Estudio · cajón 2)" className={`min-w-44 flex-1 ${inputCls}`} />
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
        <input type="checkbox" name="offsite" defaultChecked={disk?.offsite ?? false} className="size-4 accent-primary" />
        Fuera del estudio
      </label>
      <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground" title="Lee su ocupación en vivo de Operaciones_LAB">
        <input type="checkbox" name="isNas" defaultChecked={disk?.isNas ?? false} className="size-4 accent-primary" />
        Es el NAS
      </label>
      <input name="notes" defaultValue={disk?.notes ?? ""} placeholder="Notas" className={`min-w-40 flex-1 ${inputCls}`} />
      <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        {disk ? "Guardar" : "Añadir disco"}
      </button>
      <button type="button" onClick={onDone} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent" title="Cancelar">
        <X className="size-4" />
      </button>
    </form>
  );
}

function DiskCard({ d, canManage, onEdit }: { d: DiskRow; canManage: boolean; onEdit: () => void }) {
  const pct = d.capacityGB && d.usedGB != null ? Math.min(100, Math.round((d.usedGB / d.capacityGB) * 100)) : null;
  const check = checkTone(d.lastCheckDays);
  const retired = d.status === "RETIRADO";
  return (
    <div className={`flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 shadow-sm ${retired ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="size-3 shrink-0 rounded" style={{ background: d.color ?? "#94a3b8" }} />
        <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
        <span className="rounded-full border border-border bg-background px-2 py-px text-[11px] font-semibold text-muted-foreground">
          {DISK_KIND_LABEL[d.kind] ?? d.kind}
        </span>
      </div>

      {pct != null ? (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-accent">
            <div className={`h-full rounded-full ${pct >= 90 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span className={pct >= 90 ? "font-medium text-amber-600 dark:text-amber-400" : ""}>
              {tbLabel(d.usedGB)} / {tbLabel(d.capacityGB)}{pct >= 90 ? " — casi lleno" : ""}
            </span>
            <span>{d.nProjects} {d.nProjects === 1 ? "proyecto" : "proyectos"}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {d.capacityGB ? `${tbLabel(d.capacityGB)} · ` : ""}{d.nProjects} {d.nProjects === 1 ? "proyecto" : "proyectos"}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed border-border pt-2 text-xs">
        <span className={check.cls}>● {check.label}</span>
        {d.liveNas ? <span className="text-muted-foreground" title="Ocupación leída del disco en vivo">en vivo</span> : null}
        {d.location ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground"><MapPin className="size-3" /> {d.location}</span>
        ) : null}
        {d.offsite ? <span className="text-muted-foreground">🏠 Fuera del estudio</span> : null}
        {retired ? <span className="font-medium text-muted-foreground">Retirado</span> : null}
      </div>
      {d.notes ? <p className="text-xs text-muted-foreground">{d.notes}</p> : null}

      {canManage ? (
        <div className="flex items-center gap-1 border-t border-border pt-2">
          <form action={markDiskChecked.bind(null, d.id)}>
            <button className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400" title="Lo conecté y abre: verificado hoy">
              <Check className="size-3.5" /> Verificado hoy
            </button>
          </form>
          <span className="flex-1" />
          <button type="button" onClick={onEdit} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title="Editar">
            <Pencil className="size-4" />
          </button>
          <form action={toggleDiskStatus.bind(null, d.id)}>
            <button className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title={retired ? "Reactivar" : "Retirar (deja de ofrecerse al registrar)"}>
              <RotateCcw className="size-4" />
            </button>
          </form>
          {d.nLocations === 0 ? (
            <form action={deleteStorageDisk.bind(null, d.id)}>
              <ConfirmSubmit
                message={`¿Eliminar el disco «${d.name}»? No tiene material registrado.`}
                title="Eliminar"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </ConfirmSubmit>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function Discos({ disks, canManage }: { disks: DiskRow[]; canManage: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing = disks.find((d) => d.id === editingId) ?? null;

  return (
    <div className="mt-6">
      {canManage ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Cada disco del estudio: qué es, dónde está y hace cuánto no se verifica.
          </p>
          <button
            type="button"
            onClick={() => { setAdding((v) => !v); setEditingId(null); }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-4" /> Añadir disco
          </button>
        </div>
      ) : null}

      {canManage && (adding || editing) ? (
        <div className="mt-3 rounded-xl border border-border bg-card">
          {editing ? <p className="border-b border-border px-3 pt-2.5 pb-2 text-sm font-medium">Editar «{editing.name}»</p> : null}
          <DiskForm key={editing?.id ?? "new"} disk={editing ?? undefined} onDone={() => { setAdding(false); setEditingId(null); }} />
        </div>
      ) : null}

      {disks.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<HardDrive className="size-6" />}
            title="Sin discos registrados"
            description="Registra el NAS, los discos externos y la nube para armar el mapa del material."
          />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {disks.map((d) => (
            <DiskCard key={d.id} d={d} canManage={canManage} onEdit={() => { setEditingId(d.id); setAdding(false); }} />
          ))}
        </div>
      )}
    </div>
  );
}
