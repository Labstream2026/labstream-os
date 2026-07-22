"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseTaskText, type ParsedTask } from "@/lib/task-parse";
import { quickAddTask } from "@/app/(app)/proyectos/[id]/actions";

// Quick-add de tareas en UN renglón (Tareas 2.0, Fase 1): «Grabar dron mañana 9am @Zahid
// #rodaje 2h» → Enter y listo. El parser corre también AQUÍ (es lib pura) para previsualizar
// los chips mientras escribes; el server re-parsea y resuelve @persona/!prioridad de verdad.
// Con projectId la tarea nace en ese proyecto; sin él es personal (Mis tareas).
export function QuickAdd({ projectId, placeholder }: { projectId?: string | null; placeholder?: string }) {
  const router = useRouter();
  const [text, setText] = React.useState("");
  const [parsed, setParsed] = React.useState<ParsedTask | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const onChange = (v: string) => {
    setText(v);
    setError(null);
    setParsed(v.trim() ? parseTaskText(v, Date.now()) : null);
  };

  const submit = () => {
    const t = text.trim();
    if (!t || pending) return;
    startTransition(async () => {
      const r = await quickAddTask(t, projectId ?? null);
      if (r.ok) {
        setText("");
        setParsed(null);
        router.refresh();
      } else {
        setError(r.error ?? "No se pudo crear la tarea.");
      }
    });
  };

  const CHIP_TONE: Record<string, string> = {
    fecha: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
    hora: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
    persona: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    etiqueta: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    prioridad: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
    estimacion: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300",
  };

  return (
    <div>
      <div className={cn("flex items-center gap-2 rounded-xl border border-dashed border-border bg-card px-3 py-2 transition-colors focus-within:border-primary/60", pending && "opacity-70")}>
        {pending ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" /> : <Plus className="size-4 shrink-0 text-muted-foreground" />}
        <input
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder={placeholder ?? "Nueva tarea… «Grabar dron mañana 9am @Zahid #rodaje 2h» y Enter"}
          aria-label="Nueva tarea en lenguaje natural"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
        />
        {text.trim() ? (
          <button onClick={submit} disabled={pending} className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60">
            Crear
          </button>
        ) : null}
      </div>
      {parsed && parsed.chips.length ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[11px] text-muted-foreground">Entendí:</span>
          {parsed.chips.map((c, i) => (
            <span key={i} className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", CHIP_TONE[c.kind] ?? "bg-muted text-muted-foreground")}>
              {c.label}
            </span>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-1.5 px-1 text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
