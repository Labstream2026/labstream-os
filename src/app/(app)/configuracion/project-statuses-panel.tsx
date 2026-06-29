"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_COLORS, STATUS_COLOR_KEYS } from "@/lib/project-status";
import { saveProjectStatuses, resetProjectStatuses } from "./project-status-actions";

type Row = { key: string; label: string; color: string };

// Panel (Configuración → Estados de proyecto, admin): personaliza la ETIQUETA y el COLOR de cada
// estado de proyecto. No añade/quita estados (eso sería migrar el enum); recolorea y renombra los
// existentes, y se refleja en toda la app (tarjetas, listas, reportes).
export function ProjectStatusesPanel({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = React.useState<Row[]>(initial);
  const [, startTransition] = React.useTransition();
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const setRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = () => {
    setError(null);
    startTransition(async () => {
      const res = await saveProjectStatuses(rows);
      if (!res.ok) { setError(res.error ?? "No se pudo guardar."); return; }
      router.refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const reset = () => {
    setError(null);
    startTransition(async () => {
      const res = await resetProjectStatuses();
      if (!res.ok) { setError(res.error ?? "No se pudo restablecer."); return; }
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Estados de proyecto</h3>
        {saved ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check className="size-3.5" /> Guardado</span> : null}
      </div>
      <p className="text-sm text-muted-foreground">Personaliza el nombre y el color de cada estado. Se aplica en tarjetas, listas y reportes de toda la app.</p>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.key} className="flex flex-wrap items-center gap-2.5 rounded-lg border border-border px-3 py-2">
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_COLORS[r.color] ?? STATUS_COLORS.slate)}>{r.label || r.key}</span>
            <input
              value={r.label}
              onChange={(e) => setRow(r.key, { label: e.target.value })}
              placeholder={r.key}
              maxLength={40}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex shrink-0 items-center gap-1">
              {STATUS_COLOR_KEYS.map((ck) => (
                <button
                  key={ck}
                  type="button"
                  onClick={() => setRow(r.key, { color: ck })}
                  title={ck}
                  aria-label={`Color ${ck}`}
                  className={cn("size-5 rounded-full border transition hover:scale-110", r.color === ck ? "ring-2 ring-foreground/40 ring-offset-1 ring-offset-background" : "border-black/10")}
                  style={{ background: dotColor(ck) }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} className="rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Guardar cambios</button>
        <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"><RotateCcw className="size-3.5" /> Restablecer por defecto</button>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

// Color sólido aproximado para el punto del selector (la insignia usa las clases de Tailwind).
const DOT: Record<string, string> = {
  slate: "#64748b", blue: "#2563eb", indigo: "#4f46e5", violet: "#7c3aed", amber: "#d97706",
  orange: "#ea580c", emerald: "#059669", teal: "#0d9488", rose: "#e11d48",
};
function dotColor(key: string): string { return DOT[key] ?? "#64748b"; }
