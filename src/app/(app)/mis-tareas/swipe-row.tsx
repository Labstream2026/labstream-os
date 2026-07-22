"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { completeMyTask } from "./actions";
import { postponeTask } from "@/app/(app)/proyectos/[id]/actions";

// Gestos táctiles de una fila de Mis tareas (Tareas 2.0, Fase 1) — el mismo patrón de los
// recordatorios: SOLO puntero táctil, umbral de 72px, transform en vivo.
//   deslizar → (derecha) = COMPLETAR (el server aplica el candado de dependencias)
//   deslizar ← (izquierda) = POSPONER (barra de 3 opciones: esta tarde / mañana / lunes)
// En escritorio no interfiere: los botones de siempre siguen ahí.
const SWIPE_TRIGGER = 72;

export function SwipeTaskRow({ taskId, children }: { taskId: string; children: React.ReactNode }) {
  const router = useRouter();
  const [dx, setDx] = React.useState(0);
  const [ask, setAsk] = React.useState(false); // barra de posponer visible
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const dragRef = React.useRef<{ x: number; id: number } | null>(null);

  const complete = () => {
    setError(null);
    startTransition(async () => {
      const r = await completeMyTask(taskId);
      if (r.ok) router.refresh();
      else setError(r.error ?? "No se pudo completar.");
    });
  };
  const postpone = (when: "tarde" | "manana" | "lunes") => {
    setAsk(false);
    setError(null);
    startTransition(async () => {
      const r = await postponeTask(taskId, when);
      if (r.ok) router.refresh();
      else setError(r.error ?? "No se pudo posponer.");
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "touch" || pending) return;
    if ((e.target as HTMLElement).closest("button, a, input, select, details")) return;
    dragRef.current = { x: e.clientX, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || e.pointerId !== dragRef.current.id) return;
    setDx(Math.max(-120, Math.min(120, e.clientX - dragRef.current.x)));
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    if (!dragRef.current || e.pointerId !== dragRef.current.id) return;
    const delta = e.clientX - dragRef.current.x;
    dragRef.current = null;
    setDx(0);
    if (delta >= SWIPE_TRIGGER) complete();
    else if (delta <= -SWIPE_TRIGGER) setAsk(true);
  };

  return (
    <div className="relative">
      {/* Fondo del gesto: solo mientras se arrastra (el mismo arreglo del bug rosa de la campana). */}
      {dx !== 0 ? (
        <div className={cn("pointer-events-none absolute inset-0 flex items-center rounded-lg px-4", dx > 0 ? "justify-start bg-emerald-500/15 text-emerald-600" : "justify-end bg-amber-500/15 text-amber-600")}>
          {dx > 0 ? <Check className="size-4" /> : <Clock3 className="size-4" />}
        </div>
      ) : null}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: "pan-y" }}
        className={cn(dx !== 0 && "transition-none", pending && "opacity-60")}
      >
        {children}
      </div>
      {ask ? (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-popover px-3 py-2 text-xs animate-in fade-in slide-in-from-top-1">
          <span className="mr-1 font-medium text-muted-foreground">Posponer para:</span>
          <button onClick={() => postpone("tarde")} className="rounded-md border border-border px-2 py-1 font-medium hover:bg-accent">Esta tarde</button>
          <button onClick={() => postpone("manana")} className="rounded-md border border-border px-2 py-1 font-medium hover:bg-accent">Mañana</button>
          <button onClick={() => postpone("lunes")} className="rounded-md border border-border px-2 py-1 font-medium hover:bg-accent">El lunes</button>
          <button onClick={() => setAsk(false)} className="ml-auto rounded-md px-2 py-1 text-muted-foreground hover:bg-muted">Cancelar</button>
        </div>
      ) : null}
      {error ? <p className="mt-1 px-1 text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
