"use client";

import * as React from "react";
import { Eye, EyeOff, Copy, Check, Trash2, Share2, Plus, KeyRound, ExternalLink, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import { ConfirmSubmit } from "@/components/confirm-submit";
import {
  createCredential,
  updateCredential,
  deleteCredential,
  revealCredential,
  addCredentialViewer,
  removeCredentialViewer,
} from "./actions";

type TeamMember = { id: string; name: string; initials: string | null; color: string | null };
export type Cred = {
  id: string;
  title: string;
  category: string | null;
  username: string | null;
  url: string | null;
  notes: string | null;
  ownerName: string | null;
  createdByName: string | null;
  viewers: TeamMember[];
  canManage: boolean;
};

function CopyButton({ getValue, label = "Copiar" }: { getValue: () => Promise<string> | string; label?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      title={label}
      onClick={async () => {
        try { await navigator.clipboard.writeText(await getValue()); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* */ }
      }}
      className="rounded p-1 text-muted-foreground hover:text-foreground"
    >
      {done ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function CredentialCard({ cred, team }: { cred: Cred; team: TeamMember[] }) {
  const [revealed, setRevealed] = React.useState<string | null>(null);
  const [revealErr, setRevealErr] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const [share, setShare] = React.useState(false);
  const [editing, setEditing] = React.useState(false);

  const reveal = () => {
    if (revealed) { setRevealed(null); return; }
    setRevealErr(null);
    start(async () => {
      try {
        const v = await revealCredential(cred.id);
        setRevealed(v);
        setTimeout(() => setRevealed(null), 30000); // se oculta sola a los 30s
      } catch { setRevealErr("No tienes permiso para ver esta contraseña."); }
    });
  };

  if (editing) return <CredentialForm team={team} cred={cred} onDone={() => setEditing(false)} />;

  const candidates = team.filter((t) => !cred.viewers.some((v) => v.id === t.id));

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"><KeyRound className="size-4 text-muted-foreground" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{cred.title}</p>
            {cred.category ? <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{cred.category}</span> : null}
          </div>
          {cred.ownerName ? <p className="text-xs text-muted-foreground">Cuenta de {cred.ownerName}</p> : null}
        </div>
        {cred.canManage ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <button onClick={() => setShare((v) => !v)} title="Compartir" className={cn("rounded p-1.5 text-muted-foreground hover:text-foreground", share && "bg-accent text-foreground")}><Share2 className="size-4" /></button>
            <button onClick={() => setEditing(true)} title="Editar" className="rounded p-1.5 text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>
            <form action={deleteCredential.bind(null, cred.id)}>
              <ConfirmSubmit
                title="Eliminar"
                confirmLabel="Eliminar"
                className="rounded p-1.5 text-muted-foreground hover:text-destructive"
                message={`¿Eliminar la credencial «${cred.title}»? No se puede deshacer.`}
              ><Trash2 className="size-4" /></ConfirmSubmit>
            </form>
          </div>
        ) : null}
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        {cred.username ? (
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-muted-foreground">Usuario</span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{cred.username}</span>
            <CopyButton getValue={() => cred.username ?? ""} />
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-xs text-muted-foreground">Contraseña</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs">{revealed ?? "••••••••••"}</span>
          <button onClick={reveal} disabled={pending} title={revealed ? "Ocultar" : "Revelar"} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50">
            {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
          <CopyButton getValue={() => revealCredential(cred.id)} label="Copiar contraseña" />
        </div>
        {revealErr ? <p className="pl-[5.5rem] text-xs text-destructive">{revealErr}</p> : null}
        {cred.url ? (
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-xs text-muted-foreground">Enlace</span>
            <a href={cred.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-xs text-primary hover:underline">{cred.url}</a>
            <ExternalLink className="size-3.5 text-muted-foreground" />
          </div>
        ) : null}
        {cred.notes ? <p className="pt-1 text-xs text-muted-foreground">{cred.notes}</p> : null}
      </div>

      {/* Quién la ve */}
      {cred.canManage && share ? (
        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Quién puede ver esta contraseña (además de los administradores):</p>
          <div className="flex flex-wrap gap-1.5">
            {cred.viewers.map((v) => (
              <span key={v.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                <UserAvatar initials={v.initials} color={v.color} size="sm" /> {v.name}
                <button onClick={() => start(() => removeCredentialViewer(cred.id, v.id))} className="text-muted-foreground hover:text-destructive">×</button>
              </span>
            ))}
            {cred.viewers.length === 0 ? <span className="text-xs text-muted-foreground">Solo administradores y quien la creó.</span> : null}
          </div>
          {candidates.length ? (
            <select
              defaultValue=""
              onChange={(e) => { const id = e.target.value; if (id) start(() => addCredentialViewer(cred.id, id)); e.target.value = ""; }}
              className="mt-2 rounded-md border border-input bg-background px-2 py-1 text-xs"
            >
              <option value="">+ Dar acceso a…</option>
              {candidates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CredentialForm({ team, cred, onDone }: { team: TeamMember[]; cred?: Cred; onDone: () => void }) {
  const action = cred ? updateCredential.bind(null, cred.id) : createCredential;
  const inputCls = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <form
      action={async (fd) => { await action(fd); onDone(); }}
      className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input name="title" defaultValue={cred?.title} required placeholder="Título (ej. Correo Jaime)" className={inputCls} />
        <input name="category" defaultValue={cred?.category ?? ""} placeholder="Categoría (correo, redes…)" className={inputCls} />
        <input name="username" defaultValue={cred?.username ?? ""} placeholder="Usuario / correo" className={inputCls} />
        <input name="secret" type="text" placeholder={cred ? "Nueva contraseña (vacío = no cambiar)" : "Contraseña"} required={!cred} className={inputCls} />
        <input name="url" defaultValue={cred?.url ?? ""} placeholder="Enlace de acceso (https://)" className={inputCls} />
        <select name="ownerUserId" defaultValue="" className={inputCls}>
          <option value="">Dueño de la cuenta (opcional)</option>
          {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <textarea name="notes" defaultValue={cred?.notes ?? ""} rows={2} placeholder="Notas (opcional)" className={cn(inputCls, "resize-y")} />
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onDone} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">{cred ? "Guardar" : "Guardar credencial"}</button>
      </div>
    </form>
  );
}

export function CredentialsClient({ creds, team }: { creds: Cred[]; team: TeamMember[] }) {
  const [adding, setAdding] = React.useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{creds.length} credencial{creds.length === 1 ? "" : "es"} que puedes ver.</p>
        {!adding ? (
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> Nueva credencial
          </button>
        ) : null}
      </div>

      {adding ? <CredentialForm team={team} onDone={() => setAdding(false)} /> : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {creds.map((c) => <CredentialCard key={c.id} cred={c} team={team} />)}
      </div>
      {creds.length === 0 && !adding ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          Aún no hay contraseñas que puedas ver. Crea una nueva o pide acceso a un administrador.
        </p>
      ) : null}
    </div>
  );
}
