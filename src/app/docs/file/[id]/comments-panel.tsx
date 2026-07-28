"use client";

import * as React from "react";
import { MessageSquare, Loader2, X, ListPlus, Check, ExternalLink } from "lucide-react";
import { listDocComments, taskFromDocComment, type CommentRow } from "./comments-actions";

// Los comentarios del documento, fuera del editor: quién dijo qué, cuáles siguen abiertos y el
// botón que el editor no tiene — convertir un comentario en tarea del proyecto.
// Se abre a demanda y vive ENCIMA del editor, sin tocar su nodo (OnlyOffice lo reemplaza por
// un iframe y no admite que React le meta hermanos por delante).
export function CommentsPanel({ fileId, projectId, count }: { fileId: string; projectId: string; count: number }) {
  const [abierto, setAbierto] = React.useState(false);
  const [rows, setRows] = React.useState<CommentRow[] | null>(null);
  const [puedeTarea, setPuedeTarea] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ocupado, setOcupado] = React.useState<string | null>(null);

  async function abrir() {
    setAbierto(true);
    setError(null);
    if (rows) return;
    try {
      const r = await listDocComments(fileId);
      if (r.ok) { setRows(r.rows ?? []); setPuedeTarea(Boolean(r.canTask)); }
      else { setRows([]); setError(r.error ?? "No se pudieron cargar los comentarios."); }
    } catch {
      setRows([]);
      setError("No se pudieron cargar los comentarios. Inténtalo de nuevo.");
    }
  }

  async function crearTarea(c: CommentRow) {
    setOcupado(c.id);
    setError(null);
    const r = await taskFromDocComment(c.id);
    setOcupado(null);
    if (!r.ok) { setError(r.error ?? "No se pudo crear la tarea."); return; }
    setRows((prev) => prev?.map((x) => (x.id === c.id ? { ...x, taskId: r.taskId ?? null } : x)) ?? prev);
  }

  const abiertos = rows?.filter((c) => !c.resolved).length ?? count;

  return (
    <>
      <button
        type="button"
        onClick={() => void abrir()}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
        title="Comentarios dejados dentro del documento"
      >
        <MessageSquare className="size-3.5" /> Comentarios
        {count > 0 ? (
          <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">{count}</span>
        ) : null}
      </button>

      {abierto ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setAbierto(false)}>
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-sm flex-col border-l border-border bg-background shadow-xl"
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <MessageSquare className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Comentarios{abiertos ? ` · ${abiertos} sin resolver` : ""}</h2>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="ml-auto rounded-md p-1 hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {error ? <p className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}
              {rows === null && !error ? (
                <p className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Cargando…</p>
              ) : rows && rows.length === 0 ? (
                <p className="px-1 py-6 text-sm text-muted-foreground">
                  Todavía nadie ha comentado. Los comentarios se dejan dentro del documento (menú «Insertar → Comentario»)
                  y aparecen aquí en cuanto se guarda.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {rows?.map((c) => (
                    <li key={c.id} className={`rounded-lg border p-2.5 ${c.resolved ? "border-border/60 bg-muted/30" : "border-border"}`}>
                      <p className="flex items-center gap-1.5 text-xs font-medium">
                        {c.author}
                        {c.resolved ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <Check className="size-2.5" /> resuelto
                          </span>
                        ) : null}
                        {c.when ? <span className="ml-auto font-normal text-muted-foreground">{c.when}</span> : null}
                      </p>
                      <p className={`mt-1 whitespace-pre-wrap text-sm ${c.resolved ? "text-muted-foreground" : ""}`}>{c.text}</p>
                      {c.taskId ? (
                        <a
                          href={`/proyectos/${projectId}?tab=tareas&tarea=${c.taskId}`}
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                        >
                          <ExternalLink className="size-3" /> Ver la tarea
                        </a>
                      ) : puedeTarea && !c.resolved ? (
                        <button
                          type="button"
                          onClick={() => void crearTarea(c)}
                          disabled={ocupado === c.id}
                          className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium hover:bg-accent disabled:opacity-60"
                        >
                          {ocupado === c.id ? <Loader2 className="size-3 animate-spin" /> : <ListPlus className="size-3" />} Convertir en tarea
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
              Para responder o marcar uno como resuelto, hazlo dentro del documento: aquí se refleja al guardar.
            </p>
          </aside>
        </div>
      ) : null}
    </>
  );
}
