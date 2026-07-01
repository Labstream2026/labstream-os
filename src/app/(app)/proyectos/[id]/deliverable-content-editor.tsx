"use client";

import * as React from "react";
import { FileText, Hash, Loader2, Check, ChevronRight } from "lucide-react";
import { getDeliverableContent, setDeliverableContent } from "./deliverable-content-actions";

// Editor del CONTENIDO de publicación de un entregable (caption/copy + hashtags) para el equipo.
// Vive dentro del panel de entregables (server component): carga los valores al desplegar (una
// sola vez) y guarda con la server action. El cliente solo lo LEE en su sala.
export function DeliverableContentEditor({ deliverableId }: { deliverableId: string }) {
  const [open, setOpen] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [copy, setCopy] = React.useState("");
  const [hashtags, setHashtags] = React.useState("");
  const [pending, start] = React.useTransition();
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasContent = copy.trim() !== "" || hashtags.trim() !== "";

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      try {
        const c = await getDeliverableContent(deliverableId);
        setCopy(c.copy);
        setHashtags(c.hashtags);
        setLoaded(true);
      } catch {
        setError("No se pudo cargar el contenido.");
      }
    }
  }

  function save() {
    setError(null);
    start(async () => {
      try {
        await setDeliverableContent(deliverableId, copy, hashtags);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-border">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold hover:bg-muted/40"
      >
        <ChevronRight className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <FileText className="size-3.5 shrink-0" />
        <span>Copy y hashtags</span>
        {hasContent ? <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">listo</span> : <span className="text-[11px] font-normal text-muted-foreground">· lo que el cliente publicará</span>}
      </button>

      {open ? (
        <div className="space-y-2.5 px-3 pb-3">
          {!loaded ? (
            <p className="flex items-center gap-2 py-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Cargando…</p>
          ) : (
            <>
              <label className="block text-[11px] font-medium text-muted-foreground">
                Texto / caption
                <textarea
                  value={copy}
                  onChange={(e) => setCopy(e.target.value)}
                  rows={4}
                  placeholder="El texto listo para pegar en Instagram / TikTok…"
                  className="mt-1 w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="block text-[11px] font-medium text-muted-foreground">
                <span className="flex items-center gap-1"><Hash className="size-3" /> Hashtags</span>
                <textarea
                  value={hashtags}
                  onChange={(e) => setHashtags(e.target.value)}
                  rows={2}
                  placeholder="#pielsana #antesydespues #esteticafacial"
                  className="mt-1 w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={save}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {pending ? <Loader2 className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5" /> : null}
                  {saved ? "Guardado" : "Guardar"}
                </button>
                {error ? <span className="text-xs text-destructive">{error}</span> : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
