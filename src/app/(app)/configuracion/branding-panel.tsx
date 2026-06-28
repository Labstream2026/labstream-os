"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { saveOrgBranding } from "./branding-actions";

const DEFAULT_HEX = "#2563eb"; // azul por defecto de la app (globals.css)
const PRESETS = ["#2563eb", "#f47a20", "#7c3aed", "#059669", "#dc2626", "#0891b2", "#db2777", "#475569"];

// Panel de MARCA (Configuración → Marca, admin): elige el color de la organización. Se aplica a
// toda la app (botones, enlaces, acentos, aro de foco) en claro y oscuro.
export function BrandingPanel({ primaryColor }: { primaryColor: string | null }) {
  const router = useRouter();
  const [color, setColor] = React.useState(primaryColor ?? DEFAULT_HEX);
  const [, startTransition] = React.useTransition();
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const save = (value: string | null) => {
    setError(null);
    startTransition(async () => {
      const res = await saveOrgBranding(value);
      if (!res.ok) {
        setError(res.error ?? "No se pudo guardar.");
        return;
      }
      router.refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Color de marca</h3>
        {saved ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"><Check className="size-3.5" /> Guardado</span> : null}
      </div>
      <p className="text-sm text-muted-foreground">Tiñe botones, enlaces y acentos en toda la app, en modo claro y oscuro.</p>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => { setColor(p); save(p); }}
            className="size-8 rounded-full border-2 transition-transform hover:scale-110"
            style={{ backgroundColor: p, borderColor: color.toLowerCase() === p ? "hsl(var(--foreground))" : "transparent" }}
            aria-label={`Usar ${p}`}
            title={p}
          />
        ))}
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
          Personalizado
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            onBlur={() => save(color)}
            className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => { setColor(DEFAULT_HEX); save(null); }}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          Restablecer al color por defecto
        </button>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          Vista previa:
          <span className="rounded-md px-2 py-0.5 font-medium text-white" style={{ backgroundColor: color }}>Botón</span>
        </span>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
