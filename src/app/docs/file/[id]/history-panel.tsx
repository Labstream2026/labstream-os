"use client";

import * as React from "react";
import { History, Loader2, RotateCcw, Download, X } from "lucide-react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { listFileVersions, restoreVersion, type VersionRow } from "./history-actions";

// Historial del documento: cada guardado deja aquí la versión anterior. Se abre a demanda
// (no se carga con la página) y vive ENCIMA del editor, sin tocar su nodo — OnlyOffice
// reemplaza el suyo por un iframe y no admite que React le meta hermanos por delante.
export function HistoryPanel({ fileId }: { fileId: string }) {
  const [abierto, setAbierto] = React.useState(false);
  const [rows, setRows] = React.useState<VersionRow[] | null>(null);
  const [puedeRestaurar, setPuedeRestaurar] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const { confirm, dialog } = useConfirmDialog();

  async function abrir() {
    setAbierto(true);
    setError(null);
    if (rows) return;
    // Si la acción revienta (servidor caído, error inesperado), el panel lo DICE en vez de
    // quedarse en «Cargando…» para siempre.
    try {
      const r = await listFileVersions(fileId);
      if (r.ok) { setRows(r.rows ?? []); setPuedeRestaurar(Boolean(r.canRestore)); }
      else { setRows([]); setError(r.error ?? "No se pudo cargar el historial."); }
    } catch {
      setRows([]);
      setError("No se pudo cargar el historial. Inténtalo de nuevo.");
    }
  }

  async function volverA(v: VersionRow) {
    const sigue = await confirm({
      message: `¿Volver a la versión ${v.version} (${v.when})? Lo que hay ahora se guarda como una versión más, así que se puede deshacer.`,
    });
    if (!sigue) return;
    setOcupado(true);
    setError(null);
    const r = await restoreVersion(fileId, v.id);
    setOcupado(false);
    if (!r.ok) { setError(r.error ?? "No se pudo restaurar."); return; }
    // El editor abierto sigue con la versión vieja en memoria: se recarga para traer la buena.
    window.location.reload();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void abrir()}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
        title="Versiones anteriores de este documento"
      >
        <History className="size-3.5" /> Historial
      </button>

      {abierto ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setAbierto(false)}>
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-sm flex-col border-l border-border bg-background shadow-xl"
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <History className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Versiones anteriores</h2>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="ml-auto rounded-md p-1 hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
              {rows === null && !error ? (
                <p className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Cargando…</p>
              ) : rows && rows.length === 0 ? (
                <p className="px-1 py-6 text-sm text-muted-foreground">
                  Todavía no hay versiones anteriores. Se guarda una cada vez que alguien edita y el documento se escribe.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {rows?.map((v) => (
                    <li key={v.id} className="rounded-lg border border-border p-2.5">
                      <p className="text-sm font-medium">Versión {v.version}</p>
                      <p className="text-xs text-muted-foreground">
                        {v.when}
                        {v.savedByName ? ` · ${v.savedByName}` : ""}
                        {v.size ? ` · ${Math.max(1, Math.round(v.size / 1024))} KB` : ""}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <a
                          href={`/api/docs/version/${v.id}`}
                          className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium hover:bg-accent"
                        >
                          <Download className="size-3" /> Descargar
                        </a>
                        {puedeRestaurar ? (
                          <button
                            type="button"
                            onClick={() => void volverA(v)}
                            disabled={ocupado}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
                          >
                            {ocupado ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Volver a esta
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      ) : null}
      {dialog}
    </>
  );
}
