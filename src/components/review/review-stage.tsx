"use client";

import * as React from "react";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { defaultFixDeadline } from "@/lib/business-time";
import { usePromptDialog } from "@/components/ui/prompt-dialog";
import { formatBogota } from "@/lib/bogota-time";
import { formatTimecode } from "@/lib/ui";

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

export type StagePriority = "OBLIGATORIA" | "SUGERENCIA";

export type StageComment = {
  id: string;
  authorName: string;
  body: string;
  timecode: number | null;
  versionNumber: number | null;
  drawing: { image?: string } | null;
  isNote: boolean;
  fromClient: boolean;
  // Respuesta del equipo DIRIGIDA al cliente («Responder al cliente»): pasa la defensa del
  // modo cliente, a diferencia de los comentarios internos de pre-aprobación.
  visibleToClient?: boolean;
  resolved?: boolean;
  // Prioridad de la corrección: OBLIGATORIA (bloqueante) o SUGERENCIA (opcional), para que el
  // editor sepa qué es imprescindible. Por defecto OBLIGATORIA (todo cuenta, como siempre).
  priority?: StagePriority;
  // Trazabilidad del «hecho»: cuándo se marcó (y quién, si el servidor lo trae). Se muestra en
  // AMBOS lados: el cliente también tiene derecho a saber si su corrección ya se atendió.
  resolvedAt?: string | null;
  resolvedByName?: string | null;
  // Marca discreta «editado»: el servidor solo la pone cuando se corrigió una corrección YA
  // sellada (editar un borrador es lo normal y no merece marca).
  editedAt?: string | null;
  // Hilo de UN nivel: si viene, este comentario es una RESPUESTA a la corrección madre.
  parentId?: string | null;
  // Sellado: si está en true, el comentario ya se envió («Solicitar cambios»). Ya NO significa
  // inmutable — su autor (o quien gestiona) puede corregirlo o retirarlo, con marca de editado.
  locked?: boolean;
  createdAt: string;
};

type PlayerApi = {
  getTime: () => number | null;
  // autoplay=false: salta SIN forzar la reproducción (arrastre de la barra, puntos del HUD).
  seek: (t: number, autoplay?: boolean) => void;
  pause: () => void;
  play: () => void;
  // Duración total del material (barra de progreso del modo inmersivo); null si la fuente
  // no la expone (iframe de Drive, imagen…).
  getDuration: () => number | null;
  isPaused: () => boolean;
  // Captura el fotograma actual (+ caption opcional quemado) en un JPEG; null si la
  // fuente no es del mismo origen (YouTube/Vimeo/Drive sin proxy → CORS).
  capture: (caption?: string) => string | null;
  // Fija la velocidad de reproducción (0.5×–2×). Aplica al <video> del mismo origen y a
  // YouTube; noop en imagen y en iframes de Drive/Vimeo (usan su propio control).
  setRate: (rate: number) => void;
};

// Velocidades de reproducción ofrecidas en la barra del reproductor.
const PLAYBACK_RATES = [0.5, 1, 1.25, 1.5, 2] as const;
const RATE_KEY = "review_rate";

