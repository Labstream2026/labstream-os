"use client";

import * as React from "react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePromptDialog } from "@/components/ui/prompt-dialog";

// ──────────────────────────────────────────────────────────────────────────
// Escenario de revisión compartido (estilo Frame.io). Lo usan DOS vistas:
//  · el responsable, en la bandeja interna /revisiones/[id]  (mode="internal")
//  · el cliente, en el portal público /review/[token]        (mode="client")
// Reproduce el material (video subido, Drive proxiado, YouTube, imagen…), deja
// comentarios anclados a un segundo del video CON CAPTURA AUTOMÁTICA del fotograma
// (y el texto quemado encima), permite dibujar sobre el frame, y tiene una sección
// de NOTAS (comentarios generales sin captura). Los botones de decisión cambian
// según el modo (Pre-aprobado/Solicitar cambios vs. Aprobado/Solicitar cambios).
// ──────────────────────────────────────────────────────────────────────────

export type StageVersion = {
  number: number;
  notes: string | null;
  kind: "video" | "image" | "youtube" | "vimeo" | "drive_file" | "drive_folder" | "other" | "none";
  src: string | null; // embed/src primario (iframe o <video>)
  proxySrc?: string | null; // video del MISMO origen (Drive proxiado) — permite capturar el frame
  openUrl: string | null;
  fileName: string | null;
  timecodeCapable: boolean;
};

export type StageComment = {
  id: string;
  authorName: string;
  body: string;
  timecode: number | null;
  versionNumber: number | null;
  drawing: { image?: string } | null;
  isNote: boolean;
  fromClient: boolean;
  resolved?: boolean;
  // Sellado: si está en true, el comentario ya se envió («Solicitar cambios») y no se
  // puede editar ni borrar. Los borradores (false/undefined) sí, en el modo interno.
  locked?: boolean;
  createdAt: string;
};

