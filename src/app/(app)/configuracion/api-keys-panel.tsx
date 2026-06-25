"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, Copy, Check, Trash2, Ban, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { createAppKey, revokeAppKey, deleteAppKey, createServiceUser } from "./api-keys-actions";

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  readOnly: boolean;
  userName: string;
  lastUsedAt: string | null;
  revoked: boolean;
};
type Opt = { id: string; name: string };
type Perm = { key: string; label: string; category: string };

function timeAgo(iso: string | null): string {
  if (!iso) return "nunca";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export function ApiKeysPanel({ keys, users, roles, perms }: { keys: ApiKeyRow[]; users: Opt[]; roles: { key: string; name: string }[]; perms: Perm[] }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirmDialog();
  const [pending, start] = React.useTransition();
  const [creating, setCreating] = React.useState(false);
  const [svc, setSvc] = React.useState(false);
  const [secret, setSecret] = React.useState<{ value: string; prefix: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [showSecret, setShowSecret] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const categories = [...new Set(perms.map((p) => p.category))];

  async function onCreate(fd: FormData) {
    setError(null);
    const r = await createAppKey(fd);
    if (r.ok && r.secret) {
      setSecret({ value: r.secret, prefix: r.prefix ?? "" });
      setShowSecret(true);
      setCreating(false);
      router.refresh();
    } else {
      setError(r.error ?? "No se pudo crear la credencial.");
    }
  }

  async function onCreateSvc(fd: FormData) {
    setError(null);
    const r = await createServiceUser(fd);
    if (r.ok) { setSvc(false); router.refresh(); } else setError(r.error ?? "No se pudo crear el usuario de servicio.");
  }

  const inputCls = "rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-4">
      {dialog}
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
        <KeyRound className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="text-sm">
          <p className="font-medium">API de integraciones (/api/v1)</p>
          <p className="text-muted-foreground">
            Credenciales para que servicios externos (gateway de OpenClaw, n8n, GPTs…) le pidan información a la IA o datos, <span className="font-medium text-foreground">respetando los permisos del usuario titular</span>. El secreto se muestra <span className="font-medium text-foreground">una sola vez</span>.
          </p>
        </div>
      </div>

      {/* Secreto recién creado (se muestra una vez). */}
      {secret ? (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-800 dark:text-emerald-300"><Check className="size-4" /> Credencial creada · cópiala ahora (no se vuelve a mostrar)</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-emerald-300 bg-background px-3 py-2 font-mono text-sm dark:border-emerald-500/30">
              {showSecret ? secret.value : `${secret.prefix}${"•".repeat(28)}`}
            </code>
            <button type="button" onClick={() => setShowSecret((v) => !v)} className="rounded-md border border-border p-2 text-muted-foreground hover:bg-accent" title={showSecret ? "Ocultar" : "Mostrar"}>
              {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
            <button
              type="button"
              onClick={async () => { try { await navigator.clipboard.writeText(secret.value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              {copied ? <><Check className="size-4" /> Copiada</> : <><Copy className="size-4" /> Copiar</>}
            </button>
          </div>
          <button type="button" onClick={() => setSecret(null)} className="mt-2 text-xs text-emerald-800 hover:underline dark:text-emerald-300">Listo, ya la guardé</button>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setCreating((v) => !v); setSvc(false); }} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="size-4" /> Nueva credencial
        </button>
        <button type="button" onClick={() => { setSvc((v) => !v); setCreating(false); }} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-sm font-medium hover:bg-accent">
          <Plus className="size-4" /> Usuario de servicio
        </button>
      </div>

      {/* Crear usuario de servicio (techo de permisos para la key del gateway). */}
      {svc ? (
        <form action={(fd) => start(() => onCreateSvc(fd))} className="grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_auto_auto]">
          <input name="name" required placeholder="Nombre (ej. OpenClaw Gateway)" className={inputCls} />
          <select name="roleKey" required defaultValue="" className={inputCls}>
            <option value="" disabled>Rol acotado…</option>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
          </select>
          <button disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Crear</button>
        </form>
      ) : null}

      {/* Crear credencial. */}
      {creating ? (
        <form action={(fd) => start(() => onCreate(fd))} className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Nombre</span>
              <input name="name" required placeholder="Gateway OpenClaw" className={cn(inputCls, "w-full")} />
            </label>
            <label className="block"><span className="mb-1 block text-xs font-medium text-muted-foreground">Usuario titular (techo de permisos)</span>
              <select name="userId" required defaultValue="" className={cn(inputCls, "w-full")}>
                <option value="" disabled>Elige usuario…</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="readOnly" value="1" className="size-4" /> Solo lectura</label>
            <label className="inline-flex items-center gap-2 text-sm">Límite/min <input type="number" name="rateLimitPerMin" defaultValue={120} min={1} max={6000} className={cn(inputCls, "w-24")} /></label>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Scopes (opcional · vacío = todos los permisos del usuario). Ctrl/⌘+clic para varios.</p>
            <select name="scopes" multiple size={6} className={cn(inputCls, "w-full")}>
              {categories.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {perms.filter((p) => p.category === cat).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <button disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Crear credencial</button>
        </form>
      ) : null}

      {/* Lista de credenciales. */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {keys.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Sin credenciales. Crea una para conectar OpenClaw u otro servicio.</p>
        ) : (
          <ul className="divide-y divide-border">
            {keys.map((k) => (
              <li key={k.id} className={cn("flex items-center gap-3 px-4 py-3", k.revoked && "opacity-60")}>
                <KeyRound className={cn("size-4 shrink-0", k.revoked ? "text-muted-foreground" : "text-primary")} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{k.name}</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{k.prefix}…</code>
                    {k.readOnly ? <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">solo lectura</span> : null}
                    {k.scopes.length ? <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"><ShieldCheck className="size-3" />{k.scopes.length} scope{k.scopes.length === 1 ? "" : "s"}</span> : null}
                    {k.revoked ? <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">revocada</span> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">Titular: {k.userName} · uso {timeAgo(k.lastUsedAt)}</p>
                </div>
                {!k.revoked ? (
                  <button type="button" disabled={pending} onClick={async () => { if (await confirm({ title: "Revocar credencial", message: `¿Revocar «${k.name}»? Dejará de funcionar al instante.`, confirmLabel: "Revocar", danger: true })) start(async () => { await revokeAppKey(k.id); router.refresh(); }); }} className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10" title="Revocar">
                    <Ban className="size-3.5" /> Revocar
                  </button>
                ) : (
                  <button type="button" disabled={pending} onClick={() => start(async () => { await deleteAppKey(k.id); router.refresh(); })} className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-destructive" title="Eliminar">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