const fmtTime = formatTimecode;

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
  askFixDeadline = false,
  mediaTabs,
  onComment,
  onDecision,
  onDecisionIntent,
  onResolve,
  onReopen,
  onReply,
  onSetPriority,
  onEdit,
  onDelete,
  immersiveEligible = false,
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
  // Pre-aprobación INTERNA: al «Solicitar cambios» se abre una ventana con calendario y
  // hora para que el PRODUCTOR fije el plazo de entrega de la corrección al editor
  // (por defecto 24 h hábiles; sáb/dom no cuentan). El portal del cliente NO pasa esta
  // prop, así que el cliente nunca ve nada de plazos internos.
  askFixDeadline?: boolean;
  // Pestañas del VISOR (conmutador bajo el material): además del video («Reel»), contenidos
  // alternos como la portada o el copy. Al cambiar de pestaña el video se OCULTA sin
  // desmontarse (conserva posición y buffer). Pensado para el portal del cliente.
  mediaTabs?: { key: string; label: string; content: React.ReactNode }[];
  onComment: (fd: FormData) => Promise<void>;
  onDecision?: (result: "APROBADO" | "CAMBIOS", note: string, name: string, versionNumber: number, fixDueIso?: string) => Promise<void>;
  // Portal del cliente: en vez de decidir con diálogos nativos (confirm/prompt), avisa al
  // contenedor de la INTENCIÓN para que muestre su propio flujo de marca (modal de
  // confirmación + mensaje de cierre). Si se pasa, los botones llaman a esto y NO a onDecision.
  onDecisionIntent?: (result: "APROBADO" | "CAMBIOS") => void;
  onResolve?: (commentId: string, resolved: boolean) => Promise<void>;
  // REABRIR una corrección ya marcada como hecha. Va aparte de onResolve a propósito: onResolve
  // enciende el checklist con casillas (que vive en la pestaña de Entregables, donde trabaja el
  // editor), mientras que reabrir es un botón suelto para el workspace de pre-aprobación.
  onReopen?: (commentId: string) => Promise<void>;
  // Responder DENTRO del hilo de una corrección (un solo nivel). `visibleToClient` solo lo decide
  // el equipo (modo interno): así puede contestarle al cliente o discutir en privado bajo una
  // corrección. En modo cliente el wrapper lo ignora (su respuesta siempre es del cliente).
  onReply?: (commentId: string, body: string, visibleToClient: boolean) => Promise<string | void>;
  // Alternar OBLIGATORIA/SUGERENCIA. Solo se pasa en modo interno; en el portal es solo lectura.
  onSetPriority?: (commentId: string, priority: StagePriority) => Promise<void>;
  // Editar/retirar comentarios del EQUIPO (modo interno), incluso ya sellados. Si no se
  // pasan, no se muestran los controles.
  onEdit?: (commentId: string, body: string) => Promise<void>;
  onDelete?: (commentId: string) => Promise<void>;
  // Formato «Reel celular»: SOLO el portal del cliente lo pasa en true (y solo para
  // entregables REEL_CELULAR). Activa el player de pantalla completa en el celular;
  // la pre-aprobación interna y el escritorio siguen con la vista normal.
  immersiveEligible?: boolean;
}) {
  const [vIdx, setVIdx] = React.useState(0);
  const version = versions[vIdx] ?? versions[0];
  const playerRef = React.useRef<PlayerApi | null>(null);
  // Capacidades EN VIVO del reproductor (las reporta MediaViewer): si de verdad se puede capturar el
  // fotograma y/o leer el segundo AHORA. En modo iframe (Drive/Vimeo sin proxy) no se puede, y así la
  // UI no promete lo que no va a cumplir.
  const [caps, setCaps] = React.useState({ frame: false, time: false });
  const captureHint = caps.frame && caps.time
    ? "el segundo y una captura del fotograma"
    : caps.time ? "el segundo" : caps.frame ? "una captura del fotograma" : null;

  const [name, setName] = React.useState(defaultName);
  const [body, setBody] = React.useState("");
  const [noteBody, setNoteBody] = React.useState("");
  // Pestaña activa del visor ("media" = el video; o la key de una mediaTab: portada, copy…).
  const [mediaTab, setMediaTab] = React.useState("media");
  // Error al enviar un comentario (rate limit, red…): se muestra en línea y NO tumba la página
  // ni aplica el estado optimista; lo escrito se conserva para reintentar.
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [tc, setTc] = React.useState<number | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { prompt: promptInput, dialog: promptDialog } = usePromptDialog();
  // Ventana «Solicitar cambios» con plazo (solo pre-aprobación interna, ver askFixDeadline).
  const [fixDlg, setFixDlg] = React.useState<null | { note: string; date: string; time: string }>(null);
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
  // Prioridad cambiada en esta sesión y correcciones editadas (marca «editado»), también optimistas.
  const [priorityOverride, setPriorityOverride] = React.useState<Record<string, StagePriority>>({});
  const [editedIds, setEditedIds] = React.useState<Set<string>>(new Set());
  // Hilo abierto para responder + su borrador. `replyToClient` arranca en FALSE a propósito: una
  // respuesta interna que se le escape al cliente es mucho peor que una que no le llegue, así que
  // mandársela exige un tic explícito.
  const [replyingId, setReplyingId] = React.useState<string | null>(null);
  const [replyText, setReplyText] = React.useState("");
  const [replyToClient, setReplyToClient] = React.useState(false);
  // Hilo abierto para responder DENTRO de la hoja del modo inmersivo. Va aparte de `replyingId`
  // porque la lista de la vista normal sigue MONTADA detrás del overlay: con el id compartido, su
  // textarea (que lleva autoFocus) se montaría en el mismo commit que la nuestra y, al ir después
  // en el árbol, le robaría el foco a un campo que el cliente ni siquiera ve. El borrador
  // (`replyText`), `sendReply` y `rowError` sí se reutilizan tal cual.
  // Se declara AQUÍ (y no junto al resto del estado inmersivo, más abajo) a propósito: `sendReply`
  // la usa y el compilador de React solo da por estable un setState declarado ANTES de la función
  // que lo llama — si no, deja de compilar el escenario y react-hooks/purity marca el `Date.now()`
  // de sendReply como impuro en render.
  const [immReplyId, setImmReplyId] = React.useState<string | null>(null);
  // Error de una acción de FILA (prioridad, reabrir, responder): se muestra bajo esa corrección y
  // no tumba la página. El servidor es la autoridad (puede rechazar por permisos) y al fallar se
  // revierte el estado optimista.
  const [rowError, setRowError] = React.useState<{ id: string; message: string } | null>(null);
  const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

  const startEdit = (c: StageComment) => { setEditingId(c.id); setEditText(c.body); };
  const saveEdit = (c: StageComment) => {
    if (!onEdit) return;
    const next = editText.trim();
    if (!next) return;
    setBodyOverride((p) => ({ ...p, [c.id]: next }));
    // Marca «editado» solo si ya estaba SELLADA: es exactamente lo que hace el servidor.
    if (c.locked) setEditedIds((p) => new Set(p).add(c.id));
    setEditingId(null);
    start(async () => { await onEdit(c.id, next); });
  };
  const removeComment = async (id: string) => {
    if (!onDelete) return;
    if (!(await confirm({ message: "¿Retirar este comentario? Si tiene respuestas, también se irán. No se puede deshacer.", confirmLabel: "Retirar", danger: true }))) return;
    setDeletedIds((p) => new Set(p).add(id));
    start(async () => { await onDelete(id); });
  };
  // ¿Se puede editar/retirar este comentario? Los del EQUIPO (no los del cliente), en modo interno
  // y con los callbacks disponibles. Sellado ya NO lo impide: corregir una redacción mala o retirar
  // una corrección que se descartó es más útil que dejarla inmutable (queda marca de «editado»).
  // Quién puede hacerlo de verdad (autor o gestor del proyecto) lo decide el servidor.
  const canMutate = (c: StageComment) => mode === "internal" && !c.fromClient && (!!onEdit || !!onDelete);

  // Reabre una corrección marcada como hecha (vuelve a pendiente y limpia el «hecho por»).
  const reopen = (id: string) => {
    if (!onReopen) return;
    setResolvedOverride((p) => ({ ...p, [id]: false }));
    setRowError(null);
    start(async () => {
      try {
        await onReopen(id);
      } catch (e) {
        setResolvedOverride((p) => ({ ...p, [id]: true }));
        setRowError({ id, message: errMsg(e, "No se pudo reabrir la corrección.") });
      }
    });
  };

  // Alterna OBLIGATORIA ↔ SUGERENCIA.
  const togglePriority = (c: StageComment) => {
    if (!onSetPriority) return;
    const prev = c.priority ?? "OBLIGATORIA";
    const next: StagePriority = prev === "OBLIGATORIA" ? "SUGERENCIA" : "OBLIGATORIA";
    setPriorityOverride((p) => ({ ...p, [c.id]: next }));
    setRowError(null);
    start(async () => {
      try {
        await onSetPriority(c.id, next);
      } catch (e) {
        setPriorityOverride((p) => ({ ...p, [c.id]: prev }));
        setRowError({ id: c.id, message: errMsg(e, "No se pudo cambiar la prioridad.") });
      }
    });
  };

  // Envía la respuesta del hilo. Hilos de UN nivel: si se responde a una respuesta, cuelga de la
  // misma corrección madre (igual que el servidor).
  const sendReply = (parent: StageComment) => {
    if (!onReply) return;
    const text = replyText.trim();
    if (!text) return;
    const rootId = parent.parentId ?? parent.id;
    // En el portal el cliente responde SIEMPRE de cara al equipo; el tic solo existe en interno.
    const toClient = mode === "client" ? true : replyToClient;
    const optimistic: StageComment = {
      id: `local-reply-${Date.now()}`,
      authorName: name || defaultName || (mode === "client" ? "Cliente" : "Equipo"),
      body: text,
      timecode: null,
      versionNumber: parent.versionNumber,
      drawing: null,
      isNote: false,
      fromClient: mode === "client",
      visibleToClient: toClient,
      // Una respuesta no es una corrección: no cuenta como bloqueante en el checklist.
      priority: "SUGERENCIA",
      parentId: rootId,
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    setRowError(null);
    start(async () => {
      try {
        await onReply(rootId, text, toClient);
        setLocalComments((prev) => [...prev, optimistic]);
        setReplyingId(null);
        // Cierra también el hilo de la hoja inmersiva (ver `immReplyId`). Inocuo para las vistas
        // vertical/horizontal: allí nunca se abre, así que siempre vale null.
        setImmReplyId(null);
        setReplyText("");
        setReplyToClient(false);
      } catch (e) {
        setRowError({ id: parent.id, message: errMsg(e, "No se pudo enviar la respuesta. Inténtalo de nuevo.") });
      }
    });
  };

  React.useEffect(() => {
    if (fixedName) return;
    setName(localStorage.getItem("review_name") || "");
  }, [fixedName]);

  // Mezcla los comentarios del servidor con los añadidos en esta sesión y aplica los
  // cambios de «resuelto» optimistas.
  const merged = React.useMemo(() => {
    return [...comments, ...localComments]
      .filter((c) => !deletedIds.has(c.id))
      // Defensa en profundidad: en el portal del CLIENTE nunca se muestran los comentarios
      // internos del equipo (fromClient=false), aunque por error llegaran al componente.
      // Las respuestas dirigidas al cliente (visibleToClient) sí pasan.
      .filter((c) => mode !== "client" || c.fromClient || c.visibleToClient)
      .map((c) => {
        let next = c;
        // Al REABRIR se limpia el «hecho por/cuándo», igual que hace el servidor.
        if (c.id in resolvedOverride) {
          const r = resolvedOverride[c.id];
          next = { ...next, resolved: r, ...(r ? {} : { resolvedAt: null, resolvedByName: null }) };
        }
        if (c.id in bodyOverride) next = { ...next, body: bodyOverride[c.id] };
        if (c.id in priorityOverride) next = { ...next, priority: priorityOverride[c.id] };
        if (editedIds.has(c.id)) next = { ...next, editedAt: next.editedAt ?? new Date().toISOString() };
        return next;
      });
  }, [comments, localComments, resolvedOverride, bodyOverride, priorityOverride, editedIds, deletedIds, mode]);

  // ── Hilos (un solo nivel) ── las RESPUESTAS no son correcciones sueltas: se agrupan bajo su
  // corrección madre. Se agrupan desde `merged`, que YA pasó la defensa del modo cliente, y solo
  // se pintan bajo las correcciones que de verdad se listan: si la madre no es visible para el
  // cliente, no se lista y sus respuestas no se pintan nunca (aunque alguna fuera visible).
  const repliesByParent = React.useMemo(() => {
    const map = new Map<string, StageComment[]>();
    for (const c of merged) {
      if (!c.parentId) continue;
      const list = map.get(c.parentId);
      if (list) list.push(c);
      else map.set(c.parentId, [c]);
    }
    for (const list of map.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return map;
  }, [merged]);

  // Comentarios de la versión actual: separados en momentos (con captura/timecode) y notas. Las
  // respuestas quedan fuera de ambas listas — van anidadas bajo su madre.
  const ofVersion = merged.filter((c) => (c.versionNumber == null || c.versionNumber === version?.number) && c.parentId == null);
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
  // Al enfocar el cuadro de comentario, ancla/ACTUALIZA el momento al fotograma ACTUAL del
  // video (y lo pausa). Así, si el cliente reproduce y luego vuelve a escribir, la captura se
  // actualiza al nuevo punto en vez de quedarse con la inicial.
  const onCommentFocus = () => {
    if (caps.time) grabTime();
  };

  // Comentario anclado a un momento: captura automática del frame + el texto encima.
  const submitMoment = () => {
    if (!body.trim() && !drawing) return;
    if (!fixedName) localStorage.setItem("review_name", name);
    // Se PAUSA antes de leer: así el segundo y el fotograma se toman del MISMO instante (si el
    // video sigue corriendo, el segundo guardado y la imagen capturada no coincidirían).
    playerRef.current?.pause();
    // Segundo del video: el actual (ya pausado); respaldo al minuto escrito a mano (fuentes que no
    // permiten leer el segundo). Así el segundo guardado y la imagen capturada coinciden.
    const at = playerRef.current?.getTime() ?? tc ?? null;
    // Imagen a guardar: el dibujo manual si existe; si no, la captura automática del frame REAL con
    // el texto del comentario quemado encima. Si la fuente no se puede capturar, capture() devuelve
    // null (NUNCA un frame negro) y el comentario se guarda solo con el segundo.
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
    setSendError(null);
    start(async () => {
      try {
        await onComment(fd);
        setLocalComments((prev) => [...prev, optimistic]);
        setBody(""); setTc(null); setDrawing(null); setDrawOpen(false);
      } catch (e) {
        setSendError(e instanceof Error ? e.message : "No se pudo enviar el comentario. Inténtalo de nuevo.");
      }
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
    setSendError(null);
    start(async () => {
      try {
        await onComment(fd);
        setLocalComments((prev) => [...prev, optimistic]);
        setNoteBody("");
      } catch (e) {
        setSendError(e instanceof Error ? e.message : "No se pudo enviar la nota. Inténtalo de nuevo.");
      }
    });
  };

  const decide = async (result: "APROBADO" | "CAMBIOS") => {
    if (!onDecision) return;
    const verb = result === "APROBADO" ? decision?.approveLabel : decision?.changesLabel;
    let note = "";
    if (result === "CAMBIOS") {
      if (askFixDeadline) {
        // Modo interno: ventana propia con nota + calendario y hora del plazo de la
        // corrección (por defecto, 24 horas hábiles a partir de ahora, hora de Bogotá).
        const def = defaultFixDeadline(new Date());
        setFixDlg({
          note: "",
          date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(def),
          time: new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(def),
        });
        return;
      }
      const r = await promptInput({ title: verb, message: "¿Qué cambios se solicitan? (opcional)" });
      if (r === null) return; // canceló
      note = r;
    } else if (!(await confirm({ title: verb, message: `¿${verb}?`, confirmLabel: verb }))) return;
    if (!fixedName) localStorage.setItem("review_name", name);
    start(() => onDecision(result, note, name || defaultName, version?.number ?? 0));
  };

  // Confirmación de la ventana de cambios con plazo → decisión con el instante elegido.
  const submitFixDlg = () => {
    if (!onDecision || !fixDlg) return;
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(fixDlg.date)
      ? new Date(`${fixDlg.date}T${/^\d{1,2}:\d{2}$/.test(fixDlg.time) ? fixDlg.time.padStart(5, "0") : "18:00"}:00.000-05:00`).toISOString()
      : undefined;
    const note = fixDlg.note;
    setFixDlg(null);
    if (!fixedName) localStorage.setItem("review_name", name);
    start(() => onDecision("CAMBIOS", note, name || defaultName, version?.number ?? 0, iso));
  };

  // Aprobado O entregado: la decisión ya está tomada; no se ofrecen botones que fallarían.
  const decided = status === "APROBADO" || status === "ENTREGADO";
  const vertical = orientation === "vertical";

  // ── Modo inmersivo (reels verticales; portal del cliente Y pre-aprobación interna) ──
  // El video ocupa TODA la pantalla (overlay fijo, tipo TikTok) y se corrige sin salir de él:
  // la burbuja pausa el video, congela el segundo y abre una hoja compacta. Al enviar, la
  // captura del fotograma es AUTOMÁTICA (capture() del reproductor, con el texto quemado);
  // dibujar es lo único opcional. Las correcciones existentes son puntos en la barra.
  // Pantalla completa SOLO para el formato «Reel celular» en el portal del cliente
  // (immersiveEligible) y siempre vertical. Los formatos Video vertical/horizontal y toda la
  // pre-aprobación interna usan la vista normal — decisión del usuario (2026-07-04).
  const immersiveCapable = immersiveEligible && vertical && mode === "client";
  const [immersive, setImmersive] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [sheetSent, setSheetSent] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const toastTimer = React.useRef<number | null>(null);
  const sentTcRef = React.useRef<number | null>(null);
  const sheetRef = React.useRef<HTMLDivElement>(null);
  // Hoja de LECTURA del inmersivo (correcciones, notas, versión y decisión). Va aparte de
  // `sheetOpen` (la hoja de ESCRITURA) a propósito: son excluyentes y cada una tiene su ciclo —
  // aquella congela el segundo y adjunta la captura, esta solo lee.
  const [panelOpen, setPanelOpen] = React.useState(false);
  // <video> del mismo origen (subido/proxy): frame + time a la vez. Solo ahí controlamos
  // play/pausa con el toque; los iframes (YouTube/Vimeo/Drive) conservan sus controles.
  const sameOriginVideo = caps.frame && caps.time;
  // Momentos con timecode de la versión actual, para los puntos de la barra del HUD.
  // Memoizado (y el HUD es React.memo): escribir en la hoja NO re-renderiza el HUD.
  const dotMoments = React.useMemo(
    () =>
      merged
        .filter((c) => !c.isNote && c.parentId == null && c.timecode != null && (c.versionNumber == null || c.versionNumber === version?.number))
        .sort((a, b) => (a.timecode ?? 0) - (b.timecode ?? 0))
        .map((c) => ({ id: c.id, timecode: c.timecode!, authorName: c.authorName, body: c.body, fromClient: c.fromClient })),
    [merged, version],
  );
  const closeSheet = React.useCallback(() => setSheetOpen(false), []);
  // Estables (useCallback), por lo mismo que openSheet/exitImmersive: `openPanel` es prop del HUD
  // memoizado — con una función en línea, escribir en cualquier hoja lo re-renderizaría por tecla.
  const openPanel = React.useCallback(() => {
    // Leer las correcciones (o decidir) con el reel corriendo detrás no tiene sentido, y de paso
    // evita que el player siga trabajando mientras la hoja re-renderiza al escribir.
    playerRef.current?.pause();
    // `sendError` lo comparten submitMoment y submitNote: el error de un envío anterior no debe
    // reaparecer en la otra hoja.
    setSendError(null);
    setSheetOpen(false);
    setPanelOpen(true);
  }, []);
  const closePanel = React.useCallback(() => { setPanelOpen(false); setImmReplyId(null); }, []);

  // En celular, cualquier reel VERTICAL entra DIRECTO en pantalla completa —tanto el cliente como
  // el equipo (pre-aprobación interna)—, porque abrir la revisión desde el móvil es el caso normal
  // y ese modo hay que detectarlo solo. (El tour del cliente renderiza por encima del overlay, así
  // que en la primera visita se ve el tour y al cerrarlo ya queda en pantalla completa.) Los
  // horizontales NO entran: quedan en la vista normal (video arriba, comentarios abajo).
  React.useEffect(() => {
    if (!immersiveCapable) return;
    try {
      if (window.matchMedia("(max-width: 768px)").matches) setImmersive(true);
    } catch { /* noop */ }
  }, [immersiveCapable]);

  // Bloquea el scroll del fondo mientras el overlay cubre la pantalla.
  React.useEffect(() => {
    if (!immersive) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [immersive]);

  // La hoja sube con el teclado del celular: iOS no redimensiona los `fixed`, así que se
  // compensa con visualViewport (la hoja queda pegada al borde superior del teclado).
  React.useEffect(() => {
    if (!sheetOpen) return;
    const vv = window.visualViewport;
    const el = sheetRef.current;
    if (!vv || !el) return;
    const onResize = () => { el.style.bottom = `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`; };
    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => { vv.removeEventListener("resize", onResize); vv.removeEventListener("scroll", onResize); el.style.bottom = "0px"; };
  }, [sheetOpen]);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  };
  // Estables (useCallback): son props del HUD memoizado — si cambiaran de identidad en cada
  // render, escribir en la hoja re-renderizaría el HUD y volverían los tirones en celular.
  const openSheet = React.useCallback(() => {
    const t = playerRef.current?.getTime();
    playerRef.current?.pause();
    if (t != null) setTc(t);
    setSheetOpen(true);
  }, []);
  const exitImmersive = React.useCallback(() => { setImmersive(false); setSheetOpen(false); setDrawOpen(false); setPanelOpen(false); setImmReplyId(null); }, []);

  // Botón «atrás» del celular: en inmersivo, volver CIERRA la pantalla completa en vez de
  // salir de la página (patrón de app nativa). Se apila una entrada al entrar y se consume
  // al salir por el chip ✕ para no dejarla huérfana en el historial.
  const pushedRef = React.useRef(false);
  React.useEffect(() => {
    if (!immersive) return;
    try { window.history.pushState({ lsImmersive: true }, ""); pushedRef.current = true; } catch { pushedRef.current = false; }
    const onPop = () => { pushedRef.current = false; setImmersive(false); setSheetOpen(false); setDrawOpen(false); setPanelOpen(false); setImmReplyId(null); };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pushedRef.current) { pushedRef.current = false; try { window.history.back(); } catch { /* noop */ } }
    };
  }, [immersive]);
  const sendFromSheet = () => {
    if (!body.trim() && !drawing) return;
    sentTcRef.current = playerRef.current?.getTime() ?? tc;
    setSheetSent(true);
    submitMoment();
  };

  // ── Acciones de la hoja de lectura ── sin useCallback a propósito: solo las usa ImmersiveSheet,
  // que NO está memoizada (sus listas cambian con cada corrección). Envolverlas daría una falsa
  // sensación de estabilidad; el que exige props estables es el HUD.
  // Mismo reset que el selector de versión de la vista normal. NO cierra la hoja: al cambiar de
  // versión el cliente quiere ver ahí mismo las correcciones de la nueva.
  const pickVersionFromPanel = (i: number) => {
    setVIdx(i); setTc(null); setDrawing(null); setDrawOpen(false); setImmReplyId(null);
  };
  // Saltar a una corrección: reutiliza seek() (que reanuda) y cierra la hoja para que el momento
  // se VEA — si no, el salto ocurriría detrás de la hoja.
  const jumpFromPanel = (t: number) => { seek(t); setPanelOpen(false); setImmReplyId(null); };
  // Decidir sin salir de pantalla completa: MISMO flujo que la vista normal (onDecisionIntent si
  // viene, si no decide()). Se cierra la hoja y se pausa antes porque el modal del portal se pinta
  // encima con backdrop-blur y dejar el video corriendo detrás cuesta GPU y desconcierta.
  const decideFromPanel = (result: "APROBADO" | "CAMBIOS") => {
    setPanelOpen(false);
    playerRef.current?.pause();
    if (onDecisionIntent) onDecisionIntent(result); else void decide(result);
  };
  // Cierra la hoja cuando el envío (optimista) termina sin error, avisa y reanuda el video.
  React.useEffect(() => {
    if (!sheetSent || pending) return;
    setSheetSent(false);
    if (!sendError) {
      setSheetOpen(false);
      showToast(`✓ Corrección enviada${sentTcRef.current != null ? ` en ${fmtTime(sentTcRef.current)}` : ""}`);
      playerRef.current?.play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetSent, pending, sendError]);
  return (
    <div className={vertical ? "flex flex-col gap-6 lg:flex-row lg:items-start" : "space-y-5"}>
      {confirmDialog}
      {promptDialog}
      {/* Ventana «Solicitar cambios» con PLAZO de la corrección (solo pre-aprobación interna).
          El productor fija fecha y hora de entrega para el editor; el cliente nunca la ve. */}
      {fixDlg ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
            <p className="text-sm font-semibold">Solicitar cambios</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Los comentarios de esta versión se sellan como checklist para el editor y su tarea
              «Corregir…» nace con este plazo. Si la corrección llega después, queda como incumplida.
            </p>
            <textarea
              value={fixDlg.note}
              onChange={(e) => setFixDlg({ ...fixDlg, note: e.target.value })}
              rows={3}
              placeholder="Resumen de los cambios (opcional)"
              className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
                Entrega de la corrección
                <input
                  type="date"
                  value={fixDlg.date}
                  onChange={(e) => setFixDlg({ ...fixDlg, date: e.target.value })}
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
                Hora (Bogotá)
                <input
                  type="time"
                  value={fixDlg.time}
                  onChange={(e) => setFixDlg({ ...fixDlg, time: e.target.value })}
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Por defecto: 24 horas hábiles (sábados y domingos no cuentan). Este plazo es interno — el cliente no lo ve.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setFixDlg(null)} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">Cancelar</button>
              <button type="button" onClick={submitFixDlg} disabled={pending} className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">Enviar correcciones</button>
            </div>
          </div>
        </div>
      ) : null}
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

        {/* Pestaña «media» (el video): se OCULTA con CSS al cambiar de pestaña, sin desmontar,
            para conservar la posición de reproducción y el buffer. En modo inmersivo el MISMO
            contenedor pasa a overlay fijo (solo cambian clases → el video no se re-monta ni
            pierde la posición). */}
        {/* iOS Safari: `h-[100dvh]` (no `inset-0`/`100vh`) hace que el overlay respete la altura
            VISIBLE real, así los controles de abajo no quedan bajo la barra de Safari; `touch-manipulation`
            quita el retardo de 300 ms y el zoom por doble-toque; `overscroll-none` corta el rebote
            (rubber-band); y `-webkit-tap-highlight-color: transparent` (heredado por todos los hijos)
            elimina el destello gris al tocar. */}
        <div
          className={mediaTab !== "media" ? "hidden" : immersive ? "fixed inset-x-0 top-0 z-[60] h-[100dvh] touch-manipulation overscroll-none bg-black" : undefined}
          style={immersive ? { WebkitTapHighlightColor: "transparent" } : undefined}
        >
          <div className={immersive ? "relative h-full w-full" : "relative"}>
            <MediaViewer version={version} apiRef={playerRef} drawOpen={drawOpen} onDrawn={setDrawing} caption={drawOpen ? "" : body} vertical={vertical} onCapabilities={setCaps} immersive={immersive} />

            {immersive ? (
              <>
                {/* HUD (toque de pausa, chrome auto-ocultable, barra 60fps con arrastre, puntos,
                    burbuja «Comentar»): componente memoizado APARTE que escribe el progreso
                    directo al DOM con rAF — cero re-renders del escenario por frame. Con fuentes
                    IFRAME (YouTube/Vimeo/Drive) NO pinta barra propia: el iframe ya trae sus
                    controles y pintar dos barras a la vez era el bug de los «controles dobles». */}
                <ImmersiveHud
                  playerRef={playerRef}
                  canTap={sameOriginVideo}
                  rateCapable={sameOriginVideo || version?.kind === "youtube" || version?.kind === "vimeo"}
                  drawOpen={drawOpen}
                  sheetOpen={sheetOpen}
                  onCloseSheet={closeSheet}
                  onOpenSheet={openSheet}
                  onExit={exitImmersive}
                  versionLabel={`v${version?.number ?? 1}`}
                  moments={dotMoments}
                  // Hoja de LECTURA: `panelOpen` apaga el chrome (tapa el video igual que el
                  // lienzo) y `momentsCount` alimenta el contador de la píldora. Memo-seguras:
                  // booleano, número y useCallback estable — el HUD NO debe re-renderizarse al
                  // escribir en ninguna hoja.
                  panelOpen={panelOpen}
                  momentsCount={allMoments.length}
                  onOpenPanel={openPanel}
                />

                {/* Hoja de corrección: el segundo va congelado y la captura del fotograma se
                    adjunta AUTOMÁTICAMENTE al enviar; dibujar es lo único opcional. */}
                {/* Fondo sólido (sin backdrop-blur): desenfocar un video en movimiento es caro
                    en la GPU del celular y producía tirones. */}
                <div ref={sheetRef} className={`absolute inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-white/10 bg-zinc-900 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 transition-transform duration-200 ${sheetOpen ? "translate-y-0" : "pointer-events-none translate-y-[110%]"}`}>
                  <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-white/25" />
                  <p className="text-[13px] font-medium text-white">
                    Corrección{tc != null ? <> en <span className="font-mono text-primary">{fmtTime(tc)}</span></> : null}
                  </p>
                  <p className="mb-2 text-[11px] text-white/55">
                    {caps.frame ? "La captura del fotograma se adjunta automáticamente." : caps.time ? "Se guarda el segundo; esta fuente no permite capturar la imagen." : "Se guarda como comentario del video."}
                  </p>
                  {!fixedName ? (
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" className="mb-2 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-primary" />
                  ) : null}
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Escribe tu corrección…" className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-primary" />
                  {drawing ? <p className="mt-1 text-[11px] text-emerald-300">✏️ Dibujo adjunto</p> : null}
                  {sendError ? <p className="mt-1 text-[11px] text-red-300">{sendError}</p> : null}
                  <div className="mt-2 flex items-center gap-2">
                    {allowDrawings ? (
                      <button type="button" onClick={() => { setSheetOpen(false); setDrawOpen(true); }} className="rounded-full bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20">✏️ Dibujar</button>
                    ) : null}
                    <button type="button" onClick={() => setSheetOpen(false)} className="rounded-full px-3 py-2 text-xs font-medium text-white/60 hover:text-white">Cancelar</button>
                    <button type="button" onClick={sendFromSheet} disabled={pending || (!body.trim() && !drawing)} className="ml-auto rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                      {pending ? "Enviando…" : "Enviar"}
                    </button>
                  </div>
                </div>

                {/* Hoja de LECTURA: lo que en la vista normal vive a la derecha del player
                    (versión · correcciones con hilos · notas · decisión), sin salir del reel.
                    Desde el celular el overlay lo tapa todo, así que sin esto el cliente no podía
                    ni leer lo ya pedido ni aprobar sin salirse. */}
                <ImmersiveSheet
                  open={panelOpen}
                  onClose={closePanel}
                  versions={versions}
                  vIdx={vIdx}
                  onPickVersion={pickVersionFromPanel}
                  moments={allMoments}
                  notes={notes}
                  repliesByParent={repliesByParent}
                  onJump={jumpFromPanel}
                  canReply={!!onReply}
                  replyingId={immReplyId}
                  replyText={replyText}
                  onReplyOpen={(id) => { setImmReplyId(id); setReplyText(""); setRowError(null); }}
                  onReplyChange={setReplyText}
                  onReplySend={sendReply}
                  onReplyCancel={() => setImmReplyId(null)}
                  rowError={rowError}
                  noteBody={noteBody}
                  onNoteChange={setNoteBody}
                  onNoteSend={submitNote}
                  decision={decision}
                  decided={decided}
                  canDecide={canDecide}
                  onDecide={decideFromPanel}
                  sendError={sendError}
                  pending={pending}
                />

                {/* Controles del dibujo (el lienzo es el DrawOverlay de siempre, sobre el frame pausado) */}
                {drawOpen ? (
                  <div className="absolute inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-40 flex justify-center gap-2">
                    <button type="button" onClick={() => { setDrawing(null); setDrawOpen(false); setSheetOpen(true); }} className="rounded-full bg-black/55 px-4 py-2 text-sm font-medium text-white hover:bg-black/70">Cancelar</button>
                    <button type="button" onClick={() => { setDrawOpen(false); setSheetOpen(true); }} className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Listo</button>
                  </div>
                ) : null}

                {toast ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-[calc(7rem+env(safe-area-inset-bottom))] z-50 flex justify-center">
                    <span className="rounded-full bg-black/80 px-3.5 py-1.5 text-xs font-medium text-white">{toast}</span>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          {!immersive ? (
            <>
          {version?.notes ? (
            version.number > 1 ? (
              // «Qué cambió en esta versión»: de v2 en adelante la nota es un DESTACADO — el
              // cliente sabe al instante qué se ajustó sin comparar los videos cuadro a cuadro.
              <div className="mt-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
                <span className="font-semibold text-primary">Qué cambió en la v{version.number}:</span>{" "}
                <span className="text-foreground/90">{version.notes}</span>
              </div>
            ) : (
              <p className="mt-2 rounded-md bg-card px-3 py-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">Notas v{version.number}:</span> {version.notes}</p>
            )
          ) : null}

          {/* Herramientas */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {immersiveCapable ? (
              <button onClick={() => setImmersive(true)} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent md:hidden" title="Ver el reel a pantalla completa y corregir con la burbuja">⛶ Pantalla completa</button>
            ) : null}
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
              ℹ️ Se reproduce el video original de Drive (evita el error «se está procesando» del visor de Google, permite comentar con captura del fotograma y usar la barra de velocidad). En masters pesados puede tardar en cargar. Si no se reproduce, usa «▶︎ Ver con Google» (su velocidad va en el engranaje ⚙). Lo más ágil: sube un archivo liviano de revisión en «+ Versión».
            </p>
          ) : null}
          {version?.kind === "youtube" || version?.kind === "vimeo" ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              ℹ️ Al comentar se guarda el segundo, pero esta fuente no permite capturar el fotograma automáticamente. Para anotar la imagen usa ✏️ Dibujar (pega o sube una captura). Para captura automática, sube el video o usa un enlace de archivo de Drive.
            </p>
          ) : null}
          {version && (version.kind === "drive_folder" || version.kind === "other") ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              ℹ️ Esta fuente no permite capturar el fotograma ni el segundo. Para que se capturen solos, sube el video al NAS en «+ Versión», o usa un enlace de ARCHIVO de Drive compartido como «Cualquiera con el enlace». Mientras tanto, puedes pegar/subir una captura con ✏️ Dibujar.
            </p>
          ) : null}
            </>
          ) : null}
        </div>

        {/* Contenidos alternos del visor (portada, copy…): mismos ocultos por CSS. */}
        {mediaTabs?.map((t) => (
          <div key={t.key} className={mediaTab === t.key ? undefined : "hidden"}>{t.content}</div>
        ))}

        {/* Conmutador del visor (solo si hay pestañas alternas): Reel · Portada · Copy. */}
        {mediaTabs && mediaTabs.length > 0 ? (
          <div className="mt-3 flex rounded-xl bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => setMediaTab("media")}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${mediaTab === "media" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {orientation === "vertical" ? "Reel" : "Video"}
            </button>
            {mediaTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => { setMediaTab(t.key); setDrawOpen(false); playerRef.current?.pause(); }}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${mediaTab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
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

      {/* ── Comentarios + notas ──
          vertical: columna DERECHA (lista de momentos, luego el cuadro para comentar, notas debajo).
          horizontal: el cuadro para comentar va JUSTO DEBAJO del player (a todo el ancho); luego la
          lista de momentos con su captura ALINEADA a la derecha de cada comentario; notas debajo.
          Solo cambia la DISPOSICIÓN: handlers, timecode en vivo y envío son EXACTAMENTE los mismos. */}
      {(() => {
        const momentsHeaderNode = (
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
        );
        const momentsListNode = (
          <div className={`mb-3 space-y-2 overflow-y-auto pr-1 ${vertical ? "max-h-[42vh]" : "max-h-[60vh]"}`}>
            {moments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {captureHint
                  ? `Pausa el video donde quieras y escribe un comentario: se guarda ${captureHint}.`
                  : "Escribe un comentario. Para anotar el fotograma, pega o sube una captura del momento con «✏️ Dibujar / anotar»."}
              </p>
            ) : (
              moments.map((c) => {
                // Respuestas del hilo de ESTA corrección (ya filtradas por el modo en `merged`).
                const replies = repliesByParent.get(c.id) ?? [];
                // La tarjeta del comentario es la MISMA en ambos layouts. En vertical la captura va
                // inline debajo del texto; en horizontal se saca a una columna a la derecha (abajo).
                const comment = (
                  <div className={`flex gap-2.5 rounded-lg border bg-card p-3 text-sm ${c.resolved ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/5" : "border-border"}`}>
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
                        {/* Estado y prioridad: los ven AMBOS lados. Antes «resuelto» solo existía en
                            el checklist del editor y el cliente no sabía si ya se había atendido. */}
                        <StatusChip comment={c} />
                        <PriorityChip
                          priority={c.priority ?? "OBLIGATORIA"}
                          onToggle={mode === "internal" && onSetPriority ? () => togglePriority(c) : undefined}
                          disabled={pending}
                        />
                        {c.editedAt ? <EditedMark /> : null}
                        <span className="ml-auto flex items-center gap-1.5">
                          {mode === "internal" && onReopen && c.resolved ? (
                            <button type="button" onClick={() => reopen(c.id)} disabled={pending} title="Volver a dejarla como pendiente" className="rounded px-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50">Reabrir</button>
                          ) : null}
                          {canMutate(c) ? <CommentActions onEdit={onEdit ? () => startEdit(c) : undefined} onDelete={onDelete ? () => removeComment(c.id) : undefined} disabled={pending} /> : null}
                        </span>
                      </div>
                      {editingId === c.id ? (
                        <EditBox value={editText} onChange={setEditText} onSave={() => saveEdit(c)} onCancel={() => setEditingId(null)} disabled={pending} />
                      ) : (
                        <p className={`mt-1 whitespace-pre-wrap break-words ${c.resolved ? "text-muted-foreground line-through" : "text-foreground/90"}`}>{c.body}</p>
                      )}
                      {vertical && c.drawing?.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.drawing.image} alt="Captura del momento" className="mt-2 w-full rounded-md border border-border" />
                      ) : null}
                      {rowError?.id === c.id ? <p className="mt-1 text-[11px] text-destructive">{rowError.message}</p> : null}
                      {/* ── Hilo ── respuestas anidadas (sangradas y más pequeñas) + «Responder». */}
                      {replies.length > 0 || onReply ? (
                        <div className="mt-2 space-y-2 border-l-2 border-border pl-2.5">
                          {replies.map((r) => (
                            <div key={r.id} className="text-[13px]">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-medium">{r.authorName}</span>
                                {!r.fromClient ? <span className="rounded bg-secondary px-1.5 text-[10px] text-secondary-foreground">equipo</span> : <span className="rounded bg-primary/10 px-1.5 text-[10px] text-primary">cliente</span>}
                                {/* Solo para el equipo: de un vistazo, qué respuestas ve el cliente
                                    y cuáles son discusión interna (al cliente nunca le llegan). */}
                                {mode === "internal" && !r.fromClient ? (
                                  r.visibleToClient
                                    ? <span className="rounded bg-primary/10 px-1.5 text-[10px] text-primary">visible para el cliente</span>
                                    : <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">interna</span>
                                ) : null}
                                {r.editedAt ? <EditedMark /> : null}
                                {canMutate(r) ? <span className="ml-auto"><CommentActions onEdit={onEdit ? () => startEdit(r) : undefined} onDelete={onDelete ? () => removeComment(r.id) : undefined} disabled={pending} /></span> : null}
                              </div>
                              {editingId === r.id ? (
                                <EditBox value={editText} onChange={setEditText} onSave={() => saveEdit(r)} onCancel={() => setEditingId(null)} disabled={pending} />
                              ) : (
                                <p className="whitespace-pre-wrap break-words text-foreground/80">{r.body}</p>
                              )}
                            </div>
                          ))}
                          {onReply ? (
                            replyingId === c.id ? (
                              <div className="space-y-1.5">
                                <textarea
                                  value={replyText}
                                  onChange={(e) => setReplyText(e.target.value)}
                                  rows={2}
                                  autoFocus
                                  placeholder="Escribe tu respuesta…"
                                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] outline-none focus:ring-2 focus:ring-ring"
                                  onKeyDown={(e) => { if (e.key === "Escape") setReplyingId(null); }}
                                />
                                {mode === "internal" ? (
                                  <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                    <input type="checkbox" checked={replyToClient} onChange={(e) => setReplyToClient(e.target.checked)} className="size-3.5 rounded border-input accent-primary" />
                                    Visible para el cliente (si no, queda interna del equipo)
                                  </label>
                                ) : null}
                                <div className="flex items-center gap-2">
                                  <button type="button" onClick={() => sendReply(c)} disabled={pending || !replyText.trim()} className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                                    {pending ? "Enviando…" : "Responder"}
                                  </button>
                                  <button type="button" onClick={() => setReplyingId(null)} disabled={pending} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50">Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <button type="button" onClick={() => { setReplyingId(c.id); setReplyText(""); setReplyToClient(false); setRowError(null); }} className="text-[11px] font-medium text-muted-foreground hover:text-foreground">
                                Responder
                              </button>
                            )
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
                // Vertical: comportamiento de siempre (Fragment sin envoltura extra → mismo DOM).
                if (vertical) return <React.Fragment key={c.id}>{comment}</React.Fragment>;
                // Horizontal: comentario a la izquierda + su captura alineada a la derecha (clic → va al segundo).
                return (
                  <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_9rem] items-start gap-2.5">
                    {comment}
                    {c.drawing?.image ? (
                      c.timecode != null ? (
                        <button type="button" onClick={() => seek(c.timecode!)} title="Ir a este momento" className="relative block overflow-hidden rounded-lg border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.drawing.image} alt="Captura del momento" className="w-full" />
                          <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[10px] text-white">▶ {fmtTime(c.timecode)}</span>
                        </button>
                      ) : (
                        <div className="relative overflow-hidden rounded-lg border border-border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.drawing.image} alt="Captura del momento" className="w-full" />
                        </div>
                      )
                    ) : (
                      <div className="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-2 py-4 text-center text-[11px] text-muted-foreground">Sin captura</div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        );
        const commentInputNode = (
          <div className="space-y-2 rounded-xl border border-border bg-card p-3">
            {!fixedName ? (
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
            ) : null}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} onFocus={onCommentFocus} rows={3} placeholder={captureHint ? `Escribe sobre el video… al comentar se guarda ${captureHint}` : "Escribe tu comentario…"} className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <div className="flex items-center justify-between gap-2">
              {/* El segundo se muestra EN VIVO (LiveTimecode): es EXACTAMENTE el que se guarda al
                  enviar (getTime() del instante). Al enfocar el cuadro el video se pausa; si sigues
                  reproduciendo, el número sigue al video → nunca se guarda un segundo viejo. */}
              {captureHint ? <LiveTimecode playerRef={playerRef} frame={caps.frame} /> : <span />}
              <button onClick={submitMoment} disabled={pending || (!body.trim() && !drawing)} className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {pending ? "Enviando…" : "Comentar"}
              </button>
            </div>
            {sendError ? <p className="text-xs text-destructive">{sendError}</p> : null}
          </div>
        );
        const notesNode = (
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
                      {c.editedAt ? <EditedMark /> : null}
                      {canMutate(c) ? <span className="ml-auto"><CommentActions onEdit={onEdit ? () => startEdit(c) : undefined} onDelete={onDelete ? () => removeComment(c.id) : undefined} disabled={pending} /></span> : null}
                    </div>
                    {editingId === c.id ? (
                      <EditBox value={editText} onChange={setEditText} onSave={() => saveEdit(c)} onCancel={() => setEditingId(null)} disabled={pending} />
                    ) : (
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-foreground/90">{c.body}</p>
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
        );
        // Vertical: se conserva EXACTAMENTE el orden anterior (lista → comentar → notas).
        if (vertical) {
          return (
            <div className="min-w-0 flex-1 space-y-6">
              <div className="flex min-h-0 flex-col">
                {momentsHeaderNode}
                {momentsListNode}
                {commentInputNode}
              </div>
              {notesNode}
            </div>
          );
        }
        // Horizontal: cuadro para comentar debajo del player (ancho completo) → lista con capturas
        // a la derecha de cada comentario → notas debajo.
        return (
          <div className="space-y-5">
            {commentInputNode}
            <div>
              {momentsHeaderNode}
              {momentsListNode}
            </div>
            {notesNode}
          </div>
        );
      })()}
    </div>
  );
}

// Chip de ESTADO de una corrección. Lo ven los DOS lados (equipo y cliente): antes «resuelto»
// solo existía en el checklist del editor y el cliente no tenía forma de saber si lo que pidió
// ya estaba atendido. Con resolvedAt se dice cuándo y, si el servidor lo trae, quién.
function StatusChip({ comment }: { comment: StageComment }) {
  if (!comment.resolved) {
    return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">Pendiente</span>;
  }
  // Fecha en hora de Bogotá (TZ explícita): mismo texto en servidor y cliente, sin desfase.
  const when = comment.resolvedAt ? formatBogota(comment.resolvedAt, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null;
  const detail = [comment.resolvedByName, when].filter(Boolean).join(" · ");
  return (
    <span title={detail ? `Hecho · ${detail}` : "Hecho"} className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
      ✓ Hecho{detail ? <span className="font-normal"> · {detail}</span> : null}
    </span>
  );
}

// Chip de PRIORIDAD: qué es bloqueante (Obligatoria) y qué es opcional (Sugerencia). En modo
// interno se alterna con un clic; en el portal del cliente es solo lectura (sin onToggle).
function PriorityChip({ priority, onToggle, disabled }: { priority: StagePriority; onToggle?: () => void; disabled?: boolean }) {
  const s = priority === "SUGERENCIA"
    ? { label: "Sugerencia", cls: "bg-muted text-muted-foreground" }
    : { label: "Obligatoria", cls: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" };
  if (!onToggle) return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${s.cls}`}>{s.label}</span>;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={priority === "OBLIGATORIA" ? "Cambiar a sugerencia (opcional)" : "Cambiar a obligatoria (bloqueante)"}
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-75 disabled:opacity-50 ${s.cls}`}
    >
      {s.label}
    </button>
  );
}

// Marca discreta de que el texto se corrigió DESPUÉS de sellarse (el equipo sabe que lo que lee
// no es literalmente lo que se envió).
function EditedMark() {
  return <span title="El texto se editó después de enviarse" className="text-[10px] italic text-muted-foreground">editado</span>;
}

// Botones compactos de editar/retirar un comentario del equipo (modo interno).
function CommentActions({ onEdit, onDelete, disabled }: { onEdit?: () => void; onDelete?: () => void; disabled?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {onEdit ? (
        <button type="button" onClick={onEdit} disabled={disabled} title="Editar" className="rounded px-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50">Editar</button>
      ) : null}
      {onDelete ? (
        <button type="button" onClick={onDelete} disabled={disabled} title="Retirar" className="rounded px-1 text-[11px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">Retirar</button>
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

// ── HUD del modo inmersivo ── toque de pausa + chrome AUTO-OCULTABLE (barra superior, burbuja
// «Comentar», progreso con arrastre y puntos). Vive APARTE del escenario y actualiza el progreso
// ESCRIBIENDO DIRECTO al DOM con requestAnimationFrame (transform: scaleX + textContent): 60fps
// sin un solo re-render de React por frame. El estado de React solo cambia con PAUSA, DURACIÓN o
// mostrar/ocultar el chrome. React.memo + props memoizadas en el padre → escribir en la hoja
// tampoco lo re-renderiza.
//
// Con FUENTES IFRAME (YouTube/Vimeo/Drive) el iframe ya trae SUS controles: aquí NO se pinta
// barra propia ni se roba el toque (dos barras a la vez era el bug de «se ven dos controles») —
// queda solo el chrome mínimo: salir, velocidad (si la fuente la soporta) y la burbuja «Comentar».
type HudMoment = { id: string; timecode: number; authorName: string; body: string; fromClient: boolean };
const HUD_HIDE_MS = 2600; // reproduciendo, el chrome se desvanece tras este tiempo sin tocar
const ImmersiveHud = React.memo(function ImmersiveHud({ playerRef, canTap, rateCapable, sheetOpen, drawOpen, onCloseSheet, onOpenSheet, onExit, versionLabel, moments, panelOpen, momentsCount, onOpenPanel }: {
  playerRef: React.MutableRefObject<PlayerApi | null>;
  // <video> del mismo origen: el toque pausa/reanuda y hay barra propia. Iframes (YouTube/
  // Vimeo/Drive) usan sus propios controles y NO se les roba el toque ni se duplica la barra.
  canTap: boolean;
  // La fuente permite fijar la velocidad (video propio, YouTube, Vimeo) → pastilla 1×/1.5×/2×.
  rateCapable: boolean;
  sheetOpen: boolean;
  drawOpen: boolean;
  onCloseSheet: () => void;
  onOpenSheet: () => void;
  onExit: () => void;
  versionLabel: string;
  moments: HudMoment[];
  // La hoja de LECTURA está abierta: tapa el video igual que el lienzo de dibujo → el chrome
  // estorba y el toque de pausa no debe robarle el gesto a la hoja.
  panelOpen: boolean;
  momentsCount: number;
  onOpenPanel: () => void;
}) {
  const [durT, setDurT] = React.useState(0);
  const [paused, setPaused] = React.useState(true);
  const [dotPop, setDotPop] = React.useState<{ pct: number; author: string; body: string } | null>(null);
  // Chrome (barra superior + burbuja + progreso) visible. En pausa siempre se ve; reproduciendo
  // se desvanece solo y un toque lo trae de vuelta.
  const [chrome, setChrome] = React.useState(true);
  const fillRef = React.useRef<HTMLDivElement>(null);
  const miniRef = React.useRef<HTMLDivElement>(null);
  const tcRef = React.useRef<HTMLSpanElement>(null);
  const barRef = React.useRef<HTMLDivElement>(null);
  const durRef = React.useRef(0);
  const pausedRef = React.useRef(true);
  const popTimer = React.useRef<number | null>(null);
  const chromeTimer = React.useRef<number | null>(null);
  const scrubbing = React.useRef(false);

  // Muestra el chrome y programa su desvanecimiento (solo si el video sigue reproduciendo).
  const poke = React.useCallback(() => {
    setChrome(true);
    if (chromeTimer.current != null) window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => {
      if (!pausedRef.current && !scrubbing.current) setChrome(false);
    }, HUD_HIDE_MS);
  }, []);

  React.useEffect(() => {
    let raf = 0;
    let lastTc = "";
    const sync = () => {
      const api = playerRef.current;
      const t = api?.getTime() ?? 0;
      const d = api?.getDuration() ?? 0;
      // Barra (y el hilo minimalista cuando el chrome está oculto) directo al DOM: fluido y barato.
      const sx = `scaleX(${d > 0 ? Math.min(1, t / d) : 0})`;
      if (fillRef.current) fillRef.current.style.transform = sx;
      if (miniRef.current) miniRef.current.style.transform = sx;
      const txt = fmtTime(t);
      if (tcRef.current && txt !== lastTc) { lastTc = txt; tcRef.current.textContent = txt; }
      // Estado de React SOLO cuando cambia de verdad (aparece la duración / play↔pausa).
      if (d > 0 && Math.abs(d - durRef.current) > 0.5) { durRef.current = d; setDurT(d); }
      const p = api?.isPaused() ?? true;
      if (p !== pausedRef.current) {
        pausedRef.current = p;
        setPaused(p);
        // En pausa el chrome se queda fijo; al reanudar arranca el temporizador de ocultado.
        if (p) { if (chromeTimer.current != null) window.clearTimeout(chromeTimer.current); setChrome(true); }
        else poke();
      }
    };
    const loop = () => { sync(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    // Respaldo de baja frecuencia: rAF se SUSPENDE con la pestaña oculta (y en algunos
    // webviews no dispara); este intervalo mantiene la barra y el estado al día igual.
    const fallback = window.setInterval(sync, 500);
    return () => { cancelAnimationFrame(raf); window.clearInterval(fallback); };
  }, [playerRef, poke]);

  // La hoja o el lienzo tapan el HUD: se cierra la burbujita del punto si estaba abierta.
  React.useEffect(() => { if (sheetOpen || drawOpen || panelOpen) setDotPop(null); }, [sheetOpen, drawOpen, panelOpen]);
  React.useEffect(() => () => {
    if (popTimer.current != null) window.clearTimeout(popTimer.current);
    if (chromeTimer.current != null) window.clearTimeout(chromeTimer.current);
  }, []);

  const showDotPop = (pct: number, author: string, bodyText: string) => {
    setDotPop({ pct, author, body: bodyText });
    if (popTimer.current != null) window.clearTimeout(popTimer.current);
    popTimer.current = window.setTimeout(() => setDotPop(null), 4000);
  };

  // Arrastre de la barra: salta EN VIVO mientras se desliza el dedo (sin forzar play/pausa).
  const seekAt = (clientX: number) => {
    const el = barRef.current;
    if (!el || durRef.current <= 0) return;
    const r = el.getBoundingClientRect();
    playerRef.current?.seek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * durRef.current, false);
  };

  // El lienzo de dibujo y la hoja de lectura TAPAN el video: en ambos casos el chrome estorba
  // (se vería atenuado bajo el velo) y no debe quedarse con los toques de la hoja.
  const covered = drawOpen || panelOpen;
  // Iframe (sin toque propio): chrome mínimo SIEMPRE visible — no podríamos re-invocarlo con un
  // toque porque los toques se los queda el iframe.
  const show = !canTap || chrome || paused;

  return (
    <>
      {/* Toque en el video = pausa/reanuda + trae el chrome; también cierra la hoja o la burbujita. */}
      {canTap && !covered ? (
        <button
          type="button"
          aria-label={paused ? "Reproducir" : "Pausar"}
          onClick={() => {
            if (sheetOpen) { onCloseSheet(); return; }
            if (dotPop) { setDotPop(null); return; }
            const api = playerRef.current;
            if (api?.isPaused()) api.play(); else api?.pause();
            poke();
          }}
          // iOS: sin selección de texto ni menú de long-press ("Guardar vídeo") al mantener pulsado el video.
          style={{ WebkitTouchCallout: "none", userSelect: "none" }}
          className="absolute inset-0 z-10 cursor-default select-none"
        />
      ) : null}
      {canTap && paused && !sheetOpen && !covered ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-2xl text-white">▶</div>
      ) : null}

      {/* Barra superior: salir + versión + velocidad. Se desvanece reproduciendo. */}
      {!covered ? (
        <div className={`absolute inset-x-0 top-0 z-30 flex items-center gap-2.5 bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))] transition-opacity duration-300 ${show ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <button type="button" onClick={onExit} aria-label="Salir de pantalla completa" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-black/45 text-sm text-white hover:bg-black/65">✕</button>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-white">Revisión · {versionLabel}</p>
            <p className="truncate text-[11px] text-white/60">{canTap ? "«Comentar» guarda el segundo y la captura" : "Toca «Comentar» para corregir"}</p>
          </div>
          {rateCapable ? <RatePill playerRef={playerRef} onPoke={poke} /> : null}
        </div>
      ) : null}

      {/* Burbuja «Comentar»: pausa, congela el segundo y abre la hoja de corrección. */}
      {!sheetOpen && !covered ? (
        <button
          type="button"
          onClick={onOpenSheet}
          aria-label="Agregar corrección"
          className={`absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-12 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg transition-opacity duration-300 hover:bg-primary/90 ${show ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          💬 Comentar
        </button>
      ) : null}

      {/* Píldora «Correcciones»: abre la hoja de LECTURA (lista con hilos, notas, versión y
          decisión). Desde el celular es el único camino a todo eso, porque el overlay tapa la
          columna de la vista normal. Va APILADA sobre «Comentar» (misma esquina, 9rem): a la
          izquierda chocaría con la burbujita de un punto tocado (dotPop, hasta ~14.75rem). */}
      {!sheetOpen && !covered ? (
        <button
          type="button"
          onClick={onOpenPanel}
          aria-label={`Ver correcciones (${momentsCount}), notas y decidir`}
          className={`absolute bottom-[calc(9rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-11 items-center gap-1.5 rounded-full bg-black/55 px-4 text-sm font-medium text-white shadow-lg transition-opacity duration-300 hover:bg-black/70 ${show ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          📋 Correcciones
          {momentsCount > 0 ? (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">{momentsCount}</span>
          ) : null}
        </button>
      ) : null}

      {/* Progreso + puntos de corrección (solo video propio: el iframe ya trae su barra). */}
      {canTap && durT > 0 && !covered ? (
        <div className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/60 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8 transition-opacity duration-300 ${show ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium">
            <span ref={tcRef} className="font-mono text-white/85">0:00</span>
            <span className="font-mono text-white/50">{fmtTime(durT)}</span>
          </div>
          {/* Zona táctil generosa (h-8) con ARRASTRE: pointer capture + seek en vivo. */}
          <div
            ref={barRef}
            className="relative -my-2 h-8 cursor-pointer touch-none"
            onPointerDown={(e) => {
              scrubbing.current = true;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              seekAt(e.clientX);
              poke();
            }}
            onPointerMove={(e) => { if (scrubbing.current) seekAt(e.clientX); }}
            onPointerUp={() => { scrubbing.current = false; poke(); }}
            onPointerCancel={() => { scrubbing.current = false; }}
          >
            <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-white/25">
              <div ref={fillRef} className="h-full w-full origin-left rounded-full bg-primary" style={{ transform: "scaleX(0)" }} />
            </div>
            {moments.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={`Corrección en ${fmtTime(c.timecode)}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  playerRef.current?.seek(c.timecode, false);
                  playerRef.current?.pause();
                  showDotPop((c.timecode / durT) * 100, c.authorName, c.body);
                }}
                className="absolute top-1/2 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                style={{ left: `${Math.min(99, (c.timecode / durT) * 100)}%` }}
              >
                <span className={`block size-2.5 rounded-full ring-2 ring-black/40 ${c.fromClient ? "bg-primary" : "bg-white"}`} />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Hilo de progreso cuando el chrome está oculto: sensación de avance sin estorbar. */}
      {canTap && durT > 0 && !show ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[3px] overflow-hidden bg-white/15">
          <div ref={miniRef} className="h-full w-full origin-left bg-primary" style={{ transform: "scaleX(0)" }} />
        </div>
      ) : null}

      {/* Burbujita de un punto tocado (comentario existente) */}
      {dotPop ? (
        <div
          className="absolute bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 w-56 max-w-[80vw] rounded-xl border border-white/15 bg-zinc-900 px-3 py-2"
          style={{ left: `clamp(0.75rem, calc(${dotPop.pct}% - 7rem), calc(100% - 14.75rem))` }}
        >
          <p className="text-[11px] font-medium text-primary">{dotPop.author}</p>
          <p className="mt-0.5 line-clamp-3 text-xs text-white/90">{dotPop.body}</p>
        </div>
      ) : null}
    </>
  );
});

// Pastilla de velocidad del modo inmersivo: un toque pasa a la siguiente (0.5×→1×→1.25×→1.5×→2×).
// Persiste la elección en localStorage (la misma clave que la barra de velocidad normal, así
// ambas vistas quedan sincronizadas al re-montarse).
function RatePill({ playerRef, onPoke }: { playerRef: React.MutableRefObject<PlayerApi | null>; onPoke: () => void }) {
  const [rate, setRate] = React.useState(1);
  // La velocidad guardada se lee tras montar (en SSR no hay localStorage y leerla en el primer
  // render daría desajuste de hidratación). Diferida a una macrotarea para no hacer setState
  // síncrono dentro del efecto.
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const saved = Number(localStorage.getItem(RATE_KEY));
        if ((PLAYBACK_RATES as readonly number[]).includes(saved)) setRate(saved);
      } catch { /* noop */ }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);
  const cycle = () => {
    const i = (PLAYBACK_RATES as readonly number[]).indexOf(rate);
    const next = PLAYBACK_RATES[(i + 1) % PLAYBACK_RATES.length] ?? 1;
    setRate(next);
    try { localStorage.setItem(RATE_KEY, String(next)); } catch { /* noop */ }
    playerRef.current?.setRate(next);
    onPoke();
  };
  return (
    <button type="button" onClick={cycle} aria-label={`Velocidad ${rate}×`} className="ml-auto shrink-0 rounded-full bg-black/45 px-3 py-1.5 font-mono text-xs font-medium text-white hover:bg-black/65">
      {rate}×
    </button>
  );
}

// ── Hoja de LECTURA del modo inmersivo ── todo lo que en la vista normal vive a la derecha del
// player, en una hoja deslizable: versión, correcciones (captura, chips, hilos y respuesta), notas
// generales y la decisión. La monta SOLO la rama inmersiva (portal del cliente, reel vertical en
// celular): allí el overlay tapa la columna de comentarios, así que sin esto el cliente no podía
// leer lo que ya se pidió, ni responder, ni aprobar sin salirse a la vista normal.
//
// NO va memoizada a propósito: sus listas derivan de `merged` y cambian con cada corrección. El que
// NO debe re-renderizarse mientras el video corre es ImmersiveHud (React.memo + props estables);
// esta hoja solo se re-renderiza cuando el cliente escribe o toca algo — y para entonces el video
// ya está en pausa (openPanel lo pausa), así que no hay frames que perder.
//
// Los chips llegan en SOLO LECTURA (PriorityChip sin onToggle, StatusChip solo recibe el
// comentario): en el portal el cliente no cambia prioridades ni reabre correcciones.
function ImmersiveSheet({
  open, onClose, versions, vIdx, onPickVersion, moments, notes, repliesByParent, onJump,
  canReply, replyingId, replyText, onReplyOpen, onReplyChange, onReplySend, onReplyCancel,
  rowError, noteBody, onNoteChange, onNoteSend, decision, decided, canDecide, onDecide,
  sendError, pending,
}: {
  open: boolean;
  onClose: () => void;
  versions: StageVersion[];
  vIdx: number;
  onPickVersion: (i: number) => void;
  moments: StageComment[];
  notes: StageComment[];
  repliesByParent: Map<string, StageComment[]>;
  onJump: (t: number) => void;
  canReply: boolean;
  replyingId: string | null;
  replyText: string;
  onReplyOpen: (id: string) => void;
  onReplyChange: (v: string) => void;
  onReplySend: (parent: StageComment) => void;
  onReplyCancel: () => void;
  rowError: { id: string; message: string } | null;
  noteBody: string;
  onNoteChange: (v: string) => void;
  onNoteSend: () => void;
  decision: { approveLabel: string; changesLabel: string } | null;
  decided: boolean;
  canDecide: boolean;
  onDecide: (result: "APROBADO" | "CAMBIOS") => void;
  sendError: string | null;
  pending: boolean;
}) {
  const [tab, setTab] = React.useState<"correcciones" | "notas">("correcciones");
  const ref = React.useRef<HTMLDivElement>(null);

  // Mismo trato que la hoja de corrección: iOS no redimensiona los `fixed` al abrir el teclado, así
  // que la hoja se pega al borde superior del teclado con visualViewport. Sin esto, responder un
  // hilo o escribir una nota se haría a ciegas. Vive aquí (y no en el escenario) porque es
  // exclusivo de esta hoja: solo escribe estilos, nunca estado.
  React.useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return;
    const onResize = () => { el.style.bottom = `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`; };
    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => { vv.removeEventListener("resize", onResize); vv.removeEventListener("scroll", onResize); el.style.bottom = "0px"; };
  }, [open]);

  return (
    <>
      {/* Velo: tocar fuera cierra. Sólido (bg-black/60) y SIN backdrop-blur: desenfocar un video
          es caro en la GPU del celular y producía tirones. z-[35] queda sobre el chrome del HUD
          (z-30) y bajo la hoja (z-40). */}
      <div
        onClick={onClose}
        aria-hidden
        className={`absolute inset-0 z-[35] bg-black/60 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        ref={ref}
        role="dialog"
        aria-label="Correcciones, notas y decisión"
        className={`absolute inset-x-0 bottom-0 z-40 flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-white/10 bg-zinc-900 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 transition-transform duration-200 ${open ? "translate-y-0" : "pointer-events-none translate-y-[110%]"}`}
      >
        {/* El handle ES el botón de cerrar: gesto esperado en celular y área de toque generosa. */}
        <button type="button" onClick={onClose} aria-label="Cerrar" className="mx-auto mb-1 flex h-6 w-16 shrink-0 items-center justify-center">
          <span className="block h-1 w-9 rounded-full bg-white/25" />
        </button>

        {/* Versión: mismas pastillas que la vista normal, dentro del overlay. NO cierra la hoja —
            al cambiar de versión el cliente quiere ver aquí mismo las correcciones de la nueva. */}
        {versions.length > 1 ? (
          <div className="mb-2 flex shrink-0 flex-wrap items-center gap-1.5 px-4">
            <span className="text-[11px] text-white/50">Versión</span>
            {versions.map((v, i) => (
              <button
                key={v.number}
                type="button"
                onClick={() => onPickVersion(i)}
                aria-pressed={i === vIdx}
                className={`min-w-11 rounded-full px-3 py-1.5 text-xs font-medium ${i === vIdx ? "bg-primary text-primary-foreground" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
              >
                v{v.number}
              </button>
            ))}
          </div>
        ) : null}

        {/* Pestañas: correcciones (con segundo/captura) vs. notas generales — mismo corte que la
            vista normal (`moments` vs `notes`). */}
        <div className="mx-4 mb-2 flex shrink-0 rounded-xl bg-white/[0.06] p-1">
          {([["correcciones", `Correcciones (${moments.length})`], ["notas", `Notas (${notes.length})`]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
              className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${tab === k ? "bg-primary text-primary-foreground" : "text-white/60"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* overscroll-contain: el rebote de la lista no se propaga al overlay.
            La lista solo se pinta ABIERTA: cerrada no cuesta nada, y detrás sigue montada la de la
            vista normal, que ya re-renderiza con cada tecla — no hay que pagarla dos veces. */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 pb-2">
          {!open ? null : tab === "correcciones" ? (
            moments.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-white/50">Aún no hay correcciones en esta versión. Toca «💬 Comentar» sobre el reel para dejar la primera.</p>
            ) : (
              moments.map((c) => {
                const replies = repliesByParent.get(c.id) ?? [];
                return (
                  <div key={c.id} className={`rounded-xl border p-3 ${c.resolved ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.04]"}`}>
                    <div className="flex gap-2.5">
                      {/* Miniatura de la captura: tocarla salta al momento. Tamaño fijo pequeño con
                          object-cover y lazy — cada imagen es un data-URI de hasta ~480 KB y
                          pintarlas grandes castigaría la memoria del celular. */}
                      {c.drawing?.image ? (
                        <button
                          type="button"
                          onClick={() => { if (c.timecode != null) onJump(c.timecode); }}
                          disabled={c.timecode == null}
                          aria-label={c.timecode != null ? `Ir a ${fmtTime(c.timecode)}` : "Captura del momento"}
                          className="size-16 shrink-0 overflow-hidden rounded-lg border border-white/10"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.drawing.image} alt="Captura del momento" loading="lazy" className="h-full w-full object-cover" />
                        </button>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[13px] font-medium text-white">{c.authorName}</span>
                          {c.fromClient
                            ? <span className="rounded bg-primary/20 px-1.5 text-[10px] text-primary">cliente</span>
                            : <span className="rounded bg-white/10 px-1.5 text-[10px] text-white/70">equipo</span>}
                          {c.timecode != null ? (
                            <button type="button" onClick={() => onJump(c.timecode!)} className="rounded-md bg-primary/15 px-2 py-1 font-mono text-[11px] font-medium text-primary">▶ {fmtTime(c.timecode)}</button>
                          ) : null}
                        </div>
                        {/* Estado y prioridad en SOLO LECTURA (PriorityChip sin onToggle). */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <StatusChip comment={c} />
                          <PriorityChip priority={c.priority ?? "OBLIGATORIA"} />
                          {c.editedAt ? <EditedMark /> : null}
                        </div>
                        <p className={`mt-1.5 whitespace-pre-wrap break-words text-[13px] ${c.resolved ? "text-white/45 line-through" : "text-white/90"}`}>{c.body}</p>
                        {rowError?.id === c.id ? <p className="mt-1 text-[11px] text-red-300">{rowError.message}</p> : null}

                        {/* ── Hilo ── respuestas anidadas + responder (mismo sendReply de siempre). */}
                        {replies.length > 0 || canReply ? (
                          <div className="mt-2 space-y-2 border-l-2 border-white/15 pl-2.5">
                            {replies.map((r) => (
                              <div key={r.id}>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[11px] font-medium text-white/85">{r.authorName}</span>
                                  {r.fromClient
                                    ? <span className="rounded bg-primary/20 px-1.5 text-[10px] text-primary">cliente</span>
                                    : <span className="rounded bg-white/15 px-1.5 text-[10px] text-white/70">equipo</span>}
                                  {r.editedAt ? <EditedMark /> : null}
                                </div>
                                <p className="whitespace-pre-wrap break-words text-[12px] text-white/75">{r.body}</p>
                              </div>
                            ))}
                            {canReply ? (
                              replyingId === c.id ? (
                                <div className="space-y-1.5">
                                  <textarea
                                    value={replyText}
                                    onChange={(e) => onReplyChange(e.target.value)}
                                    rows={2}
                                    autoFocus
                                    placeholder="Escribe tu respuesta…"
                                    className="w-full rounded-lg border border-white/15 bg-white/10 px-2.5 py-2 text-[13px] text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-primary"
                                  />
                                  <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => onReplySend(c)} disabled={pending || !replyText.trim()} className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50">
                                      {pending ? "Enviando…" : "Responder"}
                                    </button>
                                    <button type="button" onClick={onReplyCancel} disabled={pending} className="rounded-full px-3 py-2 text-xs font-medium text-white/60">Cancelar</button>
                                  </div>
                                </div>
                              ) : (
                                <button type="button" onClick={() => onReplyOpen(c.id)} className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/75 hover:bg-white/20">Responder</button>
                              )
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : notes.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-white/50">Aún no hay notas. Escribe abajo una impresión general del reel (sin segundo ni captura).</p>
          ) : (
            notes.map((c) => (
              <div key={c.id} className="rounded-xl border border-dashed border-white/15 bg-white/[0.04] p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-medium text-white">{c.authorName}</span>
                  {c.fromClient
                    ? <span className="rounded bg-primary/20 px-1.5 text-[10px] text-primary">cliente</span>
                    : <span className="rounded bg-white/15 px-1.5 text-[10px] text-white/70">equipo</span>}
                  {c.editedAt ? <EditedMark /> : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-white/90">{c.body}</p>
              </div>
            ))
          )}
        </div>

        {/* Añadir una nota general (sin segundo ni captura): reutiliza noteBody/submitNote, que ya
            manda isNote=true. El nombre no se pide: en el portal viene fijo (fixedName). */}
        {open && tab === "notas" ? (
          <div className="shrink-0 border-t border-white/10 px-4 pt-2.5">
            {sendError ? <p className="mb-1.5 text-[11px] text-red-300">{sendError}</p> : null}
            <div className="flex items-center gap-2">
              <input
                value={noteBody}
                onChange={(e) => onNoteChange(e.target.value)}
                placeholder="Nota general…"
                className="min-w-0 flex-1 rounded-full border border-white/15 bg-white/10 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-primary"
              />
              <button type="button" onClick={onNoteSend} disabled={pending || !noteBody.trim()} className="h-11 shrink-0 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {pending ? "…" : "Añadir"}
              </button>
            </div>
          </div>
        ) : null}

        {/* Decisión: MISMA lógica que la vista normal (decided → aviso; canDecide → botones; y
            `decision === null`, el usuario invitado, no pinta nada aquí tampoco). */}
        {decision ? (
          <div className="mt-2 shrink-0 border-t border-white/10 px-4 pt-3">
            {decided ? (
              <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-center text-[13px] font-medium text-emerald-300">✅ Entregable aprobado.</p>
            ) : canDecide ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => onDecide("APROBADO")} disabled={pending} className="flex-1 rounded-full bg-emerald-600 px-3 py-3 text-sm font-semibold text-white disabled:opacity-50">{decision.approveLabel}</button>
                <button type="button" onClick={() => onDecide("CAMBIOS")} disabled={pending} className="flex-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-3 text-sm font-medium text-amber-300 disabled:opacity-50">{decision.changesLabel}</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

// ── Visor de medios con API de reproductor + captura de fotograma ──
function MediaViewer({ version, apiRef, drawOpen, onDrawn, caption, vertical = false, onCapabilities, immersive = false }: {
  version: StageVersion | undefined;
  apiRef: React.MutableRefObject<PlayerApi | null>;
  drawOpen: boolean;
  onDrawn: (dataUrl: string | null) => void;
  caption: string;
  // Reporta al padre si AHORA se puede capturar el fotograma (frame) y/o leer el segundo (time),
  // según el modo real (proxy same-origin vs iframe cross-origin).
  onCapabilities?: (c: { frame: boolean; time: boolean }) => void;
  // Orientación del entregable (REEL/SHORT = vertical). El <video> respeta el aspecto real del
  // archivo, pero el IFRAME (visor de Google/YouTube) no tiene aspecto intrínseco: sin esto,
  // un video vertical (9:16) se encajaba en un marco 16:9 y se veía diminuto/mal.
  vertical?: boolean;
  // Modo inmersivo (pantalla completa del portal): el material llena el contenedor (sin marco
  // ni controles nativos en el <video>; la barra y el toque los pone el overlay del padre).
  immersive?: boolean;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const ytRef = React.useRef<HTMLIFrameElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytPlayer = React.useRef<any>(null);
  // Vimeo: su Player API (postMessage) sí permite leer el segundo del iframe. getCurrentTime es
  // asíncrono, así que espejamos el tiempo con el evento timeupdate y getTime lo lee al instante.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vimeoPlayer = React.useRef<any>(null);
  const vimeoTime = React.useRef<number | null>(null);
  // Duración y estado de pausa espejados desde los eventos (getDuration/getPaused son asíncronos).
  const vimeoDur = React.useRef<number | null>(null);
  const vimeoPaused = React.useRef(true);
  // Para Drive ofrecemos DOS modos: «modo captura» (video proxiado del mismo origen, que
  // SÍ permite capturar el fotograma) y ver con el reproductor de Google (iframe, rápido,
  // ideal solo para ver masters pesados). Por DEFECTO arranca en modo captura, porque la
  // captura del frame al comentar es la función central; el revisor puede pasar a Google
  // si solo quiere ver y el master pesado tarda en cargar.
  const isDriveProxyable = version?.kind === "drive_file" && !!version.proxySrc;
  const [driveProxyFailed, setDriveProxyFailed] = React.useState(false);
  // Reintentos del video proxiado antes de rendirse al iframe: un error transitorio de arranque del
  // stream no debe bajar al visor de Google (donde no se captura el fotograma ni el segundo).
  const proxyRetries = React.useRef(0);
  // Timer del reintento: se cancela al cambiar de versión/modo para no restaurar un src viejo.
  const retryTimer = React.useRef<number | null>(null);
  // Drive arranca reproduciendo el VIDEO ORIGINAL (proxy del mismo origen): así se evita el
  // error «este video se está procesando» del visor de Google (que aparece cuando Google aún
  // no ha transcodificado el master), y de paso permite capturar el fotograma y la barra de
  // velocidad de la app. Si el original no se puede reproducir (formato no compatible, privado
  // o pesado), `onError` cae automáticamente al visor de Google. «▶︎ Ver con Google» alterna.
  const [captureMode, setCaptureMode] = React.useState(isDriveProxyable);
  React.useEffect(() => {
    setDriveProxyFailed(false);
    proxyRetries.current = 0;
    if (retryTimer.current != null) { window.clearTimeout(retryTimer.current); retryTimer.current = null; }
    setCaptureMode(version?.kind === "drive_file" && !!version.proxySrc);
  }, [version]);

  // ── Velocidad de reproducción (0.5×–2×) ── se recuerda entre sesiones y se re-aplica al
  // (re)cargar el video o al cambiar de versión.
  const [rate, setRate] = React.useState(1);
  // Espejo en ref para que callbacks de larga vida (onReady de YouTube, que puede dispararse
  // al recrearse el iframe) lean SIEMPRE la velocidad actual, no la capturada en el cierre.
  const rateRef = React.useRef(rate);
  React.useEffect(() => { rateRef.current = rate; }, [rate]);
  React.useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(RATE_KEY));
      if ((PLAYBACK_RATES as readonly number[]).includes(saved)) setRate(saved);
    } catch { /* noop */ }
  }, []);
  const applyRate = (r: number) => {
    setRate(r);
    try { localStorage.setItem(RATE_KEY, String(r)); } catch { /* noop */ }
    apiRef.current?.setRate(r);
  };

  const usingProxy = isDriveProxyable && captureMode && !driveProxyFailed;
  // Elemento del mismo origen del que SÍ se puede leer el fotograma.
  const captureEl = (): HTMLVideoElement | HTMLImageElement | null =>
    version?.kind === "video" || usingProxy ? videoRef.current : version?.kind === "image" ? imgRef.current : null;
  const canCapture = version?.kind === "video" || version?.kind === "image" || usingProxy;
  // El segundo (timecode) se puede leer en un <video> del mismo origen (subido/proxy), en YouTube
  // (IFrame API) y en Vimeo (Player API); NO en el iframe de Drive. Se reporta al padre.
  const canTimecode = version?.kind === "video" || usingProxy || version?.kind === "youtube" || version?.kind === "vimeo";
  React.useEffect(() => {
    onCapabilities?.({ frame: canCapture, time: canTimecode });
  }, [canCapture, canTimecode, onCapabilities]);

  // ── Recuerda la posición de reproducción por video ──
  // Al cambiar de pestaña (o recargar en la misma sesión) el <video> se vuelve a montar y
  // arrancaría en 0. Guardamos el segundo actual y al volver hacemos seek a ese punto (el
  // proxy soporta Range, así que bufferea solo desde ahí). Solo aplica al <video> del mismo
  // origen (proxy/archivo subido); el iframe de Google/YouTube es de otro dominio y no se
  // puede controlar, así que ese modo sí reinicia.
  const posKey = version ? `ui:vpos:${(version.proxySrc || version.src || "").split("?")[0]}` : null;
  const posRestored = React.useRef(false);
  const lastSaveRef = React.useRef(0);
  // Reinicia la marca de "ya restaurado" cuando cambia el video O cuando (re)entramos en modo
  // captura: así, si el <video> del mismo origen se re-monta, retoma la posición guardada en vez
  // de arrancar en 0 (el iframe de Google sí reinicia, pero el proxy no debe).
  React.useEffect(() => { posRestored.current = false; }, [posKey, usingProxy]);
  const savePos = React.useCallback((force = false) => {
    const v = videoRef.current;
    if (!v || !posKey) return;
    const now = Date.now();
    if (!force && now - lastSaveRef.current < 1000) return; // throttle (timeupdate dispara ~4/s)
    lastSaveRef.current = now;
    try {
      // Cerca del final → no reanudar (que vuelva a empezar la próxima vez).
      if (v.currentTime > 1 && (!v.duration || v.currentTime < v.duration - 1)) sessionStorage.setItem(posKey, String(v.currentTime));
      else sessionStorage.removeItem(posKey);
    } catch { /* sessionStorage no disponible */ }
  }, [posKey]);
  const restorePos = React.useCallback(() => {
    const v = videoRef.current;
    if (!v || !posKey || posRestored.current) return;
    posRestored.current = true;
    try {
      const saved = Number(sessionStorage.getItem(posKey));
      if (saved > 0 && Number.isFinite(saved) && (!v.duration || saved < v.duration - 0.5)) v.currentTime = saved;
    } catch { /* noop */ }
  }, [posKey]);
  // Guarda al desmontar (cambio de pestaña/navegación) con el valor más reciente.
  React.useEffect(() => () => savePos(true), [savePos]);

  // API del reproductor según el tipo de fuente.
  React.useEffect(() => {
    if (!version) { apiRef.current = null; return; }
    const cap = (caption?: string) => composite(captureEl(), [], { w: 0, h: 0 }, caption);
    if (version.kind === "video" || usingProxy) {
      apiRef.current = {
        getTime: () => videoRef.current?.currentTime ?? null,
        seek: (t, autoplay = true) => { if (videoRef.current) { videoRef.current.currentTime = t; if (autoplay) videoRef.current.play().catch(() => {}); } },
        pause: () => { videoRef.current?.pause(); },
        play: () => { videoRef.current?.play().catch(() => {}); },
        getDuration: () => { const d = videoRef.current?.duration; return d && Number.isFinite(d) ? d : null; },
        isPaused: () => videoRef.current?.paused ?? true,
        capture: cap,
        setRate: (r) => { if (videoRef.current) videoRef.current.playbackRate = r; },
      };
      // Re-aplica la velocidad elegida al reconstruirse la API (cambio de versión / captura).
      if (videoRef.current) videoRef.current.playbackRate = rateRef.current;
    } else if (version.kind === "image") {
      apiRef.current = { getTime: () => null, seek: () => {}, pause: () => {}, play: () => {}, getDuration: () => null, isPaused: () => true, capture: cap, setRate: () => {} };
    } else if (version.kind === "youtube") {
      apiRef.current = {
        getTime: () => { try { return ytPlayer.current?.getCurrentTime?.() ?? null; } catch { return null; } },
        seek: (t) => { try { ytPlayer.current?.seekTo?.(t, true); } catch { /* noop */ } },
        pause: () => { try { ytPlayer.current?.pauseVideo?.(); } catch { /* noop */ } },
        play: () => { try { ytPlayer.current?.playVideo?.(); } catch { /* noop */ } },
        getDuration: () => { try { const d = ytPlayer.current?.getDuration?.(); return d && d > 0 ? d : null; } catch { return null; } },
        // Estado 1 = reproduciendo (IFrame API); cualquier otro se trata como pausado.
        isPaused: () => { try { return ytPlayer.current?.getPlayerState?.() !== 1; } catch { return true; } },
        capture: () => null,
        setRate: (r) => { try { ytPlayer.current?.setPlaybackRate?.(r); } catch { /* noop */ } },
      };
    } else if (version.kind === "vimeo") {
      apiRef.current = {
        getTime: () => vimeoTime.current,
        seek: (t) => { try { vimeoPlayer.current?.setCurrentTime?.(t); vimeoPlayer.current?.play?.(); } catch { /* noop */ } },
        pause: () => { try { vimeoPlayer.current?.pause?.(); } catch { /* noop */ } },
        play: () => { try { vimeoPlayer.current?.play?.(); } catch { /* noop */ } },
        getDuration: () => vimeoDur.current,
        isPaused: () => vimeoPaused.current,
        capture: () => null,
        setRate: (r) => { try { vimeoPlayer.current?.setPlaybackRate?.(r); } catch { /* noop */ } },
      };
    } else {
      apiRef.current = { getTime: () => null, seek: () => {}, pause: () => {}, play: () => {}, getDuration: () => null, isPaused: () => true, capture: () => null, setRate: () => {} };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, apiRef, usingProxy]);

  // Carga la IFrame API de YouTube (para leer el segundo).
  React.useEffect(() => {
    if (version?.kind !== "youtube" || !ytRef.current) return;
    let cancelled = false;
    const make = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (cancelled || !(window as any).YT || !ytRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ytPlayer.current = new (window as any).YT.Player(ytRef.current, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        events: { onReady: (e: any) => { try { e.target.setPlaybackRate(rateRef.current); } catch { /* noop */ } } },
      });
    };
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

  // Carga la Player API de Vimeo (para leer el segundo del iframe vía postMessage).
  React.useEffect(() => {
    if (version?.kind !== "vimeo" || !ytRef.current) return;
    let cancelled = false;
    vimeoTime.current = null;
    vimeoDur.current = null;
    vimeoPaused.current = true;
    const make = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (cancelled || !(window as any).Vimeo?.Player || !ytRef.current) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = new (window as any).Vimeo.Player(ytRef.current);
        vimeoPlayer.current = p;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        p.on("timeupdate", (d: any) => {
          vimeoTime.current = typeof d?.seconds === "number" ? d.seconds : vimeoTime.current;
          if (typeof d?.duration === "number" && d.duration > 0) vimeoDur.current = d.duration;
        });
        p.on("play", () => { vimeoPaused.current = false; });
        p.on("pause", () => { vimeoPaused.current = true; });
        p.ready().then(() => { try { p.setPlaybackRate(rateRef.current); } catch { /* planes sin control de velocidad */ } }).catch(() => {});
      } catch { /* iframe aún no listo */ }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).Vimeo?.Player) make();
    else {
      const id = "vimeo-player-api";
      const existing = document.getElementById(id) as HTMLScriptElement | null;
      if (existing) existing.addEventListener("load", make, { once: true });
      else {
        const s = document.createElement("script");
        s.id = id; s.src = "https://player.vimeo.com/api/player.js";
        s.addEventListener("load", make, { once: true });
        document.body.appendChild(s);
      }
    }
    return () => { cancelled = true; vimeoPlayer.current = null; };
  }, [version]);

  if (!version || version.kind === "none" || !version.src) {
    return <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">Sin material para esta versión.</div>;
  }

  const overlay = drawOpen ? <DrawOverlay captureEl={captureEl} canCapture={canCapture} onResult={onDrawn} /> : null;
  // Subtítulo en vivo del comentario que se está escribiendo, encima del video. En inmersivo
  // sube para no chocar con la barra de progreso del overlay.
  const liveCaption = !drawOpen && caption.trim() ? (
    <div className={`pointer-events-none absolute inset-x-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-8 ${immersive ? "bottom-16" : "bottom-0"}`}>
      <span className="text-sm font-medium text-white drop-shadow">{caption.trim()}</span>
    </div>
  ) : null;
  // Conmutador Drive: ver con Google (rápido) ↔ modo captura (video proxiado). Al alternar
  // se limpia el fallo previo, para poder reintentar el modo captura.
  const driveToggle = isDriveProxyable && !drawOpen ? (
    <button
      type="button"
      onClick={() => { setDriveProxyFailed(false); proxyRetries.current = 0; setCaptureMode((m) => !m); }}
      title={captureMode ? "Volver al reproductor de Google (más rápido)" : "Cargar el video para poder capturar el fotograma"}
      className="absolute right-2 top-2 z-10 rounded-md bg-black/70 px-2 py-1 text-[11px] font-medium text-white shadow hover:bg-black/85"
    >
      {captureMode ? "▶︎ Ver con Google" : "📸 Modo captura"}
    </button>
  ) : null;
  // Barra de velocidad de la app (aplica al <video> del mismo origen y a YouTube).
  const speedBar = <SpeedBar rate={rate} onRate={applyRate} />;

  if (version.kind === "video" || usingProxy) {
    return (
      <div className={immersive ? "h-full w-full" : undefined}>
        <div className={immersive ? "relative h-full w-full" : "relative mx-auto w-fit max-w-full"}>
          <video
            ref={videoRef}
            src={usingProxy ? version.proxySrc! : version.src}
            controls={!immersive}
            playsInline
            // SIN crossOrigin: con "anonymous", un MP4 externo sin cabeceras CORS no reproduce NADA.
            // Sin el atributo siempre reproduce; si la fuente es de otro origen, la captura del
            // fotograma simplemente devuelve null (composite lo maneja) en vez de romper el video.
            // Si el video proxiado de Drive falla, REINTENTA una vez (errores transitorios / arranque
            // del stream) antes de caer al visor de Google —donde no se puede capturar el fotograma ni
            // el segundo—. Solo tras un fallo real y repetido baja al iframe.
            onError={() => {
              if (!usingProxy) return;
              const v = videoRef.current;
              if (v && proxyRetries.current < 2) {
                proxyRetries.current += 1;
                const s = v.src;
                v.removeAttribute("src"); v.load();
                retryTimer.current = window.setTimeout(() => {
                  retryTimer.current = null;
                  // Solo restaura si seguimos en la MISMA versión/modo (el src esperado no cambió).
                  if (videoRef.current && version?.proxySrc && s.includes(version.proxySrc)) {
                    videoRef.current.src = s; videoRef.current.load();
                  }
                }, 600);
                return;
              }
              setDriveProxyFailed(true); setCaptureMode(false);
            }}
            onLoadedMetadata={(e) => { restorePos(); e.currentTarget.playbackRate = rateRef.current; }}
            onRateChange={(e) => applyRate(e.currentTarget.playbackRate)}
            onTimeUpdate={() => savePos()}
            onPause={() => savePos(true)}
            // iOS: sin menú de long-press ("Guardar vídeo") sobre el material.
            style={{ WebkitTouchCallout: "none" }}
            className={immersive ? "block h-full w-full object-contain" : "block max-h-[80vh] w-auto max-w-full rounded-xl border border-border bg-black"}
          />
          {immersive ? null : driveToggle}
          {liveCaption}
          {overlay}
        </div>
        {immersive ? null : speedBar}
      </div>
    );
  }
  if (version.kind === "image") {
    return (
      <div className={immersive ? "relative flex h-full w-full items-center justify-center" : "relative mx-auto w-fit max-w-full"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {/* Sin crossOrigin: con "anonymous", una imagen externa sin CORS no CARGA. Sin el
            atributo siempre se ve; si es de otro origen, la captura devuelve null y queda
            el camino de pegar/subir una captura para anotar. */}
        <img ref={imgRef} src={version.src} alt="Material" className={immersive ? "block max-h-full max-w-full object-contain" : "block max-h-[80vh] w-auto max-w-full rounded-xl border border-border"} />
        {overlay}
      </div>
    );
  }
  // YouTube / Vimeo / Drive (iframe). Para Drive, el conmutador permite pasar a modo captura.
  // El iframe no tiene aspecto propio: para verticales (9:16) usamos un marco alto y centrado;
  // para horizontales, 16:9 a todo el ancho. Así el reel no se ve encajado en una caja ancha.
  const isYouTube = version.kind === "youtube";
  return (
    <div className={immersive ? "h-full w-full" : undefined}>
      <div className={immersive ? "relative h-full w-full" : vertical ? "relative mx-auto w-fit max-w-full" : "relative"}>
        <iframe
          ref={ytRef}
          src={version.src}
          className={immersive
            ? "block h-full w-full border-0 bg-black"
            : vertical
              ? "mx-auto block aspect-[9/16] h-[72vh] max-h-[80vh] w-auto max-w-full rounded-xl border border-border bg-black"
              : "aspect-video w-full rounded-xl border border-border bg-black"}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
        {immersive ? null : driveToggle}
        {liveCaption}
        {overlay}
      </div>
      {immersive ? null : isYouTube || version.kind === "vimeo" ? (
        // YouTube y Vimeo exponen API de velocidad → barra de la app.
        speedBar
      ) : (
        // Drive se reproduce en su propio iframe: la velocidad (1.5×, 2×) va en el
        // engranaje ⚙ de ESE reproductor. Ofrecemos volver a reproducir el original.
        <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
          <p>⏩ Cambia la velocidad (1.5×, 2×) desde el engranaje ⚙ del reproductor de Google.</p>
          {isDriveProxyable ? (
            driveProxyFailed ? (
              <p>⚠️ No se pudo cargar este video de Drive para capturar. Para que se capturen el fotograma y el segundo: compártelo como «Cualquiera con el enlace» y que sea un MP4 (H.264), o —lo más fiable— súbelo al NAS en «+ Versión». Mientras tanto puedes verlo aquí y anotar con ✏️ Dibujar.</p>
            ) : (
              <p>
                ▶︎ ¿El video no carga o Google dice que «se está procesando»?{" "}
                <button type="button" onClick={() => { setDriveProxyFailed(false); proxyRetries.current = 0; setCaptureMode(true); }} className="font-medium text-primary hover:underline">
                  Reproducir el video original
                </button>.
              </p>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}

// Muestra EN VIVO el segundo actual del video (se refresca ~4/s mientras reproduce o cuando
// pausas/buscas), para que el revisor vea EXACTAMENTE en qué segundo quedará su comentario ANTES
// de enviarlo. Es el MISMO valor que se guarda al enviar (getTime() del instante), así que si
// reproduces y paras en otro punto, el número lo sigue y nunca se guarda un segundo viejo.
// Componente aislado: su poll no re-renderiza el resto del escenario.
function LiveTimecode({ playerRef, frame }: { playerRef: React.MutableRefObject<PlayerApi | null>; frame: boolean }) {
  const [sec, setSec] = React.useState<number | null>(null);
  React.useEffect(() => {
    const id = window.setInterval(() => setSec(playerRef.current?.getTime() ?? null), 250);
    return () => window.clearInterval(id);
  }, [playerRef]);
  return (
    <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
      {sec != null
        ? `⏱ Se guardará en ${fmtTime(sec)}${frame ? " + captura del fotograma" : ""}`
        : "⏱ Se guardará el segundo al comentar"}
    </span>
  );
}

// Barra compacta de velocidad de reproducción (0.5×–2×) para el reproductor de la app.
function SpeedBar({ rate, onRate }: { rate: number; onRate: (r: number) => void }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium text-muted-foreground">Velocidad</span>
      {PLAYBACK_RATES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onRate(r)}
          aria-pressed={r === rate}
          className={`rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums transition-colors ${r === rate ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-accent"}`}
        >
          {r}×
        </button>
      ))}
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
    // Evita leer en memoria imágenes enormes (cuelgue/jank en celular). El fotograma final se
    // recomprime a ≤1280 px en composite(), así que 8 MB de fuente sobran de largo.
    if (file.size > 8_000_000) { window.alert("Esa imagen es muy pesada (máx 8 MB). Usa una captura más liviana."); return; }
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
  if (source && natW) { try { g.drawImage(source, 0, 0, cw, ch); drew = true; } catch { /* lienzo contaminado por CORS */ } }
  // Sin fotograma REAL no fabricamos una imagen. Rellenar un frame negro (aunque sea con el texto
  // del comentario o los trazos encima) ERA exactamente la «captura en negro» que se guardaba
  // cuando la fuente no se puede leer (iframe de Drive cross-origin, o el <video> aún sin decodificar).
  // Devolvemos null → el comentario se guarda con su segundo pero SIN imagen; para anotar sobre una
  // fuente no capturable se pega/sube una captura con ✏️ Dibujar.
  if (!drew) return null;
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
  // El fotograma debe caber bajo el tope del servidor (JSON con la imagen en base64 ≤ 500 000).
  // Los reels VERTICALES (1080×1920) NO se reducen por ancho (1080 < 1280), así que un fotograma
  // recargado puede pasarse; si se pasa, se baja la calidad hasta que quepa. Así lo que ve el
  // cliente (UI optimista) es EXACTAMENTE lo que guarda el servidor (antes se descartaba en
  // silencio y el fotograma «desaparecía» al recargar).
  const CAP = 480_000; // margen bajo el tope de 500 000 del servidor (holgura para el resto del JSON)
  try {
    for (const q of [0.72, 0.6, 0.5, 0.4]) {
      const url = cv.toDataURL("image/jpeg", q);
      if (url.length <= CAP) return url;
    }
    return cv.toDataURL("image/jpeg", 0.32);
  } catch { return null; }
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