type PlayerApi = {
  getTime: () => number | null;
  seek: (t: number) => void;
  pause: () => void;
  // Captura el fotograma actual (+ caption opcional quemado) en un JPEG; null si la
  // fuente no es del mismo origen (YouTube/Vimeo/Drive sin proxy → CORS).
  capture: (caption?: string) => string | null;
};

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function ReviewStage({
  versions,
  comments,
  status,
  allowDrawings,
  mode,
  orientation = "horizontal",
  defaultName = "",
  fixedName = false,
  decision,
  canDecide = true,
  onComment,
  onDecision,
  onDecisionIntent,
  onResolve,
  onEdit,
  onDelete,
}: {
  versions: StageVersion[];
  comments: StageComment[];
  status: string;
  allowDrawings: boolean;
  mode: "internal" | "client";
  // Diagramación según el material: "vertical" (reel/short) → video a la izquierda y
  // comentarios a la derecha; "horizontal" → video arriba a todo el ancho, comentarios
  // debajo en dos columnas. Por defecto horizontal.
  orientation?: "vertical" | "horizontal";
  defaultName?: string; // nombre fijo del miembro del equipo (modo interno)
  fixedName?: boolean; // si true, no se muestra el campo de nombre
  decision: { approveLabel: string; changesLabel: string } | null; // null = sin botones
  canDecide?: boolean;
  onComment: (fd: FormData) => Promise<void>;
  onDecision?: (result: "APROBADO" | "CAMBIOS", note: string, name: string, versionNumber: number) => Promise<void>;
  // Portal del cliente: en vez de decidir con diálogos nativos (confirm/prompt), avisa al
  // contenedor de la INTENCIÓN para que muestre su propio flujo de marca (modal de
  // confirmación + mensaje de cierre). Si se pasa, los botones llaman a esto y NO a onDecision.
  onDecisionIntent?: (result: "APROBADO" | "CAMBIOS") => void;
  onResolve?: (commentId: string, resolved: boolean) => Promise<void>;
  // Editar/borrar comentarios propios mientras son borradores (modo interno). Si no se
  // pasan, no se muestran los controles.
  onEdit?: (commentId: string, body: string) => Promise<void>;
  onDelete?: (commentId: string) => Promise<void>;
}) {
  const [vIdx, setVIdx] = React.useState(0);
  const version = versions[vIdx] ?? versions[0];
  const playerRef = React.useRef<PlayerApi | null>(null);

  const [name, setName] = React.useState(defaultName);
  const [body, setBody] = React.useState("");
  const [noteBody, setNoteBody] = React.useState("");
  const [tc, setTc] = React.useState<number | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { prompt: promptInput, dialog: promptDialog } = usePromptDialog();
  const [drawOpen, setDrawOpen] = React.useState(false);
  const [drawing, setDrawing] = React.useState<string | null>(null); // dataURL JPEG (anotación manual)
  const [hideResolved, setHideResolved] = React.useState(false);
  const [pending, start] = React.useTransition();
  // Comentarios añadidos en esta sesión (UI optimista): se muestran al instante SIN
  // recargar la página, para que el reproductor de video NO se reinicie al comentar.
  const [localComments, setLocalComments] = React.useState<StageComment[]>([]);
  // Estado «resuelto» cambiado en esta sesión (también optimista, sin recargar).
  const [resolvedOverride, setResolvedOverride] = React.useState<Record<string, boolean>>({});
  // Ediciones/borrados de comentarios en esta sesión (optimista, sin recargar el video).
  const [bodyOverride, setBodyOverride] = React.useState<Record<string, string>>({});
  const [deletedIds, setDeletedIds] = React.useState<Set<string>>(new Set());
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState("");

  const startEdit = (c: StageComment) => { setEditingId(c.id); setEditText(c.body); };
  const saveEdit = (id: string) => {
    if (!onEdit) return;
    const next = editText.trim();
    if (!next) return;
    setBodyOverride((p) => ({ ...p, [id]: next }));
    setEditingId(null);
    start(async () => { await onEdit(id, next); });
  };
  const removeComment = async (id: string) => {
    if (!onDelete) return;
    if (!(await confirm({ message: "¿Borrar este comentario? No se puede deshacer.", confirmLabel: "Borrar", danger: true }))) return;
    setDeletedIds((p) => new Set(p).add(id));
    start(async () => { await onDelete(id); });
  };
  // ¿Se puede editar/borrar este comentario? Solo borradores internos (no del cliente,
  // no sellados) y en modo interno con los callbacks disponibles.
  const canMutate = (c: StageComment) => mode === "internal" && !c.fromClient && !c.locked && (!!onEdit || !!onDelete);

  React.useEffect(() => {
    if (fixedName) return;
    setName(localStorage.getItem("review_name") || "");
  }, [fixedName]);

  // Mezcla los comentarios del servidor con los añadidos en esta sesión y aplica los
  // cambios de «resuelto» optimistas.
  const merged = React.useMemo(() => {
    return [...comments, ...localComments]
      .filter((c) => !deletedIds.has(c.id))
      .map((c) => {
        let next = c;
        if (c.id in resolvedOverride) next = { ...next, resolved: resolvedOverride[c.id] };
        if (c.id in bodyOverride) next = { ...next, body: bodyOverride[c.id] };
        return next;
      });
  }, [comments, localComments, resolvedOverride, bodyOverride, deletedIds]);

  // Comentarios de la versión actual: separados en momentos (con captura/timecode) y notas.
  const ofVersion = merged.filter((c) => c.versionNumber == null || c.versionNumber === version?.number);
  const allMoments = ofVersion.filter((c) => !c.isNote).sort((a, b) => (a.timecode ?? 1e9) - (b.timecode ?? 1e9));
  const resolvedCount = allMoments.filter((c) => c.resolved).length;
  const moments = hideResolved ? allMoments.filter((c) => !c.resolved) : allMoments;
  const notes = ofVersion.filter((c) => c.isNote);

  const seek = (t: number) => playerRef.current?.seek(t);
  // Fija el segundo actual del video Y lo pausa, para anclar el comentario al momento
  // exacto (si no, el video sigue corriendo mientras escribes y el segundo se mueve).
  const grabTime = () => {
    const t = playerRef.current?.getTime();
    playerRef.current?.pause();
    if (t != null) setTc(t);
  };
  // Al empezar a comentar (foco en el cuadro), marca el momento automáticamente la
  // primera vez. Si ya hay un momento marcado, respeta el que el usuario eligió.
  const onCommentFocus = () => {
    if (tc == null && version?.timecodeCapable) grabTime();
  };

  // Comentario anclado a un momento: captura automática del frame + el texto encima.
  const submitMoment = () => {
    if (!body.trim() && !drawing) return;
    if (!fixedName) localStorage.setItem("review_name", name);
    // Segundo del video: el marcado a mano, o el actual en el momento de comentar.
    const at = tc ?? playerRef.current?.getTime() ?? null;
    // Imagen a guardar: el dibujo manual si existe; si no, captura automática del frame
    // con el texto del comentario quemado encima (cuando la fuente lo permite).
    const image = drawing ?? playerRef.current?.capture(body.trim() || undefined) ?? null;
    const fd = new FormData();
    fd.set("authorName", name || defaultName);
    fd.set("body", body);
    if (at != null) fd.set("timecode", String(at));
    if (version) fd.set("versionNumber", String(version.number));
    if (image) fd.set("drawingData", JSON.stringify({ image, timecode: at }));
    fd.set("isNote", "false");
    const optimistic: StageComment = {
      id: `local-${Date.now()}-${localComments.length}`,
      authorName: name || defaultName || (mode === "client" ? "Cliente" : "Equipo"),
      body: body.trim() || "(anotación)",
      timecode: at,
      versionNumber: version?.number ?? null,
      drawing: image ? { image } : null,
      isNote: false,
      fromClient: mode === "client",
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    start(async () => {
      await onComment(fd);
      setLocalComments((prev) => [...prev, optimistic]);
      setBody(""); setTc(null); setDrawing(null); setDrawOpen(false);
    });
  };

  // Nota general: sin captura ni timecode.
  const submitNote = () => {
    if (!noteBody.trim()) return;
    if (!fixedName) localStorage.setItem("review_name", name);
    const fd = new FormData();
    fd.set("authorName", name || defaultName);
    fd.set("body", noteBody);
    if (version) fd.set("versionNumber", String(version.number));
    fd.set("isNote", "true");
    const optimistic: StageComment = {
      id: `local-note-${Date.now()}-${localComments.length}`,
      authorName: name || defaultName || (mode === "client" ? "Cliente" : "Equipo"),
      body: noteBody.trim(),
      timecode: null,
      versionNumber: version?.number ?? null,
      drawing: null,
      isNote: true,
      fromClient: mode === "client",
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    start(async () => {
      await onComment(fd);
      setLocalComments((prev) => [...prev, optimistic]);
      setNoteBody("");
    });
  };

  const decide = async (result: "APROBADO" | "CAMBIOS") => {
    if (!onDecision) return;
    const verb = result === "APROBADO" ? decision?.approveLabel : decision?.changesLabel;
    let note = "";
    if (result === "CAMBIOS") {
      const r = await promptInput({ title: verb, message: "¿Qué cambios se solicitan? (opcional)" });
      if (r === null) return; // canceló
      note = r;
    } else if (!(await confirm({ title: verb, message: `¿${verb}?`, confirmLabel: verb }))) return;
    if (!fixedName) localStorage.setItem("review_name", name);
    start(() => onDecision(result, note, name || defaultName, version?.number ?? 0));
  };

  const decided = status === "APROBADO";
  const vertical = orientation === "vertical";

  return (
    <div className={vertical ? "flex flex-col gap-6 lg:flex-row lg:items-start" : "space-y-5"}>
      {confirmDialog}
      {promptDialog}
      {/* ── Material + decisión ── vertical: columna IZQUIERDA (angosta, fija al hacer scroll);
          horizontal: arriba a todo el ancho. */}
      <div className={vertical ? "lg:sticky lg:top-4 lg:w-2/5 lg:max-w-sm lg:shrink-0" : undefined}>
        {versions.length > 1 ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Versión:</span>
            {versions.map((v, i) => (
              <button key={v.number} onClick={() => { setVIdx(i); setTc(null); setDrawing(null); setDrawOpen(false); }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${i === vIdx ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>
                v{v.number}
              </button>
            ))}
          </div>
        ) : null}

        <MediaViewer version={version} apiRef={playerRef} drawOpen={drawOpen} onDrawn={setDrawing} caption={drawOpen ? "" : body} />

        {version?.notes ? (
          <p className="mt-2 rounded-md bg-card px-3 py-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">Notas v{version.number}:</span> {version.notes}</p>
        ) : null}

        {/* Herramientas */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {version?.openUrl ? (
            <a href={version.openUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Abrir original ↗</a>
          ) : null}
          {allowDrawings ? (
            <button onClick={() => setDrawOpen((o) => !o)} className={`rounded-md border px-2.5 py-1 text-xs font-medium ${drawOpen ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}>
              {drawOpen ? "✏️ Dibujando — toca el material" : "✏️ Dibujar / anotar"}
            </button>
          ) : null}
          {drawing ? <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Anotación lista</span> : null}
        </div>
        {version?.kind === "drive_file" ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            ℹ️ Por defecto se reproduce con el visor de Google (rápido). Para guardar el fotograma al comentar, activa «📸 Modo captura» (carga el video del mismo origen; en masters pesados tarda). Alternativa más ágil: sube un archivo liviano de revisión en «+ Versión».
          </p>
        ) : null}
        {version && (version.kind === "youtube" || version.kind === "vimeo" || version.kind === "drive_folder" || version.kind === "other") ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            ℹ️ Esta fuente reproduce pero no permite captura automática del fotograma. Para anotar, usa ✏️ Dibujar (pega o sube una captura). Para captura automática, sube el video o usa un enlace de archivo de Drive.
          </p>
        ) : null}

        {/* Decisión */}
        {decision ? (
          decided ? (
            <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">✅ Entregable aprobado.</p>
          ) : canDecide ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={() => (onDecisionIntent ? onDecisionIntent("APROBADO") : decide("APROBADO"))} disabled={pending} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{decision.approveLabel}</button>
              <button onClick={() => (onDecisionIntent ? onDecisionIntent("CAMBIOS") : decide("CAMBIOS"))} disabled={pending} className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-500/10 dark:text-amber-300">{decision.changesLabel}</button>
            </div>
          ) : null
        ) : null}
      </div>

      {/* ── Comentarios + notas ── vertical: columna DERECHA (momentos y notas apilados);
          horizontal: debajo del player, en dos columnas. */}
      <div className={vertical ? "min-w-0 flex-1 space-y-6" : "grid gap-6 md:grid-cols-2"}>
        {/* Comentarios por momento */}
        <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {onResolve ? "Checklist de cambios" : "Comentarios por momento"}{" "}
            <span className="font-normal text-muted-foreground">
              ({onResolve ? `${resolvedCount}/${allMoments.length} hechos` : allMoments.length})
            </span>
          </h2>
          {onResolve && resolvedCount > 0 ? (
            <button onClick={() => setHideResolved((v) => !v)} className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent">
              {hideResolved ? `Ver hechos (${resolvedCount})` : "Ocultar hechos"}
            </button>
          ) : null}
        </div>
        <div className="mb-3 max-h-[42vh] space-y-2 overflow-y-auto pr-1">
          {moments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Pausa el video donde quieras y escribe un comentario: se guarda el segundo y una captura del fotograma.</p>
          ) : (
            moments.map((c) => (
              <div key={c.id} className={`flex gap-2.5 rounded-lg border bg-card p-3 text-sm ${c.resolved ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/5" : "border-border"}`}>
                {/* Casilla del checklist: marca el cambio como realizado (avisa al equipo). */}
                {onResolve ? (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={c.resolved}
                    title={c.resolved ? "Marcar como pendiente" : "Marcar como realizado"}
                    onClick={() => { const next = !c.resolved; setResolvedOverride((p) => ({ ...p, [c.id]: next })); start(() => onResolve(c.id, next)); }}
                    disabled={pending}
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border text-[12px] font-bold transition-colors disabled:opacity-50 ${c.resolved ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40 text-transparent hover:border-primary"}`}
                  >
                    ✓
                  </button>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.authorName}</span>
                    {!c.fromClient ? <span className="rounded bg-secondary px-1.5 text-[10px] text-secondary-foreground">equipo</span> : <span className="rounded bg-primary/10 px-1.5 text-[10px] text-primary">cliente</span>}
                    {c.timecode != null ? (
                      <button onClick={() => seek(c.timecode!)} className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary hover:bg-primary/20">{fmtTime(c.timecode)}</button>
                    ) : null}
                    <span className="ml-auto flex items-center gap-1.5">
                      {c.resolved && onResolve ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">✓ hecho</span> : null}
                      {canMutate(c) ? <CommentActions onEdit={onEdit ? () => startEdit(c) : undefined} onDelete={onDelete ? () => removeComment(c.id) : undefined} disabled={pending} /> : null}
                    </span>
                  </div>
                  {editingId === c.id ? (
                    <EditBox value={editText} onChange={setEditText} onSave={() => saveEdit(c.id)} onCancel={() => setEditingId(null)} disabled={pending} />
                  ) : (
                    <p className={`mt-1 whitespace-pre-wrap ${c.resolved ? "text-muted-foreground line-through" : "text-foreground/90"}`}>{c.body}</p>
                  )}
                  {c.drawing?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.drawing.image} alt="Captura del momento" className="mt-2 w-full rounded-md border border-border" />
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Nuevo comentario por momento */}
        <div className="space-y-2 rounded-xl border border-border bg-card p-3">
          {!fixedName ? (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
          ) : null}
          <textarea value={body} onChange={(e) => setBody(e.target.value)} onFocus={onCommentFocus} rows={3} placeholder="Escribe sobre el video… al comentar se guarda el segundo y la captura del fotograma" className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <div className="flex items-center justify-between gap-2">
            {/* El segundo se fija automáticamente: al enfocar el cuadro (se pausa el video)
                o, si no, en el momento de comentar. Ya no hay botón «Marcar momento». */}
            <span className="text-[11px] text-muted-foreground">
              {version?.timecodeCapable
                ? tc != null
                  ? `⏱ Se guardará en ${fmtTime(tc)} + captura del fotograma`
                  : "⏱ Se guardará el segundo + captura al comentar"
                : ""}
            </span>
            <button onClick={submitMoment} disabled={pending || (!body.trim() && !drawing)} className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {pending ? "Enviando…" : "Comentar"}
            </button>
          </div>
        </div>
        </div>

        {/* Notas generales (sin captura) — segunda columna */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">Notas generales ({notes.length})</h3>
          <div className="mb-2 max-h-[22vh] space-y-1.5 overflow-y-auto pr-1">
            {notes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Notas sueltas, sin captura ni segundo (impresiones generales).</p>
            ) : (
              notes.map((c) => (
                <div key={c.id} className="rounded-lg border border-dashed border-border bg-card px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{c.authorName}</span>
                    {!c.fromClient ? <span className="rounded bg-secondary px-1.5 text-[10px] text-secondary-foreground">equipo</span> : <span className="rounded bg-primary/10 px-1.5 text-[10px] text-primary">cliente</span>}
                    {canMutate(c) ? <span className="ml-auto"><CommentActions onEdit={onEdit ? () => startEdit(c) : undefined} onDelete={onDelete ? () => removeComment(c.id) : undefined} disabled={pending} /></span> : null}
                  </div>
                  {editingId === c.id ? (
                    <EditBox value={editText} onChange={setEditText} onSave={() => saveEdit(c.id)} onCancel={() => setEditingId(null)} disabled={pending} />
                  ) : (
                    <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-foreground/90">{c.body}</p>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="flex items-center gap-2">
            <input value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Nota general…" className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitNote(); } }} />
            <button onClick={submitNote} disabled={pending || !noteBody.trim()} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50">Añadir nota</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Botones compactos de editar/borrar un comentario (borrador, modo interno).
function CommentActions({ onEdit, onDelete, disabled }: { onEdit?: () => void; onDelete?: () => void; disabled?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {onEdit ? (
        <button type="button" onClick={onEdit} disabled={disabled} title="Editar" className="rounded px-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50">Editar</button>
      ) : null}
      {onDelete ? (
        <button type="button" onClick={onDelete} disabled={disabled} title="Borrar" className="rounded px-1 text-[11px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">Borrar</button>
      ) : null}
    </span>
  );
}

// Edición en línea del texto de un comentario.
function EditBox({ value, onChange, onSave, onCancel, disabled }: { value: string; onChange: (v: string) => void; onSave: () => void; onCancel: () => void; disabled?: boolean }) {
  return (
    <div className="mt-1 space-y-1.5">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        autoFocus
        className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSave(); } if (e.key === "Escape") onCancel(); }}
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={onSave} disabled={disabled || !value.trim()} className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Guardar</button>
        <button type="button" onClick={onCancel} disabled={disabled} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50">Cancelar</button>
      </div>
    </div>
  );
}

// ── Visor de medios con API de reproductor + captura de fotograma ──
function MediaViewer({ version, apiRef, drawOpen, onDrawn, caption }: {
  version: StageVersion | undefined;
  apiRef: React.MutableRefObject<PlayerApi | null>;
  drawOpen: boolean;
  onDrawn: (dataUrl: string | null) => void;
  caption: string;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const ytRef = React.useRef<HTMLIFrameElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytPlayer = React.useRef<any>(null);
  // Para Drive ofrecemos DOS modos: «modo captura» (video proxiado del mismo origen, que
  // SÍ permite capturar el fotograma) y ver con el reproductor de Google (iframe, rápido,
  // ideal solo para ver masters pesados). Por DEFECTO arranca en modo captura, porque la
  // captura del frame al comentar es la función central; el revisor puede pasar a Google
  // si solo quiere ver y el master pesado tarda en cargar.
  const isDriveProxyable = version?.kind === "drive_file" && !!version.proxySrc;
  const [driveProxyFailed, setDriveProxyFailed] = React.useState(false);
  const [captureMode, setCaptureMode] = React.useState(isDriveProxyable);
  React.useEffect(() => {
    setDriveProxyFailed(false);
    setCaptureMode(version?.kind === "drive_file" && !!version.proxySrc);
  }, [version]);

  const usingProxy = isDriveProxyable && captureMode && !driveProxyFailed;
  // Elemento del mismo origen del que SÍ se puede leer el fotograma.
  const captureEl = (): HTMLVideoElement | HTMLImageElement | null =>
    version?.kind === "video" || usingProxy ? videoRef.current : version?.kind === "image" ? imgRef.current : null;
  const canCapture = version?.kind === "video" || version?.kind === "image" || usingProxy;

  // API del reproductor según el tipo de fuente.
  React.useEffect(() => {
    if (!version) { apiRef.current = null; return; }
    const cap = (caption?: string) => composite(captureEl(), [], { w: 0, h: 0 }, caption);
    if (version.kind === "video" || usingProxy) {
      apiRef.current = {
        getTime: () => videoRef.current?.currentTime ?? null,
        seek: (t) => { if (videoRef.current) { videoRef.current.currentTime = t; videoRef.current.play().catch(() => {}); } },
        pause: () => { videoRef.current?.pause(); },
        capture: cap,
      };
    } else if (version.kind === "image") {
      apiRef.current = { getTime: () => null, seek: () => {}, pause: () => {}, capture: cap };
    } else if (version.kind === "youtube") {
      apiRef.current = {
        getTime: () => { try { return ytPlayer.current?.getCurrentTime?.() ?? null; } catch { return null; } },
        seek: (t) => { try { ytPlayer.current?.seekTo?.(t, true); } catch { /* noop */ } },
        pause: () => { try { ytPlayer.current?.pauseVideo?.(); } catch { /* noop */ } },
        capture: () => null,
      };
    } else {
      apiRef.current = { getTime: () => null, seek: () => {}, pause: () => {}, capture: () => null };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, apiRef, usingProxy]);

  // Carga la IFrame API de YouTube (para leer el segundo).
  React.useEffect(() => {
    if (version?.kind !== "youtube" || !ytRef.current) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const make = () => { if (!cancelled && (window as any).YT && ytRef.current) ytPlayer.current = new (window as any).YT.Player(ytRef.current); };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).YT?.Player) make();
    else {
      const id = "yt-iframe-api";
      if (!document.getElementById(id)) {
        const s = document.createElement("script");
        s.id = id; s.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(s);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev = (window as any).onYouTubeIframeAPIReady;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).onYouTubeIframeAPIReady = () => { prev?.(); make(); };
    }
    return () => { cancelled = true; };
  }, [version]);

  if (!version || version.kind === "none" || !version.src) {
    return <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">Sin material para esta versión.</div>;
  }

  const overlay = drawOpen ? <DrawOverlay captureEl={captureEl} canCapture={canCapture} onResult={onDrawn} /> : null;
  // Subtítulo en vivo del comentario que se está escribiendo, encima del video.
  const liveCaption = !drawOpen && caption.trim() ? (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-8">
      <span className="text-sm font-medium text-white drop-shadow">{caption.trim()}</span>
    </div>
  ) : null;
  // Conmutador Drive: ver con Google (rápido) ↔ modo captura (video proxiado).
  const driveToggle = isDriveProxyable && !drawOpen ? (
    <button
      type="button"
      onClick={() => setCaptureMode((m) => !m)}
      title={captureMode ? "Volver al reproductor de Google (más rápido)" : "Cargar el video para poder capturar el fotograma"}
      className="absolute right-2 top-2 z-10 rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-white shadow hover:bg-black/85"
    >
      {captureMode ? "▶︎ Ver con Google" : "📸 Modo captura"}
    </button>
  ) : null;

  if (version.kind === "video" || usingProxy) {
    return (
      <div className="relative mx-auto w-fit max-w-full">
        <video
          ref={videoRef}
          src={usingProxy ? version.proxySrc! : version.src}
          controls
          crossOrigin={usingProxy ? undefined : "anonymous"}
          onError={() => { if (usingProxy) setDriveProxyFailed(true); }}
          className="block max-h-[80vh] w-auto max-w-full rounded-xl border border-border bg-black"
        />
        {driveToggle}
        {liveCaption}
        {overlay}
      </div>
    );
  }
  if (version.kind === "image") {
    return (
      <div className="relative mx-auto w-fit max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={version.src} crossOrigin="anonymous" alt="Material" className="block max-h-[80vh] w-auto max-w-full rounded-xl border border-border" />
        {overlay}
      </div>
    );
  }
  // YouTube / Vimeo / Drive (iframe). Para Drive, el conmutador permite pasar a modo captura.
  return (
    <div className="relative">
      <iframe ref={ytRef} src={version.src} className="aspect-video w-full rounded-xl border border-border bg-black" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
      {driveToggle}
      {liveCaption}
      {overlay}
    </div>
  );
}

type Stroke = { x: number; y: number }[];

// Lienzo de anotación. Compone un JPEG con fondo + trazos rojos. El fondo es, por
// prioridad: (1) captura pegada/subida (sirve para YouTube/Vimeo/Drive sin proxy);
// (2) el fotograma del <video>/<img> del mismo origen; (3) fondo oscuro.
function DrawOverlay({ captureEl, canCapture, onResult }: {
  captureEl: () => HTMLVideoElement | HTMLImageElement | null;
  canCapture: boolean;
  onResult: (dataUrl: string | null) => void;
}) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const strokes = React.useRef<Stroke[]>([]);
  const drawingNow = React.useRef(false);
  const bgImg = React.useRef<HTMLImageElement | null>(null);
  const [bgUrl, setBgUrl] = React.useState<string | null>(null);

  const ctx = () => ref.current?.getContext("2d") ?? null;
  const redraw = () => {
    const c = ref.current, g = ctx();
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.strokeStyle = "#ef4444"; g.lineWidth = 3; g.lineCap = "round"; g.lineJoin = "round";
    for (const s of strokes.current) { g.beginPath(); s.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); }
  };
  const commit = () => {
    const c = ref.current; if (!c) return;
    const src = bgImg.current ?? captureEl();
    onResult(composite(src, strokes.current, { w: c.width, h: c.height }));
  };

  React.useEffect(() => {
    const c = ref.current; if (!c) return;
    const r = c.getBoundingClientRect(); c.width = r.width; c.height = r.height;
  }, []);

  const loadBg = (file: File | Blob | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const img = new Image();
      img.onload = () => { bgImg.current = img; setBgUrl(url); commit(); };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };
  const loadBgRef = React.useRef(loadBg);
  loadBgRef.current = loadBg;

  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (item) { e.preventDefault(); loadBgRef.current(item.getAsFile()); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div className="absolute inset-0">
      {bgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bgUrl} alt="" className="absolute inset-0 h-full w-full rounded-xl bg-black object-contain" />
      ) : null}
      <canvas
        ref={ref}
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none rounded-xl"
        onPointerDown={(e) => { drawingNow.current = true; strokes.current.push([pos(e)]); (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (!drawingNow.current) return; strokes.current[strokes.current.length - 1].push(pos(e)); redraw(); }}
        onPointerUp={() => { drawingNow.current = false; commit(); }}
      />
      {!bgUrl && !canCapture ? (
        <div className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit max-w-[90%] rounded-md bg-black/70 px-3 py-1 text-center text-[11px] text-white">
          Pega (Ctrl/Cmd+V) o sube una captura del momento para anotarla
        </div>
      ) : null}
      <div className="absolute right-2 top-2 flex gap-1.5">
        <label className="cursor-pointer rounded bg-white/90 px-2 py-1 text-[11px] font-medium text-neutral-700 shadow hover:bg-white">
          Subir captura
          <input type="file" accept="image/*" className="hidden" onChange={(e) => loadBg(e.target.files?.[0] ?? null)} />
        </label>
        <button onClick={() => { strokes.current = []; bgImg.current = null; setBgUrl(null); redraw(); onResult(null); }} className="rounded bg-white/90 px-2 py-1 text-[11px] font-medium text-neutral-700 shadow hover:bg-white">Limpiar</button>
      </div>
    </div>
  );
}

// Compone fondo (fotograma/imagen) + trazos (+ caption opcional) en un JPEG. Si no hay
// fuente o falla por CORS, usa fondo oscuro. box={w:0,h:0} → escala 1:1 con el natural.
function composite(
  source: HTMLImageElement | HTMLVideoElement | null,
  strokes: Stroke[],
  box: { w: number; h: number },
  caption?: string,
): string | null {
  if (!strokes.length && !source && !caption) return null;
  const natW = source ? ((source as HTMLVideoElement).videoWidth || (source as HTMLImageElement).naturalWidth || source.clientWidth) : 0;
  const natH = source ? ((source as HTMLVideoElement).videoHeight || (source as HTMLImageElement).naturalHeight || source.clientHeight) : 0;
  const bgW = natW || box.w || 800;
  const bgH = natH || box.h || 450;
  const scale = Math.min(1, 1280 / bgW);
  const cw = Math.round(bgW * scale), ch = Math.round(bgH * scale);
  const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
  const g = cv.getContext("2d"); if (!g) return null;
  let drew = false;
  if (source && natW) { try { g.drawImage(source, 0, 0, cw, ch); drew = true; } catch { /* CORS */ } }
  if (!drew) { g.fillStyle = "#0f172a"; g.fillRect(0, 0, cw, ch); }
  // Trazos (escalados desde el tamaño del lienzo en pantalla al del canvas final).
  if (strokes.length && box.w && box.h) {
    const sx = cw / box.w, sy = ch / box.h;
    g.strokeStyle = "#ef4444"; g.lineWidth = 3 * sx; g.lineCap = "round"; g.lineJoin = "round";
    for (const s of strokes) { g.beginPath(); s.forEach((p, i) => (i ? g.lineTo(p.x * sx, p.y * sy) : g.moveTo(p.x * sx, p.y * sy))); g.stroke(); }
  }
  // Texto del comentario quemado en la parte inferior.
  if (caption) {
    const fs = Math.max(16, Math.round(ch * 0.045));
    g.font = `600 ${fs}px system-ui, sans-serif`;
    const lines = wrapText(g, caption, cw - fs * 2);
    const padY = Math.round(fs * 0.5);
    const barH = lines.length * (fs * 1.25) + padY * 2;
    g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(0, ch - barH, cw, barH);
    g.fillStyle = "#ffffff"; g.textBaseline = "top";
    lines.forEach((ln, i) => g.fillText(ln, fs, ch - barH + padY + i * (fs * 1.25)));
  }
  try { return cv.toDataURL("image/jpeg", 0.72); } catch { return null; }
}

function wrapText(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3); // máx 3 líneas
}
