"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Star, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { submitProjectSurvey } from "./survey-actions";

// Tarjeta de encuesta al TERMINAR: 5 estrellas + comentario opcional. Una pregunta, sin fricción.
export function SurveyCard({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [score, setScore] = React.useState(0);
  const [hover, setHover] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const submit = () => {
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("score", String(score));
      fd.set("comment", comment);
      const r = await submitProjectSurvey(projectId, fd);
      if (!r.ok) {
        setError(r.error ?? "No se pudo guardar.");
        return;
      }
      setDone(true);
      router.refresh();
    });
  };

  if (done) {
    return (
      <div id="encuesta" className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
        ¡Gracias por contarnos! Tu opinión nos ayuda a hacerlo mejor la próxima vez. 💚
      </div>
    );
  }

  return (
    <div id="encuesta" className="mb-6 rounded-xl border border-border bg-card px-4 py-4 shadow-sm">
      <p className="text-sm font-semibold">¿Cómo estuvo el proceso? ⭐</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Tu calificación le llega directo al equipo. Solo toma 10 segundos.</p>
      <div className="mt-2.5 flex items-center gap-1" role="radiogroup" aria-label="Calificación de 1 a 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            aria-label={`${n} de 5`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setScore(n)}
            className="rounded p-0.5"
          >
            <Star
              className={cn(
                "size-7 transition-colors",
                (hover || score) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
              )}
            />
          </button>
        ))}
      </div>
      {score > 0 ? (
        <div className="mt-2.5 space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={score >= 4 ? "¿Qué fue lo mejor? (opcional)" : "¿Qué podemos mejorar? (opcional)"}
            className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center justify-end gap-2">
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null} Enviar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
