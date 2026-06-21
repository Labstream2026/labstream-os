"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";
import { cleanupUserNames } from "./actions";

// Botón admin: limpia los nombres de usuario con sufijo de cargo ("Nombre - Cargo"), dejando solo
// el nombre y moviendo el cargo al campo «título». Se ejecuta una vez; es idempotente.
export function CleanupNamesButton() {
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<string | null>(null);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <button
        onClick={() => {
          setMsg(null);
          start(async () => {
            const r = await cleanupUserNames();
            setMsg(r.ok ? `✓ ${r.updated ?? 0} nombre(s) limpiados` : `⚠️ ${r.error}`);
          });
        }}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Limpiar nombres (quitar «- Cargo»)
      </button>
      {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
    </div>
  );
}
