"use client";

import * as React from "react";
import { RotateCcw, Check } from "lucide-react";
import { requestReopenProject } from "@/app/(app)/proyectos/[id]/actions";

// Botón del CLIENTE en un proyecto TERMINADO: pide al equipo retomarlo (no lo reabre él mismo).
export function ReopenRequestButton({ projectId }: { projectId: string }) {
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle");
  const onClick = async () => {
    if (state !== "idle") return;
    setState("sending");
    const r = await requestReopenProject(projectId);
    setState(r.ok ? "sent" : "idle");
  };
  if (state === "sent") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="size-4" /> Solicitud enviada al equipo
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "sending"}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
    >
      <RotateCcw className="size-4" /> {state === "sending" ? "Enviando…" : "Pedir retomar"}
    </button>
  );
}
