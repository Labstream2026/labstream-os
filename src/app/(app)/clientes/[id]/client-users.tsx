"use client";

import * as React from "react";
import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import { Mail, Send, X, Copy, Check, Loader2, UserPlus, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { inviteClientUser, resendClientInvite, removeClientMember } from "@/app/(app)/clientes/actions";

export type ClientUserItem = { id: string; name: string; email: string; initials: string | null; color: string | null; pending: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Personas del CLIENTE con acceso al portal (rol cliente). El admin invita por correo; varias
// personas pueden pertenecer al mismo cliente/empresa, cada una con sus propios proyectos.
// Quitar el acceso pide confirmación (antes la X lo quitaba al instante: un clic accidental
// dejaba al cliente por fuera sin aviso).
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
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  const emailOk = EMAIL_RE.test(email.trim());

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
    setRemoving(null);
    setMsg(null);
    start(async () => {
      const r = await removeClientMember(clientId, userId);
      if (!r.ok) setMsg({ kind: "err", text: r.error ?? "Error" });
    });
  };

  const copyEmail = async (u: ClientUserItem) => {
    try {
      await navigator.clipboard.writeText(u.email);
      setCopied(u.id);
      setTimeout(() => setCopied((v) => (v === u.id ? null : v)), 1500);
    } catch { /* ignora */ }
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
            <div key={u.id} className="group rounded-lg px-1 py-0.5 -mx-1 hover:bg-muted/40">
              <div className="flex items-center gap-2.5">
                {/* Punto de estado sobre el avatar: verde = ya entró, ámbar = invitación pendiente. */}
                <span className="relative shrink-0">
                  <UserAvatar initials={u.initials} color={u.color} size="sm" />
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card",
                      u.pending ? "bg-amber-400" : "bg-emerald-500",
                    )}
                    title={u.pending ? "Invitación pendiente" : "Activo"}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{u.name}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="truncate">{u.email}</span>
                    <button
                      type="button"
                      onClick={() => copyEmail(u)}
                      title="Copiar correo"
                      aria-label={`Copiar correo de ${u.name}`}
                      className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                    >
                      {copied === u.id ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                    </button>
                  </div>
                </div>
                {/* «Ver como cliente»: abre la vista previa del portal EXACTO de esta persona. */}
                <Link
                  href={`/clientes/${clientId}/portal?usuario=${u.id}`}
                  title={`Ver el portal como ${u.name}`}
                  aria-label={`Ver el portal como ${u.name}`}
                  className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                >
                  <Eye className="size-4" />
                </Link>
                {canInvite && u.pending ? (
                  <button type="button" disabled={pending} onClick={() => resend(u.id)} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                    <Send className="size-3" /> Reenviar
                  </button>
                ) : null}
                {canInvite ? (
                  <button type="button" disabled={pending} onClick={() => setRemoving(u.id)} title="Quitar acceso" aria-label={`Quitar acceso a ${u.name}`} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50">
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
              {removing === u.id ? (
                <div className="mt-1.5 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5">
                  <span className="min-w-0 flex-1 text-xs">¿Quitar el acceso de <strong>{u.name}</strong> al portal?</span>
                  <button type="button" disabled={pending} onClick={() => remove(u.id)} className="shrink-0 rounded-md bg-destructive px-2 py-1 text-[11px] font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">Quitar</button>
                  <button type="button" disabled={pending} onClick={() => setRemoving(null)} className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-50">Cancelar</button>
                </div>
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
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="correo@empresa.com"
                className={cn(
                  "w-full rounded-md border bg-background py-1.5 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring",
                  email.trim() && !emailOk ? "border-destructive/60" : "border-input",
                )}
              />
            </div>
            <button type="submit" disabled={pending || !name.trim() || !emailOk} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Invitar
            </button>
          </div>
          {email.trim() && !emailOk ? <p className="text-[11px] text-destructive">Escribe un correo válido para poder invitar.</p> : null}
        </form>
      ) : null}

      {msg ? <p className={`mt-2 text-xs ${msg.kind === "ok" ? "text-emerald-600" : "text-destructive"}`}>{msg.text}</p> : null}
    </div>
  );
}
