"use client";

import * as React from "react";
import { UserPlus, X } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { addClientMember, removeClientMember, setClientMemberRole } from "@/app/(app)/clientes/actions";

export type ClientMemberItem = { id: string; name: string; initials: string | null; color: string | null; role?: string };

export function ClientMembers({
  clientId,
  members,
  addable,
  canManage,
}: {
  clientId: string;
  members: ClientMemberItem[];
  addable: ClientMemberItem[];
  canManage: boolean;
}) {
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Error");
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Acceso al cliente</h3>
        <span className="text-xs text-muted-foreground">{members.length} con acceso</span>
      </div>

      <div className="space-y-1.5">
        {members.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nadie con acceso explícito todavía.</p>
        ) : (
          members.map((m) => (
            <div key={m.id} className="flex items-center gap-2.5">
              <UserAvatar initials={m.initials} color={m.color} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
              {canManage ? (
                <select
                  value={m.role === "RESPONSABLE" ? "RESPONSABLE" : "MIEMBRO"}
                  disabled={pending}
                  onChange={(e) => run(() => setClientMemberRole(clientId, m.id, e.target.value))}
                  className="rounded-md border border-border bg-background px-1.5 py-1 text-xs outline-none"
                  title="Rol en el cliente"
                >
                  <option value="RESPONSABLE">Responsable</option>
                  <option value="MIEMBRO">Miembro</option>
                </select>
              ) : m.role === "RESPONSABLE" ? (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">Responsable</span>
              ) : null}
              {canManage ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => removeClientMember(clientId, m.id))}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                  title="Quitar acceso"
                  aria-label={`Quitar acceso a ${m.name}`}
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {canManage && addable.length > 0 ? (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
          <UserPlus className="size-4 shrink-0 text-muted-foreground" />
          <select
            defaultValue=""
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value;
              if (v) {
                run(() => addClientMember(clientId, v));
                e.target.value = "";
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              Dar acceso a…
            </option>
            {addable.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
