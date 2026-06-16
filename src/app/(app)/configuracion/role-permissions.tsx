"use client";

import * as React from "react";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { setRolePermission } from "./actions";

type Perm = { key: string; label: string; category: string };

export function RolePermissions({
  roleId,
  roleKey,
  permissions,
  categories,
  assigned,
}: {
  roleId: string;
  roleKey: string;
  permissions: Perm[];
  categories: string[];
  assigned: string[];
}) {
  const [pending, start] = React.useTransition();
  const [set, setSet] = React.useState<Set<string>>(new Set(assigned));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setSet(new Set(assigned)), [assigned]);

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

  if (isAdmin) {
    return <p className="text-xs text-muted-foreground">El rol Administrador tiene acceso total a todo el sistema.</p>;
  }

  return (
    <div className="space-y-2.5">
      {categories.map((cat) => {
        const perms = permissions.filter((p) => p.category === cat);
        if (!perms.length) return null;
        const onCount = perms.filter((p) => set.has(p.key)).length;
        return (
          <div key={cat}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {cat} <span className="font-normal">· {onCount}/{perms.length}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {perms.map((p) => {
                const on = set.has(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    disabled={pending}
                    onClick={() => toggle(p.key)}
                    title={p.key}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors",
                      on
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {on ? <Check className="size-3" /> : <Plus className="size-3" />}
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
