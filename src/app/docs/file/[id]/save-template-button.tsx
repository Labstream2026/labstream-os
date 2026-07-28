"use client";

import * as React from "react";
import { LayoutTemplate, Loader2, Check, X } from "lucide-react";
import { saveDocAsTemplate } from "@/app/(app)/proyectos/[id]/doc-actions";

// «Guardar como plantilla»: lo que acaba de quedar bien sirve para el próximo proyecto.
// Copia el archivo a las plantillas de la empresa; el documento original se queda donde está.
export function SaveTemplateButton({ fileId, docName }: { fileId: string; docName: string }) {
  const [abierto, setAbierto] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [hecho, setHecho] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await saveDocAsTemplate(fileId, String(fd.get("name") ?? ""), String(fd.get("description") ?? "") || null);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "No se pudo guardar."); return; }
    setHecho(true);
    setAbierto(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setAbierto(true); setHecho(false); }}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
        title="Guardar este documento como plantilla de la empresa"
      >
        {hecho ? <Check className="size-3.5 text-emerald-500" /> : <LayoutTemplate className="size-3.5" />}
        {hecho ? "Guardada" : "Plantilla"}
      </button>

      {abierto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAbierto(false)}>
          <form
            onSubmit={guardar}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-xl border border-border bg-background p-4 shadow-xl"
          >
            <div className="flex items-center gap-2">
              <LayoutTemplate className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Guardar como plantilla</h2>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="ml-auto rounded-md p-1 hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Se copia tal como está ahora. Cualquiera del equipo podrá arrancar un documento nuevo desde aquí, y lo que
              escriba no tocará esta plantilla.
            </p>
            <input
              name="name"
              defaultValue={docName.replace(/\.[^.]+$/, "")}
              required
              placeholder="Nombre de la plantilla"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              name="description"
              placeholder="¿Para qué sirve? (opcional)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAbierto(false)} className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
                Cancelar
              </button>
              <button disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null} Guardar plantilla
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
