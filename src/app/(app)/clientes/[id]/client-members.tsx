"use client";

import * as React from "react";
import { Search, UserPlus, X } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { addClientMember, removeClientMember, setClientMemberRole } from "@/app/(app)/clientes/actions";

export type ClientMemberItem = { id: string; name: string; initials: string | null; color: string | null; role?: string };

// Acceso del EQUIPO al cliente. Responsables primero (son quienes responden por la cuenta),
// quitar acceso confirma en dos pasos, y «Dar acceso» es un buscador con la lista filtrada
// (con muchos usuarios el select plano era inmanejable).
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
  const [removing, setRemoving] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Error");
    });
  }

  // Responsables primero, luego por nombre.
  const sorted = React.useMemo(() => {
    return [...members].sort((a, b) => {
      const ra = a.role === "RESPONSABLE" ? 0 : 1;
      const rb = b.role === "RESPONSABLE" ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
    });
  }, [members]);
  const responsables = members.filter((m) => m.role === "RESPONSABLE").length;
  const miembros = members.length - responsables;

  const q = query.trim().toLowerCase();
  const results = q ? addable.filter((u) => u.name.toLowerCase().includes(q)) : addable;

  const add = (userId: string) => {
    setQuery("");
    setSearchOpen(false);
    run(() => addClientMember(clientId, userId));
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Acceso al cliente</h3>
        <span className="text-xs text-muted-foreground">
          {responsables ? <>{responsables} responsable{responsables === 1 ? "" : "s"} · </> : null}
          {miembros} miembro{miembros === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-1.5">
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nadie con acceso explícito todavía.</p>
        ) : (
          sorted.map((m) => (
            <div key={m.id}>
              <div className="flex items-center gap-2.5">
                <UserAvatar initials={m.initials} color={m.color} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                {canManage ? (
                  <select
                    value={m.role === "RESPONSABLE" ? "RESPONSABLE" : "MIEMBRO"}
                    disabled={pending}
                    onChange={(e) => run(() => setClientMemberRole(clientId, m.id, e.target.value))}
                    className="rounded-md border border-border bg-background px-1.5 py-1 text-xs outline-none"
                    title="Responsable: responde por la cuenta y puede gestionar el acceso"
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
                    onClick={() => setRemoving(m.id)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                    title="Quitar acceso"
                    aria-label={`Quitar acceso a ${m.name}`}
                  >
                    <X className="size-4" />
                  </button>
                ) : null}
              </div>
              {removing === m.id ? (
                <div className="mt-1.5 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5">
                  <span className="min-w-0 flex-1 text-xs">¿Quitar el acceso de <strong>{m.name}</strong>?</span>
                  <button type="button" disabled={pending} onClick={() => { setRemoving(null); run(() => removeClientMember(clientId, m.id)); }} className="shrink-0 rounded-md bg-destructive px-2 py-1 text-[11px] font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50">Quitar</button>
                  <button type="button" disabled={pending} onClick={() => setRemoving(null)} className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-50">Cancelar</button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {canManage && addable.length > 0 ? (
        <div className="relative mt-3 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <UserPlus className="size-4 shrink-0 text-muted-foreground" />
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                disabled={pending}
                onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
                placeholder="Dar acceso a… (busca por nombre)"
                className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          {searchOpen ? (
            <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
              {results.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Sin resultados para «{query}».</p>
              ) : (
                results.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(u.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  >
                    <UserAvatar initials={u.initials} color={u.color} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
