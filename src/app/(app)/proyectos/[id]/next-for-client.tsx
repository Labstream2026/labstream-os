"use client";

import * as React from "react";
import { Megaphone, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { setNextForClient } from "./next-for-client-actions";

// Tarjeta del EQUIPO (Resumen del proyecto): edita el «¿Qué sigue?» que ve el cliente en su
// portal. Vacío = el portal deriva un texto automático de la fase (aquí se muestra esa pista).
export function NextForClientCard({ projectId, note }: { projectId: string; note: string | null }) {
  const [value, setValue] = React.useState(note ?? "");
  const [pending, start] = React.useTransition();
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const dirty = value.trim() !== (note ?? "").trim();

  // El «Guardado ✓» se esfuma solo; los errores se quedan hasta el siguiente intento.
  React.useEffect(() => {
    if (!msg?.ok) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);

  const save = () => {
    setMsg(null);
    start(async () => {
      const fd = new FormData();
      fd.set("nextForClient", value);
      const r = await setNextForClient(projectId, fd);
      setMsg(r.ok ? { ok: true, text: "Guardado" } : { ok: false, text: r.error ?? "No se pudo guardar." });
    });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Megaphone className="size-4 text-muted-foreground" /> «¿Qué sigue?» para el cliente
        </h3>
        {pending ? (
          <Loader2 className="size-4 animate-spin opacity-60" />
        ) : msg ? (
          <span className={cn("inline-flex items-center gap-1 text-xs", msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
            {msg.ok ? <Check className="size-3.5" /> : null}
            {msg.text}
          </span>
        ) : null}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">
        Frase corta que el cliente ve en su portal (p. ej. «Estamos ajustando el color; la v3 llega el jueves»). Vacío = texto automático según la fase.
      </p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Cuéntale al cliente en una frase qué sigue…"
        className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
