"use client";

import * as React from "react";
import { Check, Plus } from "lucide-react";
import { setRolePermission } from "./actions";

export function RolePermissions({
  roleId,
  roleKey,
  permissions,
  assigned,
}: {
  roleId: string;
  roleKey: string;
  permissions: { key: string; description: string | null }[];
  assigned: string[];
}) {
  const [pending, start] = React.useTransition();
  const [set, setSet] = React.useState<Set<string>>(new Set(assigned));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setSet(new Set(assigned)), [assigned]);

  // El rol admin es todopoderoso por código: se muestran todos activos, sin editar.
  const isAdmin = roleKey === "admin";

  function toggle(key: string) {
    if (isAdmin || pending) return;
    const has = set.has(key);
    const next = new Set(set);
    if (has) next.delete(key);
    else next.add(key);
    setSet(next);
    setError(null);
    start(async () => {
      const r = await setRolePermission(roleId, key, !has);
      if (!r.ok) {
        setError(r.error ?? "No se pudo aplicar");
        setSet((s) => {
          const revert = new Set(s);
          if (has) revert.add(key);
          else revert.delete(key);
          return revert;
        });
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {permissions.map((p) => {
          const on = isAdmin || set.has(p.key);
          return (
            <button
              key={p.key}
              type="button"
              disabled={isAdmin || pending}
              onClick={() => toggle(p.key)}
              title={p.description ?? p.key}
              className={
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors " +
                (on
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground hover:bg-accent") +
                (isAdmin ? " cursor-default opacity-90" : " cursor-pointer")
              }
            >
              {on ? <Check className="size-3" /> : <Plus className="size-3" />}
              {p.key}
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
