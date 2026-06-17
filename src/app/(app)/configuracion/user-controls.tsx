"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { setUserRole, setUserActive, setUserGuest, setUserGender, deleteUser } from "./actions";

export function UserControls({
  userId,
  userName,
  roleKey,
  active,
  isGuest,
  gender,
  roles,
  isSelf,
}: {
  userId: string;
  userName: string;
  roleKey: string;
  active: boolean;
  isGuest: boolean;
  gender: string | null;
  roles: { key: string; name: string }[];
  isSelf: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "No se pudo aplicar el cambio.");
    });
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <select
          value={roleKey}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value;
            run(() => setUserRole(userId, v));
          }}
          className="cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs font-medium outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          {roles.map((r) => (
            <option key={r.key} value={r.key}>
              {r.name}
            </option>
          ))}
        </select>

        <select
          value={gender ?? ""}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value;
            run(() => setUserGender(userId, v || null));
          }}
          title="Cómo te saluda Marcebot (muchacho / muchacha)"
          className="cursor-pointer rounded-md border border-border bg-card px-2 py-1 text-xs font-medium outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          <option value="">🤖 Neutro</option>
          <option value="M">👦 Muchacho</option>
          <option value="F">👧 Muchacha</option>
        </select>

        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setUserGuest(userId, !isGuest))}
          title={isGuest ? "Invitado: sin acceso a la Wiki. Clic para dar acceso." : "Con acceso a la Wiki. Clic para marcar como invitado (sin Wiki)."}
          className={
            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 " +
            (isGuest
              ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
              : "border-border bg-card text-muted-foreground hover:bg-accent")
          }
        >
          {isGuest ? "Invitado" : "Equipo"}
        </button>

        <button
          type="button"
          disabled={pending || (isSelf && active)}
          onClick={() => run(() => setUserActive(userId, !active))}
          title={isSelf && active ? "No puedes desactivar tu propia cuenta" : undefined}
          className={
            "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 " +
            (active
              ? "border-border bg-card text-muted-foreground hover:bg-accent"
              : "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20")
          }
        >
          {active ? "Activo" : "Inactivo"}
        </button>

        {!isSelf ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => { if (confirm(`¿Eliminar a ${userName}? Se borra su cuenta y sus pertenencias; el contenido en propiedad queda sin autor. No se puede deshacer.`)) run(() => deleteUser(userId)); }}
            title="Eliminar usuario"
            className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
