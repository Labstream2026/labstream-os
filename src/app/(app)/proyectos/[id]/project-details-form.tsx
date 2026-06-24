"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateProjectDetails } from "./actions";

// Edición acotada del proyecto (nombre, descripción, fecha de entrega) en la pestaña Resumen.
// Solo se muestra a quien puede editar el proyecto. No toca estado/prioridad/responsable.
export function ProjectDetailsForm({
  projectId,
  name,
  description,
  dueDate,
}: {
  projectId: string;
  name: string;
  description: string | null;
  dueDate: string | null; // "YYYY-MM-DD" o ""
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [form, setForm] = React.useState({ name, description: description ?? "", dueDate: dueDate ?? "" });
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Valores originales para saber si hay cambios sin guardar.
  const original = React.useRef({ name, description: description ?? "", dueDate: dueDate ?? "" });
  React.useEffect(() => {
    original.current = { name, description: description ?? "", dueDate: dueDate ?? "" };
    setForm({ name, description: description ?? "", dueDate: dueDate ?? "" });
  }, [name, description, dueDate]);

  const dirty =
    form.name.trim() !== original.current.name ||
    form.description !== original.current.description ||
    form.dueDate !== original.current.dueDate;

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("El nombre no puede quedar vacío.");
      return;
    }
    if (!dirty || pending) return;
    // Solo se envían los campos que cambiaron: el nombre siempre (identidad/obligatorio);
    // descripción y fecha solo si el usuario los tocó, para no reescribirlos por accidente
    // (la fecha podría correrse un día por zona horaria si se reenvía sin cambios).
    const fd = new FormData();
    fd.set("name", form.name.trim());
    if (form.description !== original.current.description) fd.set("description", form.description);
    if (form.dueDate !== original.current.dueDate) fd.set("dueDate", form.dueDate);
    setError(null);
    start(async () => {
      const r = await updateProjectDetails(projectId, fd);
      if (r.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(r.error ?? "No se pudieron guardar los cambios.");
      }
    });
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/15";

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Pencil className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Detalles del proyecto</h3>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Nombre</span>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength={160}
            className={inputCls}
            placeholder="Nombre del proyecto"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Fecha de entrega</span>
          <input
            type="date"
            value={form.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
            className={inputCls}
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Descripción</span>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          rows={3}
          maxLength={1000}
          className={cn(inputCls, "resize-y")}
          placeholder="Breve descripción del proyecto…"
        />
      </label>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {error ? <span className="text-destructive">{error}</span> : saved && !dirty ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check className="size-3.5" /> Cambios guardados
            </span>
          ) : dirty ? (
            "Tienes cambios sin guardar."
          ) : (
            ""
          )}
        </p>
        <button
          type="submit"
          disabled={!dirty || pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
