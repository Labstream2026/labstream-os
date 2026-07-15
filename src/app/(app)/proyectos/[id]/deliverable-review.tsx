"use client";

import * as React from "react";
import { Check, X, Eye, Link2Off, Link2, Loader2, CheckCircle2, Circle, Send, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimecode } from "@/lib/ui";
import { CopyLink } from "@/components/copy-link";
import { internalDecision, setReviewRevoked, resolveReviewComment, replyToReview } from "./actions";
import { usePromptDialog } from "@/components/ui/prompt-dialog";

// Controles de pre-aprobación interna de una versión (solo equipo gestor).
export function PreApproval({ deliverableId, projectId, versionNumber }: { deliverableId: string; projectId: string; versionNumber: number }) {
  const [pending, start] = React.useTransition();
  const { prompt, dialog } = usePromptDialog();
  async function decide(result: "APROBADO" | "CAMBIOS") {
    let note: string | undefined = undefined;
    if (result === "CAMBIOS") {
      const r = await prompt({ title: "Pedir cambios", message: "¿Qué cambios pides al equipo? (opcional)" });
      if (r === null) return; // canceló el diálogo
      note = r;
    }
    start(() => internalDecision(deliverableId, projectId, versionNumber, result, note));
  }
  return (
    <div className="flex items-center gap-1.5">
      {dialog}
      <button onClick={() => decide("APROBADO")} disabled={pending} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Aprobar interna
      </button>
      <button onClick={() => decide("CAMBIOS")} disabled={pending} className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-500/10 dark:text-amber-300">
        <X className="size-3.5" /> Pedir cambios
      </button>
    </div>
  );
}

// Barra del enlace de revisión del cliente: copiar/abrir, visitas, revocar, modo dibujos.
export function ReviewLinkBar({
  deliverableId,
  projectId,
  url,
  visits,
  revoked,
  hasApproved,
  children,
}: {
  deliverableId: string;
  projectId: string;
  url: string;
  visits: number;
  revoked: boolean;
  allowDrawings?: boolean; // (obsoleto) el "modo dibujos" se quitó del enlace; el prop se acepta sin usar
  hasApproved: boolean;
  children?: React.ReactNode;
}) {
  const [pending, start] = React.useTransition();
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Revisión del cliente:</span>
        {!revoked ? (
          <>
            <CopyLink url={url} />
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Abrir portal</a>
          </>
        ) : (
          <span className="rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">Enlace revocado</span>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Eye className="size-3.5" /> {visits} visita{visits === 1 ? "" : "s"}</span>
        {/* Enviar al cliente (por correo) */}
        {children}
        {/* Revocar / reactivar — junto a "Enviar al cliente". Revocar va en ROJO porque es
            destructivo (inutiliza el enlace); reactivar, en neutro. */}
        <button
          onClick={() => start(() => setReviewRevoked(deliverableId, projectId, !revoked))}
          disabled={pending}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50",
            revoked
              ? "border-border hover:bg-accent"
              : "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20",
          )}
        >
          {revoked ? <><Link2 className="size-3.5" /> Reactivar enlace</> : <><Link2Off className="size-3.5" /> Revocar enlace</>}
        </button>
      </div>
      {!hasApproved ? (
        <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          ⚠ Ninguna versión está aprobada internamente: el cliente verá «en revisión interna» hasta que el equipo apruebe una versión.
        </p>
      ) : null}
    </div>
  );
}

export type ReviewThreadComment = {
  id: string;
  authorName: string;
  body: string;
  timecode: number | null;
  versionNumber: number | null;
  image: string | null; // captura del fotograma con la anotación (si la hay)
  isNote: boolean;
  resolved: boolean;
  fromClient: boolean;
  // Qué es bloqueante (OBLIGATORIA) y qué es opcional (SUGERENCIA), para que el editor sepa por
  // dónde empezar. Opcional: las llamadas viejas siguen valiendo (se asume OBLIGATORIA).
  priority?: "OBLIGATORIA" | "SUGERENCIA";
  // Si viene, es una RESPUESTA del hilo de otra corrección: no es un ítem del checklist.
  parentId?: string | null;
  createdAt: Date | string;
};

// Filtros del checklist (solo estado del cliente: no tocan el servidor).
const REVIEW_FILTERS = [
  { key: "todas", label: "Todas" },
  { key: "pendientes", label: "Pendientes" },
  { key: "hechas", label: "Hechas" },
] as const;
type ReviewFilter = (typeof REVIEW_FILTERS)[number]["key"];

