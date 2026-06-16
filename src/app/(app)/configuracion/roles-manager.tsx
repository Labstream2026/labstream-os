"use client";

import * as React from "react";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TONES, tone } from "@/lib/colors";
import { RolePermissions } from "./role-permissions";
import { createRole, updateRole, deleteRole } from "./actions";

type Perm = { key: string; label: string; category: string };
export type RoleRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  emoji: string | null;
  color: string | null;
  isSystem: boolean;
  userCount: number;
  assigned: string[];
};

export function RolesManager({
  roles,
  permissions,
  categories,
}: {
  roles: RoleRow[];
  permissions: Perm[];
  categories: string[];
}) {
  const [creating, setCreating] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const roleOptions = roles.map((r) => ({ key: r.key, name: r.name }));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, onOk?: () => void) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "No se pudo aplicar.");
      else onOk?.();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Crea roles a medida, define sus permisos por categoría y reasígnalos. El rol Administrador tiene acceso total.
        </p>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          {creating ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {creating ? "Cancelar" : "Nuevo rol"}
        </button>
      </div>

      {creating ? (
        <form
          action={(fd) => run(() => createRole(fd), () => setCreating(false))}
          className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2"
        >
          <div className="sm:col-span-2 flex gap-2">
            <input name="emoji" placeholder="🎬" maxLength={2} className="w-14 rounded-md border border-input bg-background px-2 py-2 text-center text-sm outline-none focus:ring-2 focus:ring-ring" />
            <input name="name" required placeholder="Nombre del rol (ej. Coordinador)" className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <input name="description" placeholder="Descripción (opcional)" className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <select name="copyFromKey" defaultValue="" className="rounded-md border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">Sin permisos al empezar</option>
            {roleOptions.map((r) => (
              <option key={r.key} value={r.key}>Copiar permisos de: {r.name}</option>
            ))}
          </select>
          <ColorPicker name="color" />
          <div className="sm:col-span-2">
            <button disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              Crear rol
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}

      {roles.map((r) => {
        const hex = tone(r.color).hex;
        const editing = editingId === r.id;
        return (
          <div key={r.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg text-lg" style={{ backgroundColor: `${hex}22` }}>
                  {r.emoji ?? <span className="text-sm" style={{ color: hex }}>●</span>}
                </span>
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-semibold">
                    {r.name}
                    {r.isSystem ? <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">sistema</span> : null}
                  </h3>
                  <p className="truncate text-xs text-muted-foreground">{r.description ?? "—"}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                  {r.userCount} usuario{r.userCount === 1 ? "" : "s"}
                </span>
                <button type="button" onClick={() => setEditingId(editing ? null : r.id)} title="Editar rol" className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent">
                  <Pencil className="size-3.5" />
                </button>
                {!r.isSystem ? (
                  <DeleteRole role={r} roleOptions={roleOptions} pending={pending} onDelete={(toKey) => run(() => deleteRole(r.id, toKey))} />
                ) : null}
              </div>
            </div>

            {editing ? (
              <form
                action={(fd) => run(() => updateRole(r.id, fd), () => setEditingId(null))}
                className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-border bg-background/60 p-3 sm:grid-cols-2"
              >
                <div className="flex gap-2">
                  <input name="emoji" defaultValue={r.emoji ?? ""} placeholder="🎬" maxLength={2} className="w-14 rounded-md border border-input bg-background px-2 py-2 text-center text-sm outline-none focus:ring-2 focus:ring-ring" />
                  <input name="name" defaultValue={r.name} className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <input name="description" defaultValue={r.description ?? ""} placeholder="Descripción" className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                <ColorPicker name="color" value={r.color} />
                <div>
                  <button disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Guardar</button>
                </div>
              </form>
            ) : null}

            <div className="mt-3">
              <RolePermissions roleId={r.id} roleKey={r.key} permissions={permissions} categories={categories} assigned={r.assigned} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ColorPicker({ name, value }: { name: string; value?: string | null }) {
  const [sel, setSel] = React.useState(value ?? "");
  return (
    <div className="flex flex-wrap items-center gap-1">
      <input type="hidden" name={name} value={sel} />
      {TONES.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => setSel(t.key === sel ? "" : t.key)}
          title={t.label}
          className={cn("size-5 rounded-full border-2", sel === t.key ? "border-foreground" : "border-transparent")}
          style={{ backgroundColor: t.hex }}
        />
      ))}
    </div>
  );
}

function DeleteRole({
  role,
  roleOptions,
  pending,
  onDelete,
}: {
  role: RoleRow;
  roleOptions: { key: string; name: string }[];
  pending: boolean;
  onDelete: (toKey: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const fallbacks = roleOptions.filter((o) => o.key !== role.key);
  const [toKey, setToKey] = React.useState(fallbacks[0]?.key ?? "");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} title="Eliminar rol" className="rounded-md border border-border p-1.5 text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
        <Trash2 className="size-3.5" />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 p-1.5">
      <span className="text-[11px] text-muted-foreground">Reasignar a</span>
      <select value={toKey} onChange={(e) => setToKey(e.target.value)} className="rounded border border-border bg-card px-1.5 py-0.5 text-[11px] outline-none">
        {fallbacks.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}
      </select>
      <button type="button" disabled={pending || !toKey} onClick={() => { onDelete(toKey); setOpen(false); }} className="rounded bg-destructive px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-50">
        Borrar
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded px-1 text-[11px] text-muted-foreground">✕</button>
    </div>
  );
}
