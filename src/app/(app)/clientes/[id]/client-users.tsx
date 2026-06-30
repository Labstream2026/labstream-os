"use client";

import * as React from "react";
import { UserAvatar } from "@/components/user-avatar";
import { Mail, Send, X, Clock, CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { inviteClientUser, resendClientInvite, removeClientMember } from "@/app/(app)/clientes/actions";

export type ClientUserItem = { id: string; name: string; email: string; initials: string | null; color: string | null; pending: boolean };

// Personas del CLIENTE con acceso al portal (rol cliente). El admin invita por correo; varias
// personas pueden pertenecer al mismo cliente/empresa, cada una con sus propios proyectos.
export function ClientUsers({
  clientId,
  users,
  canInvite,
}: {
  clientId: string;
  users: ClientUserItem[];
  canInvite: boolean;
}) {
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const r = await inviteClientUser(clientId, name, email);
      if (!r.ok) { setMsg({ kind: "err", text: r.error ?? "No se pudo invitar." }); return; }
      setName(""); setEmail("");
      setMsg({
        kind: "ok",
        text: r.reused
          ? "Persona ligada a este cliente."
          : r.emailSent
            ? "Invitación enviada por correo."
            : "Usuario creado. Aún no se pudo enviar el correo (configura el correo en Integraciones).",
      });
    });
  };

  const resend = (userId: string) => {
    setMsg(null);
    start(async () => {
      const r = await resendClientInvite(clientId, userId);
      setMsg(r.ok ? { kind: "ok", text: r.emailSent ? "Invitación reenviada." : "No se pudo enviar el correo (revisa Integraciones)." } : { kind: "err", text: r.error ?? "Error" });
    });
  };

  const remove = (userId: string) => {
    setMsg(null);
    start(async () => {
      const r = await removeClientMember(clientId, userId);
      if (!r.ok) setMsg({ kind: "err", text: r.error ?? "Error" });
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Personas del cliente (portal)</h3>
        <span className="text-xs text-muted-foreground">{users.length}</span>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Entran con su correo y contraseña (no por Authentik) y ven solo sus proyectos.</p>

      <div className="space-y-1.5">
        {users.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nadie del cliente todavía. Invítalos abajo.</p>
        ) : (
          users.map((u) => (
            <div key={u.id} className="flex items-center gap-2.5">
              <UserAvatar initials={u.initials} color={u.color} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{u.name}</div>
                <div className="truncate text-xs text-muted-foreground">{u.email}</div>
              </div>
              {u.pending ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"><Clock className="size-3" /> Pendiente</span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"><CheckCircle2 className="size-3" /> Activo</span>
              )}
              {canInvite && u.pending ? (
                <button type="button" disabled={pending} onClick={() => resend(u.id)} title="Reenviar invitación" aria-label={`Reenviar invitación a ${u.name}`} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                  <Send className="size-4" />
                </button>
              ) : null}
              {canInvite ? (
                <button type="button" disabled={pending} onClick={() => remove(u.id)} title="Quitar acceso" aria-label={`Quitar acceso a ${u.name}`} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50">
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {canInvite ? (
        <form onSubmit={invite} className="mt-3 space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><UserPlus className="size-3.5" /> Invitar persona</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (p. ej. Luis Felipe)" className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Mail className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="correo@empresa.com" className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <button type="submit" disabled={pending || !name.trim() || !email.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Invitar
            </button>
          </div>
        </form>
      ) : null}

      {msg ? <p className={`mt-2 text-xs ${msg.kind === "ok" ? "text-emerald-600" : "text-destructive"}`}>{msg.text}</p> : null}
    </div>
  );
}