// Fila COMPACTA de una corrección: círculo para tildar, autor + chips, texto y la captura
// del fotograma como MINIATURA a la derecha (nunca a lo ancho: en la tarjeta el espacio es
// oro). El clic en la miniatura la amplía con el lightbox global (`data-lightbox`).
function CorrectionRow({ c, pending, onToggle }: { c: ReviewThreadComment; pending: boolean; onToggle: () => void }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm", c.resolved ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/5" : "border-border")}>
      <button
        onClick={onToggle}
        disabled={pending}
        title={c.resolved ? "Marcar como pendiente" : "Marcar como realizada"}
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-emerald-600 disabled:opacity-50"
      >
        {c.resolved ? <CheckCircle2 className="size-5 text-emerald-600" /> : <Circle className="size-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium">{c.authorName}</span>
          {!c.fromClient ? <span className="rounded bg-secondary px-1.5 text-[10px] text-secondary-foreground">equipo</span> : <span className="rounded bg-primary/10 px-1.5 text-[10px] text-primary">cliente</span>}
          {c.timecode != null ? <span className="rounded bg-primary/10 px-1.5 font-mono text-[10px] text-primary">{formatTimecode(c.timecode)}</span> : null}
          {/* Prioridad: lo que es imprescindible corregir se distingue de lo opcional. */}
          {(c.priority ?? "OBLIGATORIA") === "SUGERENCIA" ? (
            <span className="rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">Sugerencia</span>
          ) : (
            <span className="rounded bg-orange-100 px-1.5 text-[10px] font-medium text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">Obligatoria</span>
          )}
          {c.resolved ? <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Hecha</span> : null}
        </div>
        <p className={cn("whitespace-pre-wrap text-[13px]", c.resolved ? "text-muted-foreground line-through" : "text-foreground/90")}>{c.body}</p>
      </div>
      {c.image ? (
        <a href={c.image} data-lightbox rel="noreferrer" title="Ampliar captura" className="shrink-0 cursor-zoom-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.image} alt="Captura de la corrección" className="h-16 w-11 rounded border border-border object-cover" />
        </a>
      ) : null}
    </div>
  );
}

