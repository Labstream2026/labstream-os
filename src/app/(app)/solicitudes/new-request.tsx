"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { REQUEST_TYPES } from "@/lib/client-portal";
import { EntityEmoji } from "@/components/icons/marks";
import { createClientRequest } from "./actions";

type Proj = { id: string; name: string; emoji: string | null };

// Formulario de NUEVA solicitud: tipos con chip (no texto libre a la deriva), proyecto,
// título y detalle. Colapsado por defecto para que la lista respire.
export function NewRequest({ projects }: { projects: Proj[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<string>("CAMBIO");
  const [projectId, setProjectId] = React.useState(projects[0]?.id ?? "");
  const [title, setTitle] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  if (projects.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        Para enviar solicitudes necesitas al menos un proyecto activo.
      </p>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("type", type);
      fd.set("title", title);
      fd.set("details", details);
      const r = await createClientRequest(fd);
      if (!r.ok) {
        setError(r.error ?? "No se pudo enviar.");
        return;
      }
      setTitle("");
      setDetails("");
      setOpen(false);
      setSent(true);
      setTimeout(() => setSent(false), 4000);
      router.refresh();
    });
  };

  return (
    <div>
      {sent ? (
        <p className="mb-3 rounded-lg bg-emerald-100 px-3.5 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          ✓ Solicitud enviada. El equipo la recibió y te avisaremos cuando avance.
        </p>
      ) : null}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" /> Nueva solicitud
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Nueva solicitud</h3>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded-md p-1 text-muted-foreground hover:bg-muted">
              <X className="size-4" />
            </button>
          </div>

          {/* Tipo */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(REQUEST_TYPES).map(([key, t]) => (
              <button
                key={key}
                type="button"
                onClick={() => setType(key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  type === key
                    ? "border-transparent bg-primary/10 text-primary ring-1 ring-primary/40"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t.emoji} {t.label}
              </button>
            ))}
          </div>

          {/* Proyecto */}
          {projects.length > 1 ? (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Proyecto: <EntityEmoji value={projects[0].emoji} fallback="🎬" /> <span className="font-medium text-foreground">{projects[0].name}</span>
            </p>
          )}

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            placeholder={type === "CAMBIO" ? "¿Qué quieres cambiar? (p. ej. la música del reel)" : type === "MATERIAL" ? "¿Qué material necesitas?" : type === "REUNION" ? "¿Sobre qué quieres reunirte?" : "¿Cuál es tu pregunta?"}
            className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Detalle (opcional): mientras más contexto, más rápido resolvemos."
            className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pending || title.trim().length < 3}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar al equipo
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
