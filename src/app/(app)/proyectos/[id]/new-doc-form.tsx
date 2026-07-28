"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, FileSpreadsheet, Presentation, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createOfficeDoc, listDocTemplates, type DocTemplateOption } from "./doc-actions";
import type { NewDocKind } from "@/lib/office-blank";

// Formulario de «Nuevo documento»: tipo, nombre, carpeta y (si las hay) plantilla de la
// empresa. Al crear se abre el editor directamente — un documento que hay que ir a buscar
// después no es «crear fácil».
const TIPOS: { kind: NewDocKind; label: string; icon: typeof FileText }[] = [
  { kind: "word", label: "Word", icon: FileText },
  { kind: "cell", label: "Excel", icon: FileSpreadsheet },
  { kind: "slide", label: "Power Point", icon: Presentation },
];

export function NewDocForm({
  projectId,
  folders,
  onlyoffice,
}: {
  projectId: string;
  folders: { id: string; name: string }[];
  // Sin Document Server el archivo se crea igual, pero no se puede abrir: se avisa.
  onlyoffice: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = React.useState<NewDocKind>("word");
  const [name, setName] = React.useState("");
  const [folderId, setFolderId] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [templates, setTemplates] = React.useState<DocTemplateOption[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Las plantillas se piden al abrir el formulario, no con la página.
  React.useEffect(() => {
    let vivo = true;
    listDocTemplates()
      .then((t) => { if (vivo) setTemplates(t); })
      .catch(() => { if (vivo) setTemplates([]); });
    return () => { vivo = false; };
  }, []);

  const plantilla = templates?.find((t) => t.id === templateId) ?? null;

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await createOfficeDoc({
        projectId,
        name,
        kind,
        folderId: folderId || null,
        templateId: templateId || null,
      });
      if (!r.ok || !r.id) { setError(r.error ?? "No se pudo crear el documento."); return; }
      if (onlyoffice) router.push(`/docs/file/${r.id}`);
      else { setName(""); router.refresh(); }
    } catch {
      setError("No se pudo crear el documento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={crear} className="space-y-2.5 rounded-lg border border-border bg-muted/30 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {TIPOS.map((t) => {
          const Icon = t.icon;
          // Con plantilla el tipo lo manda ella (una plantilla de Excel no hace un Word).
          const activo = (plantilla ? plantilla.kind : kind) === t.kind;
          return (
            <button
              key={t.kind}
              type="button"
              onClick={() => { setKind(t.kind); if (plantilla && plantilla.kind !== t.kind) setTemplateId(""); }}
              aria-pressed={activo}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors",
                activo ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del documento"
          autoFocus
          className="min-w-44 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {folders.length ? (
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Sin carpeta</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        ) : null}
        {templates?.length ? (
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            title="Empezar a partir de una plantilla de la empresa"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">En blanco</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} Crear y abrir
        </button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {!onlyoffice ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          El editor no está conectado: el documento se creará, pero habrá que descargarlo para escribirlo.
        </p>
      ) : null}
    </form>
  );
}
