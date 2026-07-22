"use client";

import * as React from "react";
import { Download, ExternalLink, Play, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type FinalItem = {
  id: string;
  name: string;
  typeLabel: string;
  projectId: string;
  projectName: string;
  cover: string | null;
  versionNumber: number | null;
  approvedLabel: string;
  download: { href: string; external: boolean } | null;
  renditions: { id: string; label: string; url: string }[];
};

// Grilla de entregas finales con filtros por tipo y proyecto + «Descargar todo» (dispara las
// descargas locales una a una; los enlaces externos se abren aparte para no ser bloqueados).
export function FinalsGallery({ items }: { items: FinalItem[] }) {
  const [type, setType] = React.useState<string>("Todos");
  const [projectId, setProjectId] = React.useState<string>("todos");
  const [downloading, setDownloading] = React.useState(false);

  const typeLabels = ["Todos", ...Array.from(new Set(items.map((i) => i.typeLabel)))];
  const projects = Array.from(new Map(items.map((i) => [i.projectId, i.projectName])).entries());

  const visible = items.filter(
    (i) => (type === "Todos" || i.typeLabel === type) && (projectId === "todos" || i.projectId === projectId),
  );
  const downloadable = visible.filter((i) => i.download && !i.download.external);

  const downloadAll = async () => {
    if (downloading || downloadable.length === 0) return;
    setDownloading(true);
    for (const item of downloadable) {
      const a = document.createElement("a");
      a.href = item.download!.href;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Espaciadas para que el navegador no las bloquee como ráfaga.
      await new Promise((r) => setTimeout(r, 700));
    }
    setDownloading(false);
  };

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
        Aún no hay entregas aprobadas. Cuando apruebes tus piezas, aquí quedará tu biblioteca para descargarlas cuando quieras.
      </div>
    );
  }

  return (
    <div>
      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {typeLabels.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                type === t
                  ? "border-transparent bg-primary/10 text-primary ring-1 ring-primary/40"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {projects.length > 1 ? (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
              aria-label="Filtrar por proyecto"
            >
              <option value="todos">Todos los proyectos</option>
              {projects.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          ) : null}
          {downloadable.length > 1 ? (
            <button
              type="button"
              onClick={downloadAll}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60"
            >
              <Download className="size-3.5" /> {downloading ? "Descargando…" : `Descargar todo (${downloadable.length})`}
            </button>
          ) : null}
        </div>
      </div>

      {/* Grilla */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((i) => (
          <article key={i.id} className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/40">
            <div className="relative aspect-video w-full overflow-hidden bg-muted">
              <div className="absolute inset-0 flex items-center justify-center">
                <Play className="size-6 text-muted-foreground" />
              </div>
              {i.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.cover} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
              ) : null}
              {i.versionNumber ? (
                <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">v{i.versionNumber} final</span>
              ) : null}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-3">
              <p className="truncate text-sm font-semibold" title={i.name}>{i.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {i.typeLabel} · {i.projectName}
              </p>
              <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">✓ {i.approvedLabel}</p>
              <div className="mt-auto flex items-center gap-1.5 pt-1.5">
                {i.download ? (
                  <a
                    href={i.download.href}
                    {...(i.download.external ? { target: "_blank", rel: "noreferrer" } : { download: "" })}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    {i.download.external ? <ExternalLink className="size-3.5" /> : <Download className="size-3.5" />}
                    {i.download.external ? "Abrir" : "Descargar"}
                  </a>
                ) : (
                  <span className="flex-1 text-center text-[11px] text-muted-foreground">Pídele el archivo al equipo</span>
                )}
                {i.renditions.length > 0 ? (
                  <details className="relative">
                    <summary
                      className="flex cursor-pointer list-none items-center gap-0.5 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent"
                      title="Otros formatos"
                    >
                      Formatos <ChevronDown className="size-3" />
                    </summary>
                    <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-popover p-1 shadow-lg">
                      {i.renditions.map((r) => (
                        <a
                          key={r.id}
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate rounded-md px-2 py-1.5 text-xs hover:bg-accent"
                        >
                          {r.label}
                        </a>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">Nada con ese filtro. Prueba con otro tipo o proyecto.</p>
      ) : null}
    </div>
  );
}
