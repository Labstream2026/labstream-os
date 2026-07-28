"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, FileSpreadsheet, Presentation, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createOfficeDoc, type DocTemplateOption } from "@/app/(app)/proyectos/[id]/doc-actions";
import type { NewDocKind } from "@/lib/office-blank";

const TIPOS: { kind: NewDocKind; label: string; hint: string; icon: typeof FileText }[] = [
  { kind: "word", label: "Word", hint: "Guiones, propuestas, actas", icon: FileText },
  { kind: "cell", label: "Excel", hint: "Presupuestos, listas, planillas", icon: FileSpreadsheet },
  { kind: "slide", label: "Power Point", hint: "Pitch, presentaciones", icon: Presentation },
];

export function NuevoDocForm({
  projects,
  templates,
  onlyoffice,
  defaultProjectId,
  defaultName,
}: {
  projects: { id: string; name: string; emoji: string | null; client: string | null }[];
  templates: DocTemplateOption[];
  onlyoffice: boolean;
  defaultProjectId: string;
  defaultName: string;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = React.useState(defaultProjectId);
  const [kind, setKind] = React.useState<NewDocKind>("word");
  const [name, setName] = React.useState(defaultName);
  const [templateId, setTemplateId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const plantilla = templates.find((t) => t.id === templateId) ?? null;
  const tipoEfectivo = plantilla ? plantilla.kind : kind;

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await createOfficeDoc({ projectId, name, kind, templateId: templateId || null });
      if (!r.ok || !r.id) { setError(r.error ?? "No se pudo crear el documento."); return; }
      router.push(onlyoffice ? `/docs/file/${r.id}` : `/proyectos/${projectId}?tab=archivos`);
    } catch {
      setError("No se pudo crear el documento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={crear} className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-3">
        {TIPOS.map((t) => {
          const Icon = t.icon;
          const activo = tipoEfectivo === t.kind;
          return (
            <button
              key={t.kind}
              type="button"
              onClick={() => { setKind(t.kind); if (plantilla && plantilla.kind !== t.kind) setTemplateId(""); }}
              aria-pressed={activo}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                activo ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40",
              )}
            >
              <Icon className={cn("size-5", activo ? "text-primary" : "text-muted-foreground")} />
              <span className="text-sm font-medium">{t.label}</span>
              <span className="text-xs text-muted-foreground">{t.hint}</span>
            </button>
          );
        })}
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Nombre</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Guion versión 1"
          autoFocus
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Proyecto</span>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.emoji ? `${p.emoji} ` : ""}{p.name}{p.client ? ` · ${p.client}` : ""}
            </option>
          ))}
        </select>
      </label>

      {templates.length ? (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Empezar desde</span>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Documento en blanco</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <span className="block text-xs text-muted-foreground">
            La plantilla se copia: lo que escribas aquí no la cambia.
          </span>
        </label>
      ) : null}

      {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {!onlyoffice ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
          El editor no está conectado: el documento se creará en Archivos, pero habrá que descargarlo para escribirlo.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null} Crear y abrir
      </button>
    </form>
  );
}