// Checklist de correcciones del entregable, en la VISTA DEL ENTREGABLE (lo trabaja el
// editor): cada cambio pedido (interno o del cliente) es una fila compacta con casilla
// para marcarlo como realizado (avisa al equipo). Las notas generales (sin casilla) se
// listan aparte. El checklist vive aquí, no en el workspace de pre-aprobación ni en el
// portal del cliente.
export function ReviewThread({ deliverableId, projectId, comments }: { deliverableId: string; projectId: string; comments: ReviewThreadComment[] }) {
  const [pending, start] = React.useTransition();
  const [body, setBody] = React.useState("");
  // Estado «realizado» optimista (resolveReviewComment no revalida la página).
  const [override, setOverride] = React.useState<Record<string, boolean>>({});
  const [filter, setFilter] = React.useState<ReviewFilter>("todas");
  // Acordeón por versión: null = aún sin tocar (abre solo la última); luego, conjunto explícito.
  const [openVersions, setOpenVersions] = React.useState<Set<number | "none"> | null>(null);
  if (comments.length === 0) {
    // Vacío amable: la pestaña Correcciones se ve siempre, aunque nadie haya pedido nada aún.
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
        Sin correcciones todavía. Cuando el cliente o el equipo pidan cambios, aparecerán aquí.
      </p>
    );
  }
  // Las RESPUESTAS de un hilo (parentId) no son correcciones: no se tildan ni cuentan en el
  // checklist. La conversación se lee en el workspace de revisión, donde va anidada bajo su madre.
  const roots = comments.filter((c) => c.parentId == null);
  const withRes = roots.map((c) => (c.id in override ? { ...c, resolved: override[c.id] } : c));
  const changes = withRes.filter((c) => !c.isNote);
  const notes = withRes.filter((c) => c.isNote);
  const done = changes.filter((c) => c.resolved).length;
  const toggle = (c: ReviewThreadComment) => {
    const next = !c.resolved;
    setOverride((p) => ({ ...p, [c.id]: next }));
    start(() => resolveReviewComment(c.id, projectId, next));
  };
  const matchesFilter = (c: ReviewThreadComment) =>
    filter === "todas" || (filter === "pendientes" ? !c.resolved : c.resolved);

  // Agrupa las correcciones por versión (más nueva arriba; las sin versión, al final). El
  // acordeón por grupo SOLO aparece con varias versiones: con una sola, la lista plana evita
  // el doble conteo («checklist 0/5» + «versión 0/5») que no aportaba nada.
  const groups = (() => {
    const map = new Map<number | "none", ReviewThreadComment[]>();
    for (const c of changes) {
      const k = c.versionNumber ?? "none";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return [...map.keys()]
      .sort((a, b) => (a === "none" ? 1 : b === "none" ? -1 : (b as number) - (a as number)))
      .map((k) => ({ key: k, items: map.get(k)! }));
  })();
  const multiVersion = groups.length > 1;
  const latestKey = groups[0]?.key;
  // Por defecto, solo la versión más nueva queda abierta; el resto, plegado.
  const openSet = openVersions ?? new Set(latestKey != null ? [latestKey] : []);
  const toggleVersion = (k: number | "none") => {
    const base = openVersions ?? new Set(latestKey != null ? [latestKey] : []);
    const next = new Set(base);
    if (next.has(k)) next.delete(k); else next.add(k);
    setOpenVersions(next);
  };
  const visibleCount = changes.filter(matchesFilter).length;

  return (
    <div>
      {changes.length > 0 ? (
        <>
          {/* Filtros + contador VIVO: incluye el estado optimista, a diferencia del resumen
              del <summary> de la tarjeta, que es una instantánea del servidor. */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {REVIEW_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                  filter === f.key ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-muted-foreground">{done}/{changes.length} hechas</span>
          </div>

          {visibleCount === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              {filter === "hechas" ? "Aún no hay correcciones hechas." : "No queda nada pendiente."}
            </p>
          ) : multiVersion ? (
            <div className="space-y-2">
              {groups.map(({ key, items }) => {
                // El filtro se aplica dentro de cada grupo; el conteo del encabezado sigue
                // siendo el total del grupo (es el dato útil para saber cuánto falta).
                const visible = items.filter(matchesFilter);
                if (visible.length === 0) return null;
                const gDone = items.filter((c) => c.resolved).length;
                const open = openSet.has(key);
                return (
                  <div key={String(key)} className="overflow-hidden rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => toggleVersion(key)}
                      className="flex w-full items-center gap-2 bg-muted/40 px-2.5 py-1.5 text-left text-xs font-semibold hover:bg-muted/70"
                    >
                      {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
                      <span>{key === "none" ? "Sin versión" : `Versión ${key}`}</span>
                      <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium", gDone === items.length ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-background text-muted-foreground")}>
                        {gDone}/{items.length} hechas
                      </span>
                    </button>
                    {open ? (
                      <div className="space-y-1.5 p-2">
                        {visible.map((c) => (
                          <CorrectionRow key={c.id} c={c} pending={pending} onToggle={() => toggle(c)} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            // Un solo grupo de versión: lista plana, sin encabezado (el contador vivo de
            // arriba ya dice cuánto va).
            <div className="space-y-1.5">
              {changes.filter(matchesFilter).map((c) => (
                <CorrectionRow key={c.id} c={c} pending={pending} onToggle={() => toggle(c)} />
              ))}
            </div>
          )}
        </>
      ) : null}

      {notes.length > 0 ? (
        <div className={cn(changes.length > 0 && "mt-3")}>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Notas generales</p>
          <div className="space-y-1.5">
            {notes.map((c) => (
              <div key={c.id} className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">{c.authorName}</span>
                  {!c.fromClient ? <span className="rounded bg-secondary px-1.5 text-[10px] text-secondary-foreground">equipo</span> : <span className="rounded bg-primary/10 px-1.5 text-[10px] text-primary">cliente</span>}
                </div>
                <p className="whitespace-pre-wrap text-[13px] text-foreground/90">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <form
        onSubmit={(e) => { e.preventDefault(); if (!body.trim()) return; const fd = new FormData(); fd.set("body", body); start(async () => { await replyToReview(deliverableId, projectId, fd); setBody(""); }); }}
        className="mt-2 flex items-center gap-2"
      >
        <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Responder al cliente…" className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <button disabled={pending || !body.trim()} className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <Send className="size-3.5" /> Responder
        </button>
      </form>
    </div>
  );
}
