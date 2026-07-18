"use client";

import * as React from "react";
import Link from "next/link";
import { Send, MessageSquare, Paperclip, FileText, FileSpreadsheet, Presentation, FileType, File as FileIcon, Download, Pencil, Eye, X, BarChart3, Smile, SmilePlus, Pin, Trash2, MoreVertical, MoreHorizontal, Search, Check, Mic, Share2, Link2, AtSign, FolderPlus } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { formatBogota } from "@/lib/bogota-time";
import { sendMessage, sendMessageWithAttachments, createPoll, votePoll, toggleReaction, editMessage, deleteMessage, togglePin, notifyTyping, markChannelRead, clearConversation, forwardMessage, getForwardTargets, archiveChatAttachment, getChannelReaders, type ChannelReader } from "@/app/(app)/chat/actions";
import { PollWidget } from "@/components/chat/poll-widget";
import { VoiceNote } from "@/components/chat/voice-note";
import { EmojiPicker, QUICK_REACTIONS } from "@/components/chat/emoji-picker";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import type { PollData, ReactionItem } from "@/lib/chat-bus";

export type Attachment = { id: string; name: string; mime: string | null; editable: boolean; fileAssetId?: string | null };
export type Member = { id: string; name: string; initials?: string | null; color?: string | null };

export type ChatMsg = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: string;
  author: { name: string; initials: string | null; color: string | null } | null;
  attachments?: Attachment[];
  reactions?: ReactionItem[];
  poll?: PollData | null;
  myOptionId?: string | null;
  pinned?: boolean;
  editedAt?: string | null;
  deleted?: boolean; // borrado suave: solo lo recibe el admin (lo ve en gris)
  status?: "sending" | "sent" | "error" | "pending";
};

export type ChatMe = { id: string; name: string; initials: string | null; color: string | null };

function hhmm(iso: string) {
  return formatBogota(iso, { hour: "2-digit", minute: "2-digit" });
}

// Resalta @menciones conocidas y convierte URLs en enlaces clicables. `mine` indica si el
// mensaje es propio (burbuja primaria): el chip cambia de color para seguir siendo legible
// (antes usaba text-primary → azul sobre azul = invisible en la burbuja propia).
function highlightMentions(text: string, members: Member[], keyBase: string, mine = false): React.ReactNode[] {
  if (!members.length || !text.includes("@")) return [text];
  const names = members.map((m) => m.name).sort((a, b) => b.length - a.length);
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`@(${escaped.join("|")})`, "g");
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span
        key={`${keyBase}m${i++}`}
        className={cn("rounded px-1 font-semibold", mine ? "bg-primary-foreground/25 text-primary-foreground" : "bg-primary/15 text-primary")}
        title={`@${m[1]}`}
      >
        @{mentionLabel(m[1])}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
// Formato ligero estilo WhatsApp: *negrita*, ~tachado~ y `código`. Sin _cursiva_ a propósito
// (chocaría con nombres_de_archivo). Solo dentro de una línea, con límites de palabra (el
// delimitador debe abrir tras espacio/puntuación y cerrar antes de espacio/puntuación) para no
// disparar con asteriscos sueltos. Marcebot escribe *así* y por fin se ve en negrita.
function formatInline(text: string, keyBase: string, render: (chunk: string, key: string) => React.ReactNode): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(^|[\s(¿¡["'«—-])([*~`])(?!\s)([^*~`\n]*?[^\s*~`])\2(?=$|[\s).,;:!?\]"'»—-])/gmu;
  let idx = 0;
  let i = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[1].length;
    if (start > idx) out.push(render(text.slice(idx, start), `${keyBase}p${i++}`));
    const inner = m[3];
    if (m[2] === "`") {
      // El código se muestra literal (sin resaltar menciones dentro).
      out.push(<code key={`${keyBase}c${i++}`} className="rounded bg-black/10 px-1 font-mono text-[0.9em] dark:bg-white/15">{inner}</code>);
    } else if (m[2] === "*") {
      out.push(<strong key={`${keyBase}b${i++}`}>{render(inner, `${keyBase}bi${i}`)}</strong>);
    } else {
      out.push(<s key={`${keyBase}s${i++}`}>{render(inner, `${keyBase}si${i}`)}</s>);
    }
    idx = start + (m[0].length - m[1].length);
  }
  if (idx < text.length) out.push(render(text.slice(idx), `${keyBase}p${i++}`));
  return out;
}
function renderBody(text: string, members: Member[], mine = false): React.ReactNode {
  const urlRe = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRe);
  return parts.map((part, idx) => {
    if (urlRe.test(part)) {
      return (
        <a key={`u${idx}`} href={part} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:opacity-80">
          {part}
        </a>
      );
    }
    return (
      <React.Fragment key={`t${idx}`}>
        {formatInline(part, `${idx}`, (chunk, key) => highlightMentions(chunk, members, key, mine))}
      </React.Fragment>
    );
  });
}

// Etiqueta de día para separadores (Hoy / Ayer / fecha).
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Hoy";
  if (sameDay(d, y)) return "Ayer";
  return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}
function dayKeyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
// IDs de miembros mencionados con @ en el texto.
function detectMentions(text: string, members: Member[]): string[] {
  return members.filter((mem) => text.includes(`@${mem.name}`)).map((mem) => mem.id);
}

// Nombre corto para el autocompletado de @menciones: quita el sufijo de cargo (" - Rol") y, si
// aún es largo, deja solo nombre y primer apellido (las 2 primeras palabras). Solo cambia lo MOSTRADO.
function mentionLabel(name: string): string {
  const base = name.split(/\s+[-–—]\s+/)[0].trim();
  const words = base.split(/\s+/).filter(Boolean);
  return words.length > 2 ? words.slice(0, 2).join(" ") : base || name;
}

// Imágenes previsualizables. Incluye HEIC/HEIF/TIFF (fotos de iPhone, etc.): el
// servidor las convierte a WebP al subir y /api/files las sirve ya convertidas.
function isImage(a: Attachment) {
  const WEB = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/svg+xml", "image/heic", "image/heif", "image/tiff", "image/bmp"];
  return WEB.includes((a.mime ?? "").toLowerCase()) || /\.(png|jpe?g|gif|webp|avif|svg|heic|heif|tiff?|bmp)$/i.test(a.name);
}
function isPdf(a: Attachment) {
  return a.mime === "application/pdf" || /\.pdf$/i.test(a.name);
}
// Audio (notas de voz y adjuntos de audio) → se reproduce en línea con un <audio>.
function isAudio(a: Attachment) {
  return (a.mime ?? "").toLowerCase().startsWith("audio/") || /\.(weba|webm|ogg|oga|m4a|mp3|wav)$/i.test(a.name);
}
// Icono y color según el tipo de archivo (Word/Excel/PPT/PDF/genérico).
function fileIcon(name: string) {
  if (/\.(docx?|odt|rtf)$/i.test(name)) return { Icon: FileText, color: "text-blue-600" };
  if (/\.(xlsx?|csv|ods)$/i.test(name)) return { Icon: FileSpreadsheet, color: "text-emerald-600" };
  if (/\.(pptx?|odp)$/i.test(name)) return { Icon: Presentation, color: "text-orange-600" };
  if (/\.pdf$/i.test(name)) return { Icon: FileType, color: "text-red-600" };
  return { Icon: FileIcon, color: "text-muted-foreground" };
}

// Acorta nombres largos conservando la extensión: "Guion_Viral_Restylane….docx".
function shortName(name: string, max = 26): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const base = dot > 0 ? name.slice(0, dot) : name;
  const keep = Math.max(6, max - ext.length - 1);
  return `${base.slice(0, keep)}…${ext}`;
}

// Cuerpo de mensaje vacío de los adjuntos (placeholder antiguo): no se muestra.
const ATTACH_PLACEHOLDER = "📎 Archivo adjunto";

function Attachments({ items, author, projectId = null, readOnly = false, canArchive = false, onArchived }: { items?: Attachment[]; author?: { initials: string | null; color: string | null } | null; projectId?: string | null; readOnly?: boolean; canArchive?: boolean; onArchived?: (attachmentId: string, fileAssetId: string | null) => void }) {
  // «Guardar en Archivos» es optimista: los payloads en memoria no se refrescan, así que
  // los adjuntos archivados EN ESTA sesión se recuerdan aquí para pintar el chip al instante
  // (y onArchived lo sube al estado del chat, que sobrevive a montar/desmontar la fila).
  const [savedNow, setSavedNow] = React.useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [saveErr, setSaveErr] = React.useState<Record<string, string>>({});
  if (!items || items.length === 0) return null;
  const inArchive = (a: Attachment) => !!a.fileAssetId || !!savedNow[a.id];
  const save = async (a: Attachment) => {
    setSavingId(a.id);
    setSaveErr((prev) => ({ ...prev, [a.id]: "" }));
    try {
      const r = await archiveChatAttachment(a.id).catch(() => ({ ok: false as const, error: "Sin conexión. Inténtalo de nuevo." }));
      if (r.ok) {
        setSavedNow((prev) => ({ ...prev, [a.id]: true }));
        onArchived?.(a.id, ("fileAssetId" in r ? r.fileAssetId : null) ?? null);
      } else {
        // El error del servidor SE MUESTRA (tipo bloqueado, sin permiso…): nada de fallos mudos.
        setSaveErr((prev) => ({ ...prev, [a.id]: r.error ?? "No se pudo archivar." }));
      }
    } finally {
      setSavingId(null);
    }
  };
  // Estado de archivado bajo el adjunto: chip-enlace si ya está en Archivos del proyecto,
  // o botón para guardarlo — solo canales de proyecto Y usuarios que PUEDEN archivar
  // (equipo con subir_archivos; al cliente/demo ni se les pinta un botón que siempre fallaría).
  const archiveRow = (a: Attachment) => {
    if (!projectId) return null;
    if (inArchive(a)) {
      return (
        <Link href={`/proyectos/${projectId}?tab=archivos`} className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary" title="Está en la pestaña Archivos del proyecto">
          <Check className="size-3" /> En Archivos del proyecto
        </Link>
      );
    }
    if (readOnly || !canArchive) return null;
    return (
      <span className="mt-0.5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void save(a)} disabled={savingId === a.id} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary disabled:opacity-50" title="Copiarlo a la pestaña Archivos del proyecto">
          <FolderPlus className="size-3" /> {savingId === a.id ? "Guardando…" : "Guardar en Archivos"}
        </button>
        {saveErr[a.id] ? <span className="text-xs text-destructive">{saveErr[a.id]}</span> : null}
      </span>
    );
  };
  return (
    <div className="mt-1.5 space-y-1.5">
      {items.map((a) => {
        if (isImage(a)) {
          // Vista previa de imagen → abre en el visor (misma página, cierra con Escape/×).
          // Mantiene href para abrir/descargar con Cmd/Ctrl+clic o si no hay JS.
          return (
            <div key={a.id} className="max-w-xs">
              <a href={`/api/files/${a.id}`} data-lightbox data-lightbox-name={a.name} rel="noreferrer" className="block cursor-zoom-in">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/files/${a.id}`}
                  alt={a.name}
                  className="max-h-64 max-w-full rounded-lg border border-border object-contain"
                  loading="lazy"
                  onLoad={() => window.dispatchEvent(new Event("chat-media-loaded"))}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">{a.name}</span>
              </a>
              {archiveRow(a)}
            </div>
          );
        }
        if (isAudio(a)) {
          // Nota de voz / audio: reproductor estilo WhatsApp (onda + play + duración).
          // No se archiva en el proyecto (son conversación, no material).
          return <VoiceNote key={a.id} src={`/api/files/${a.id}`} author={author} />;
        }
        const { Icon, color } = fileIcon(a.name);
        return (
          <div key={a.id} className="w-72 max-w-full">
            <div className="rounded-xl border border-border bg-background p-2.5">
              <div className="flex items-center gap-2">
                <Icon className={cn("size-7 shrink-0", color)} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={a.name}>{shortName(a.name)}</span>
              </div>
              <div className="mt-2 flex items-center gap-3 border-t border-border pt-2 text-xs">
                {isPdf(a) ? (
                  <a href={`/api/files/${a.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    <Eye className="size-3.5" /> Ver
                  </a>
                ) : null}
                {a.editable ? (
                  <Link href={`/docs/${a.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                    <Pencil className="size-3.5" /> Editar
                  </Link>
                ) : null}
                <a href={`/api/files/${a.id}?download=1`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  <Download className="size-3.5" /> Descargar
                </a>
              </div>
            </div>
            {archiveRow(a)}
          </div>
        );
      })}
    </div>
  );
}

// Fila de reacciones (emoji + conteo) bajo un mensaje, con botón para reaccionar.
function Reactions({ reactions, meId, onToggle }: { reactions: ReactionItem[] | undefined; meId: string; onToggle: (emoji: string) => void }) {
  const [pickQuick, setPickQuick] = React.useState(false);
  const groups = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions ?? []) {
    const g = groups.get(r.emoji) ?? { count: 0, mine: false };
    g.count++;
    if (r.userId === meId) g.mine = true;
    groups.set(r.emoji, g);
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {[...groups.entries()].map(([emoji, g]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggle(emoji)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px]",
            g.mine ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted",
          )}
        >
          <span>{emoji}</span> {g.count}
        </button>
      ))}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPickQuick((v) => !v)}
          className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          title="Reaccionar"
        >
          <SmilePlus className="size-3.5" />
        </button>
        {pickQuick ? (
          <div className="absolute bottom-6 left-0 z-30 flex gap-0.5 rounded-full border border-border bg-popover px-1.5 py-1 shadow-lg">
            {QUICK_REACTIONS.map((e) => (
              <button key={e} type="button" onClick={() => { onToggle(e); setPickQuick(false); }} className="flex size-7 items-center justify-center rounded-full text-lg hover:bg-muted">
                {e}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ChannelChat({
  channelId,
  initialMessages,
  me,
  members = [],
  mentionExtras = [],
  readOnly = false,
  isAdmin = false,
  highlightId = null,
  projectId = null,
  initialLastReadAt = null,
  canArchive = false,
}: {
  channelId: string;
  initialMessages: ChatMsg[];
  me: ChatMe;
  members?: Member[];
  // Destinos especiales del autocompletado de @: «canal» (todos los miembros) y los ROLES del
  // equipo («Editor» → todo el equipo de ese rol). El servidor decide a quién avisar.
  mentionExtras?: { name: string; hint: string }[];
  readOnly?: boolean;
  isAdmin?: boolean;
  // Mensaje a resaltar al abrir (permalink ?msg=...): se hace scroll hasta él y se ilumina.
  highlightId?: string | null;
  // Canal de PROYECTO: habilita el chip «En Archivos del proyecto» y «Guardar en Archivos».
  projectId?: string | null;
  // ¿Este usuario puede archivar en el proyecto? (equipo con subir_archivos; nunca cliente/demo).
  canArchive?: boolean;
  // Última lectura al abrir (ISO): pinta la línea «Mensajes nuevos» a partir de ahí.
  initialLastReadAt?: string | null;
}) {
  const [messages, setMessages] = React.useState<ChatMsg[]>(initialMessages);
  const [text, setText] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [replyText, setReplyText] = React.useState<Record<string, string>>({});
  const [openThreads, setOpenThreads] = React.useState<Set<string>>(new Set());
  // Popup de reacciones rápidas abierto desde la barra flotante (id del mensaje).
  const [quickFor, setQuickFor] = React.useState<string | null>(null);
  // Se cierra con clic FUERA o Escape (mismo contrato que los <details data-autoclose>,
  // que aquí no aplica porque el popup es un div controlado por estado).
  React.useEffect(() => {
    if (!quickFor) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.("[data-quickreact]")) setQuickFor(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQuickFor(null);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [quickFor]);
  // Al archivar un adjunto, el estado del chat se entera (sobrevive a búsquedas/remontajes).
  const markArchived = React.useCallback((attachmentId: string, fileAssetId: string | null) => {
    setMessages((prev) => prev.map((mm) =>
      mm.attachments?.some((a) => a.id === attachmentId)
        ? { ...mm, attachments: mm.attachments.map((a) => (a.id === attachmentId ? { ...a, fileAssetId: fileAssetId ?? a.fileAssetId ?? null } : a)) }
        : mm,
    ));
  }, []);
  const [online, setOnline] = React.useState(true);
  // Salud del stream SSE del canal: "ok" | "reconnecting" (corte/502 del proxy en un deploy:
  // EventSource lo da por muerto DEFINITIVAMENTE y sin esto el chat quedaba sordo hasta
  // recargar) | "revoked" (el servidor avisó que perdí acceso al canal).
  const [conn, setConn] = React.useState<"ok" | "reconnecting" | "revoked">("ok");
  const [myVotes, setMyVotes] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialMessages.filter((m) => m.poll && m.myOptionId).map((m) => [m.poll!.id, m.myOptionId!]),
    ),
  );
  const [pollMode, setPollMode] = React.useState(false);
  const [pollQ, setPollQ] = React.useState("");
  const [pollOpts, setPollOpts] = React.useState<string[]>(["", ""]);
  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [searchOpen, setSearchOpen] = React.useState(false);
  // Paginación hacia atrás: el fetch inicial trae solo la ventana reciente; estos permiten
  // cargar el historial anterior por demanda sin recargar la página.
  const [hasOlder, setHasOlder] = React.useState(initialMessages.length >= 50);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [typingNames, setTypingNames] = React.useState<Record<string, number>>({}); // name → expiry ts
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const emojiBtnRef = React.useRef<HTMLButtonElement>(null);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);
  const composerWrapRef = React.useRef<HTMLDivElement>(null);
  // Grabación de nota de voz (en vivo, estilo WhatsApp).
  const [recording, setRecording] = React.useState(false);
  const [recSecs, setRecSecs] = React.useState(0);
  const recRef = React.useRef<MediaRecorder | null>(null);
  const recChunks = React.useRef<Blob[]>([]);
  const recStream = React.useRef<MediaStream | null>(null);
  const recTimer = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTypingRef = React.useRef(0);
  const queueKey = `labstream-chat-queue:${channelId}`;
  // Reenviar a otro canal del mismo cliente: destinos perezosos + estado por mensaje.
  const [forwardFor, setForwardFor] = React.useState<string | null>(null);
  const [forwardTargets, setForwardTargets] = React.useState<{ id: string; name: string }[] | null>(null);
  const [forwardDone, setForwardDone] = React.useState<string | null>(null);
  // Permalink: mensaje resaltado al llegar con ?msg=... (se apaga solo).
  const [highlighted, setHighlighted] = React.useState<string | null>(null);
  // «Visto por»: lectores del canal (lastReadAt). Se refresca al montar, al cambiar los mensajes
  // (con debounce) y al volver a la pestaña. Vacío en DMs (no aplica) y hasta la 1ª carga.
  const [readers, setReaders] = React.useState<ChannelReader[]>([]);

  const q = search.trim().toLowerCase();
  const roots = messages
    .filter((m) => !m.parentId)
    .filter((m) => !q || m.body.toLowerCase().includes(q))
    // Ordenar por fecha: el render depende del orden del array; así los mensajes que lleguen
    // por SSE/catch-up/paginación fuera de orden quedan siempre cronológicos (como las respuestas).
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const repliesFor = (id: string) =>
    messages.filter((m) => m.parentId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pinned = messages.filter((m) => m.pinned && !m.parentId);

  // ¿El mensaje es mío? (para alinearlo a la derecha con burbuja propia).
  const isMine = (a: ChatMsg["author"]) => !!a && a.name === me.name && a.color === me.color;
  // «Visto por» va SOLO bajo mi último mensaje enviado (patrón Teams): id del último root propio
  // ya confirmado, y los lectores que lo vieron (lastReadAt ≥ su fecha).
  const lastMineId = React.useMemo(() => {
    for (let i = roots.length - 1; i >= 0; i--) {
      const m = roots[i];
      if (isMine(m.author) && !m.deleted && (!m.status || m.status === "sent")) return m.id;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roots]);
  const lastMineAt = lastMineId ? roots.find((m) => m.id === lastMineId)?.createdAt ?? null : null;
  const seenByForLast = React.useMemo(
    () => (lastMineAt ? readers.filter((r) => r.at >= lastMineAt) : []),
    [readers, lastMineAt],
  );
  // Línea «Mensajes nuevos»: primer mensaje raíz AJENO posterior a la última lectura al
  // abrir el canal. Se congela al montar (deps vacías) para que no se mueva mientras
  // llegan mensajes ni cuando markChannelRead actualice la lectura en el servidor.
  const firstUnreadId = React.useMemo(() => {
    if (!initialLastReadAt) return null;
    const t = new Date(initialLastReadAt).getTime();
    if (Number.isNaN(t)) return null;
    const first = initialMessages.find(
      (msg) => !msg.parentId && !msg.deleted && !isMine(msg.author) && new Date(msg.createdAt).getTime() > t,
    );
    return first?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // «Visto por»: refresca los lectores al montar y cada vez que cambian los mensajes (debounce
  // 1,2 s para no consultar por cada tecla/SSE) y al volver a la pestaña. El servidor devuelve
  // [] en DMs y canales de difusión, así que ahí «readers» queda vacío y no se pinta nada.
  React.useEffect(() => {
    let cancelled = false;
    const load = () => {
      getChannelReaders(channelId)
        .then((r) => { if (!cancelled) setReaders(r); })
        .catch(() => {});
    };
    const t = setTimeout(load, 1200);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; clearTimeout(t); document.removeEventListener("visibilitychange", onVis); };
  }, [channelId, messages.length]);

  // Limpia los indicadores de "escribiendo…" caducados.
  React.useEffect(() => {
    const t = setInterval(() => {
      setTypingNames((prev) => {
        const now = Date.now();
        const next: Record<string, number> = {};
        for (const [n, exp] of Object.entries(prev)) if (exp > now) next[n] = exp;
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1500);
    return () => clearInterval(t);
  }, []);

  // Permalink ?msg=...: espera al scroll-al-fondo inicial, luego centra y resalta el mensaje si
  // está en la ventana cargada (si es más viejo, no se fuerza paginación: el enlace sigue sirviendo
  // como referencia del canal).
  React.useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`msg-${highlightId}`);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      setHighlighted(highlightId);
      setTimeout(() => setHighlighted(null), 2600);
    }, 250);
    return () => clearTimeout(t);
  }, [highlightId]);

  // Auto-crecimiento del cuadro de escritura: crece con el texto (hasta un máximo) para
  // verlo como un párrafo mientras se escribe; al pasar el máximo, hace scroll interno.
  React.useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const scrollToBottom = React.useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  const upsert = React.useCallback((m: ChatMsg) => {
    setMessages((prev) =>
      prev.some((x) => x.id === m.id) ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m],
    );
  }, []);

  // Espejo de mensajes para leer el último/primer createdAt sin recrear callbacks por cada cambio.
  const messagesRef = React.useRef(messages);
  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // ¿El scroll está (casi) al fondo? Se usa para no arrancar al usuario que lee historial arriba.
  const nearBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // Catch-up: trae de la BD los mensajes posteriores al último conocido y los integra. Cierra el
  // hueco del bus SSE en memoria (cortes de red, pestaña en segundo plano, reinicio del servidor,
  // o respuestas del bot que llegan con retraso en background). Se llama al (re)conectar y al volver.
  const catchUp = React.useCallback(async () => {
    let latest = "";
    for (const m of messagesRef.current) if (m.createdAt > latest) latest = m.createdAt;
    try {
      // Canal VACÍO al reconciliar: sin ?after se trae la ventana reciente completa (los
      // primeros mensajes de un canal nuevo pudieron llegar durante un hueco del SSE y
      // antes no se recuperaban nunca).
      const url = latest
        ? `/api/chat/${channelId}/messages?after=${encodeURIComponent(latest)}`
        : `/api/chat/${channelId}/messages`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const incoming: ChatMsg[] = data?.messages ?? [];
      if (!incoming.length) return;
      const wasNear = nearBottom();
      setMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        const add = incoming.filter((m) => !ids.has(m.id)).map((m) => ({ ...m, status: "sent" as const }));
        return add.length ? [...prev, ...add] : prev;
      });
      if (wasNear) scrollToBottom();
    } catch {
      /* best-effort */
    }
  }, [channelId, nearBottom, scrollToBottom]);

  // Cargar mensajes ANTERIORES (paginación hacia arriba) preservando la posición de scroll.
  const loadOlder = React.useCallback(async () => {
    if (loadingOlder) return;
    let earliest = "";
    for (const m of messagesRef.current) if (!earliest || m.createdAt < earliest) earliest = m.createdAt;
    if (!earliest) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    try {
      const res = await fetch(`/api/chat/${channelId}/messages?before=${encodeURIComponent(earliest)}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const older: ChatMsg[] = (data?.messages ?? []).map((m: ChatMsg) => ({ ...m, status: "sent" as const }));
        setHasOlder(!!data?.hasMore);
        if (older.length) {
          setMessages((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            const add = older.filter((m) => !ids.has(m.id));
            return add.length ? [...add, ...prev] : prev;
          });
          // Tras anteponer, restaurar la posición para que el usuario no salte.
          requestAnimationFrame(() => {
            const el2 = scrollRef.current;
            if (el2) el2.scrollTop = prevTop + (el2.scrollHeight - prevHeight);
          });
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingOlder(false);
    }
  }, [channelId, loadingOlder]);

  // Re-anclar al fondo cuando una imagen/adjunto termina de cargar (las <img> son lazy y crecen
  // después del primer scroll). Solo si el usuario seguía al fondo, para no interrumpir su lectura.
  React.useEffect(() => {
    const onMedia = () => {
      if (nearBottom()) scrollToBottom();
    };
    window.addEventListener("chat-media-loaded", onMedia);
    return () => window.removeEventListener("chat-media-loaded", onMedia);
  }, [nearBottom, scrollToBottom]);

  React.useEffect(() => {
    // Conexión SSE con reconexión PROPIA: EventSource solo auto-reintenta errores de red;
    // una respuesta no-200 (502 del reverse proxy durante un deploy/reinicio) lo marca
    // fallido para siempre y el canal quedaba mudo sin ninguna señal. Aquí: backoff +
    // franja «reconectando…» + catchUp() al reabrir (reconcilia el hueco con la BD).
    let es: EventSource | null = null;
    let stopped = false;
    let retryMs = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const handleEvent = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data?.kind === "poll") {
          setMessages((prev) => prev.map((m) => (m.poll?.id === data.poll.id ? { ...m, poll: data.poll } : m)));
          return;
        }
        if (data?.kind === "reaction") {
          setMessages((prev) => prev.map((m) => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m)));
          return;
        }
        if (data?.kind === "edit") {
          setMessages((prev) => prev.map((m) => (m.id === data.messageId ? { ...m, body: data.body, editedAt: data.editedAt } : m)));
          return;
        }
        if (data?.kind === "delete") {
          // El admin lo conserva en gris (auditoría); los demás lo quitan.
          setMessages((prev) =>
            isAdmin
              ? prev.map((m) => (m.id === data.messageId ? { ...m, deleted: true } : m))
              : prev.filter((m) => m.id !== data.messageId),
          );
          return;
        }
        if (data?.kind === "clear") {
          setMessages((prev) => (isAdmin ? prev.map((m) => ({ ...m, deleted: true })) : []));
          return;
        }
        if (data?.kind === "pin") {
          setMessages((prev) => prev.map((m) => (m.id === data.messageId ? { ...m, pinned: data.pinned } : m)));
          return;
        }
        if (data?.kind === "typing") {
          if (data.userId !== me.id) setTypingNames((prev) => ({ ...prev, [data.name]: Date.now() + 4000 }));
          return;
        }
        const m = data as ChatMsg;
        upsert({ ...m, status: "sent", reactions: m.reactions ?? [] });
        // Solo arrastra al fondo si el lector YA estaba al fondo (o si el mensaje es mío):
        // leer historial arriba no debe interrumpirse por cada mensaje entrante.
        if (!m.parentId && (nearBottom() || isMine(m.author))) scrollToBottom();
      } catch {
        /* ignore */
      }
    };
    const connect = () => {
      if (stopped) return;
      es = new EventSource(`/api/chat/${channelId}/stream`);
      es.onopen = () => {
        retryMs = 1000;
        setConn("ok");
        void catchUp();
      };
      es.onmessage = handleEvent;
      // El servidor expulsa con `revoked` si pierdo acceso al canal: avisar en vez de morir mudo.
      es.addEventListener("revoked", () => {
        stopped = true;
        setConn("revoked");
        es?.close();
      });
      es.onerror = () => {
        if (stopped) return;
        setConn("reconnecting");
        es?.close();
        const delay = retryMs;
        retryTimer = setTimeout(async () => {
          if (stopped) return;
          // Tras varios reintentos, sondear el acceso: un 403 (me revocaron con el stream
          // caído) no es un corte de red y no debe reintentar para siempre. EventSource no
          // expone el status, así que se pregunta al endpoint de mensajes.
          if (delay >= 8000) {
            try {
              const probe = await fetch(`/api/chat/${channelId}/messages?after=${encodeURIComponent(new Date().toISOString())}`, { cache: "no-store" });
              if (probe.status === 401 || probe.status === 403) {
                stopped = true;
                setConn("revoked");
                return;
              }
            } catch {
              /* red caída de verdad: seguir reintentando */
            }
          }
          connect();
        }, delay);
        retryMs = Math.min(retryMs * 2, 15000);
      };
    };
    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
    // isMine es una función del render (compara con `me`); estable a efectos prácticos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, upsert, scrollToBottom, me.id, isAdmin, catchUp, nearBottom]);

  React.useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // Marca el canal como leído solo si la pestaña está visible (con debounce para no
  // llamar por cada mensaje). Así los no-leídos no se borran si llegan en segundo plano.
  React.useEffect(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    // Solo marcar leído si el último mensaje está realmente a la vista (al fondo); si el usuario
    // está leyendo historial arriba, no ocultar avisos de mensajes que aún no ha visto.
    const t = setTimeout(() => {
      if (nearBottom()) void markChannelRead(channelId);
    }, 800);
    return () => clearTimeout(t);
  }, [channelId, messages.length, nearBottom]);
  React.useEffect(() => {
    let last = 0;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      // Al volver a la pestaña, reconciliar lo perdido mientras estuvo en segundo plano.
      void catchUp();
      // Throttle: ráfagas de visibilitychange/focus (extensiones, cambio de pestaña)
      // no deben disparar más de una marca cada 5 s.
      if (Date.now() - last < 5000) return;
      last = Date.now();
      if (nearBottom()) void markChannelRead(channelId);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [channelId, catchUp, nearBottom]);

  React.useEffect(() => {
    setOnline(navigator.onLine);
    const flush = async () => {
      setOnline(true);
      const raw = localStorage.getItem(queueKey);
      if (!raw) return;
      const queued: { tempId: string; body: string; parentId: string | null }[] = JSON.parse(raw);
      localStorage.removeItem(queueKey);
      for (const q of queued) await deliver(q.tempId, q.body, q.parentId);
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", flush);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("offline", goOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueKey]);

  function persist(tempId: string, body: string, parentId: string | null) {
    const arr = JSON.parse(localStorage.getItem(queueKey) || "[]");
    arr.push({ tempId, body, parentId });
    localStorage.setItem(queueKey, JSON.stringify(arr));
  }
  function unpersist(tempId: string) {
    const arr = JSON.parse(localStorage.getItem(queueKey) || "[]").filter(
      (x: { tempId: string }) => x.tempId !== tempId,
    );
    localStorage.setItem(queueKey, JSON.stringify(arr));
  }

  async function deliver(tempId: string, body: string, parentId: string | null) {
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "sending" } : m)));
    try {
      const real = await sendMessage(channelId, body, parentId, detectMentions(body, members));
      if (!real) return;
      unpersist(tempId);
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        if (withoutTemp.some((m) => m.id === real.id)) return withoutTemp;
        return [...withoutTemp, { ...real, status: "sent" }];
      });
    } catch {
      persist(tempId, body, parentId);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: navigator.onLine ? "error" : "pending" } : m)),
      );
    }
  }

  function submitText(body: string, parentId: string | null) {
    const clean = body.trim();
    if (!clean) return;
    const tempId = `temp-${Date.now()}-${Math.round(performance.now())}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        body: clean,
        parentId,
        createdAt: new Date().toISOString(),
        author: me,
        status: navigator.onLine ? "sending" : "pending",
      },
    ]);
    if (!parentId) scrollToBottom();
    if (!navigator.onLine) {
      persist(tempId, clean, parentId);
      return;
    }
    void deliver(tempId, clean, parentId);
  }

  // Añadir archivos al composer validando el tamaño EN EL CLIENTE (el servidor filtra >50MB
  // en silencio; sin este chequeo el adjunto desaparecía sin explicación). Los que pasan se
  // suman a la selección; los que no, se listan en un error claro.
  const MAX_FILE_MB = 50;
  function addFiles(incoming: File[]) {
    const ok: File[] = [];
    const tooBig: string[] = [];
    for (const f of incoming) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) tooBig.push(f.name);
      else ok.push(f);
    }
    if (tooBig.length) {
      setAttachErr(`Supera${tooBig.length === 1 ? "" : "n"} el máximo de ${MAX_FILE_MB} MB: ${tooBig.join(", ")}`);
    } else {
      setAttachErr(null);
    }
    if (ok.length) setFiles((prev) => [...prev, ...ok]);
  }

  async function submitMain(e: React.FormEvent) {
    e.preventDefault();
    if (files.length > 0) {
      // Guardar texto y archivos ANTES de limpiar: si el envío falla, se RESTAURAN (antes se
      // limpiaban de entrada y un fallo —p. ej. adjunto rechazado— se tragaba el mensaje).
      const sentText = text.trim();
      const sentFiles = files;
      const fd = new FormData();
      fd.set("channelId", channelId);
      fd.set("body", sentText);
      sentFiles.forEach((f) => fd.append("files", f));
      setUploading(true);
      setAttachErr(null);
      setText("");
      setFiles([]);
      try {
        // El servidor devuelve el mensaje ya guardado: se muestra al instante
        // (sin depender del SSE, que puede no llegar al propio emisor).
        const saved = await sendMessageWithAttachments(fd);
        if (saved) {
          upsert({ ...saved, status: "sent", reactions: saved.reactions ?? [] });
        } else {
          // El servidor devolvió null (sin acceso, o TODO el adjunto se filtró): restaurar.
          setText(sentText);
          setFiles(sentFiles);
          setAttachErr("No se pudo enviar. Revisa el tamaño del archivo (máx. 50 MB) o tu conexión.");
        }
      } catch {
        setText(sentText);
        setFiles(sentFiles);
        setAttachErr("No se pudo enviar el archivo. Revisa el tamaño o tu conexión.");
      } finally {
        setUploading(false);
        scrollToBottom();
      }
      return;
    }
    submitText(text, null);
    setText("");
    setMentionQuery(null);
  }

  // ── Notas de voz: grabar en vivo y enviar (MediaRecorder + adjunto de audio) ──
  function stopRecCleanup() {
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null; }
    recStream.current?.getTracks().forEach((t) => t.stop());
    recStream.current = null;
  }
  async function startRecording() {
    if (recording || uploading) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recStream.current = stream;
      const pref = ["audio/webm", "audio/mp4", "audio/ogg"];
      const mimeType = (typeof MediaRecorder !== "undefined" && pref.find((m) => MediaRecorder.isTypeSupported?.(m))) || undefined;
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recChunks.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) recChunks.current.push(e.data); };
      mr.start();
      recRef.current = mr;
      setRecSecs(0);
      setRecording(true);
      recTimer.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      setAttachErr("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
      stopRecCleanup();
    }
  }
  function finishRecording(send: boolean) {
    const mr = recRef.current;
    setRecording(false);
    if (!mr) { stopRecCleanup(); return; }
    mr.onstop = async () => {
      // mr.mimeType puede venir vacío en iOS; usamos el tipo del primer chunk o caemos a mp4
      // (formato nativo de iOS), NO a webm —que iOS no graba— para no mal-etiquetar el archivo.
      const type = mr.mimeType || recChunks.current[0]?.type || "audio/mp4";
      const blob = new Blob(recChunks.current, { type });
      recChunks.current = [];
      recRef.current = null;
      stopRecCleanup();
      if (!send || blob.size === 0) return;
      const ext = type.includes("webm") ? "weba" : type.includes("ogg") ? "ogg" : "m4a";
      const file = new File([blob], `nota-de-voz-${Date.now()}.${ext}`, { type });
      const fd = new FormData();
      fd.set("channelId", channelId);
      fd.set("body", "");
      fd.append("files", file);
      setUploading(true);
      setAttachErr(null);
      try {
        const saved = await sendMessageWithAttachments(fd);
        if (saved) upsert({ ...saved, status: "sent", reactions: saved.reactions ?? [] });
      } catch {
        setAttachErr("No se pudo enviar la nota de voz.");
      } finally {
        setUploading(false);
        scrollToBottom();
      }
    };
    try { mr.stop(); } catch { stopRecCleanup(); }
  }
  React.useEffect(() => () => stopRecCleanup(), []);

  // Cambio del texto del composer: dispara "escribiendo…" (throttle) y detecta @menciones.
  function onComposerChange(v: string) {
    setText(v);
    const now = Date.now();
    if (now - lastTypingRef.current > 2500) {
      lastTypingRef.current = now;
      void notifyTyping(channelId);
    }
    const m = /(?:^|\s)@([\p{L}0-9]*)$/u.exec(v);
    setMentionQuery(m ? m[1] : null);
  }
  function insertMention(name: string) {
    setText((t) => t.replace(/(^|\s)@([\p{L}0-9]*)$/u, `$1@${name} `));
    setMentionQuery(null);
    composerRef.current?.focus();
  }
  // Lista para mencionar: el equipo del canal + destinos especiales (@canal, @Rol).
  const mentionPool = members;
  // Para RESALTAR menciones en los mensajes también cuentan los destinos especiales.
  const highlightPool: Member[] = [...members, ...mentionExtras.map((e, i) => ({ id: `extra-${i}`, name: e.name }))];
  const mentionMatches: { id: string; name: string; initials?: string | null; color?: string | null; hint?: string | null }[] =
    mentionQuery != null
      ? [
          // Sin bots del sistema: el chat de Marcebot se eliminó, mencionarlo no hace nada.
          ...mentionPool.filter((mem) => mem.id !== me.id && !(mem.initials === "🤖" || /marcebot/i.test(mem.name)) && mem.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6),
          ...mentionExtras
            .filter((e) => e.name.toLowerCase().includes(mentionQuery.toLowerCase()))
            .slice(0, 4)
            .map((e, i) => ({ id: `extra-${i}`, name: e.name, hint: e.hint })),
        ]
      : [];
  // Reinicia el resaltado al primer resultado cada vez que cambia lo que se teclea tras la "@".
  React.useEffect(() => { setMentionIndex(0); }, [mentionQuery]);
  // Cierra el menú de @menciones al hacer clic fuera del cuadro de escritura.
  React.useEffect(() => {
    if (mentionQuery == null) return;
    const onDown = (e: MouseEvent) => {
      if (composerWrapRef.current && !composerWrapRef.current.contains(e.target as Node)) setMentionQuery(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [mentionQuery]);

  const { confirm, dialog } = useConfirmDialog();
  const [attachErr, setAttachErr] = React.useState<string | null>(null);

  async function saveEdit(id: string) {
    const body = editText.trim();
    setEditing(null);
    if (!body) return;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, body, editedAt: new Date().toISOString() } : m)));
    await editMessage(id, body);
  }
  async function removeMsg(id: string) {
    if (!(await confirm({ message: "¿Borrar este mensaje?", confirmLabel: "Borrar", danger: true }))) return;
    // El admin lo conserva en gris (auditoría); los demás lo quitan de su vista.
    setMessages((prev) => (isAdmin ? prev.map((m) => (m.id === id ? { ...m, deleted: true } : m)) : prev.filter((m) => m.id !== id)));
    await deleteMessage(id);
  }
  const [clearing, setClearing] = React.useState(false);
  async function clearAll() {
    if (!(await confirm({ title: "Borrar conversación", message: "¿Borrar toda la conversación? Los mensajes desaparecerán para los participantes.", confirmLabel: "Borrar", danger: true }))) return;
    setClearing(true);
    setMessages((prev) => (isAdmin ? prev.map((m) => ({ ...m, deleted: true })) : []));
    try { await clearConversation(channelId); } finally { setClearing(false); }
  }
  async function pin(id: string, current: boolean) {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, pinned: !current } : m)));
    await togglePin(id);
  }

  async function vote(pollId: string, optionId: string) {
    setMyVotes((prev) => ({ ...prev, [pollId]: optionId }));
    const data = await votePoll(pollId, optionId);
    if (data) setMessages((prev) => prev.map((m) => (m.poll?.id === pollId ? { ...m, poll: data } : m)));
  }

  // Alternar una reacción de emoji (optimista; SSE sincroniza a los demás).
  function react(messageId: string, emoji: string) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const list = m.reactions ?? [];
        const has = list.some((r) => r.emoji === emoji && r.userId === me.id);
        return { ...m, reactions: has ? list.filter((r) => !(r.emoji === emoji && r.userId === me.id)) : [...list, { emoji, userId: me.id }] };
      }),
    );
    void toggleReaction(channelId, messageId, emoji);
  }

  async function submitPoll(e: React.FormEvent) {
    e.preventDefault();
    const opts = pollOpts.map((o) => o.trim()).filter(Boolean);
    if (!pollQ.trim() || opts.length < 2) return;
    const fd = new FormData();
    fd.set("question", pollQ.trim());
    opts.forEach((o) => fd.append("options", o));
    setPollMode(false);
    setPollQ("");
    setPollOpts(["", ""]);
    await createPoll(channelId, fd); // el mensaje con la encuesta llega por SSE
    scrollToBottom();
  }

  function statusTag(s?: string) {
    if (!s || s === "sent") return null;
    return (
      <span className={cn("text-[10px]", s === "error" ? "text-destructive" : "text-muted-foreground")}>
        {s === "sending" && "· enviando…"}
        {s === "pending" && "· pendiente"}
        {s === "error" && "· error"}
      </span>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {dialog}
      {/* Barra: buscar + mensajes fijados */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        {searchOpen ? (
          <div className="flex flex-1 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1">
            <Search className="size-3.5 text-muted-foreground" />
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en el chat…" className="w-full bg-transparent text-xs outline-none" />
            <button type="button" aria-label="Cerrar búsqueda" onClick={() => { setSearch(""); setSearchOpen(false); }} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
          </div>
        ) : (
          <>
            <button onClick={() => setSearchOpen(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted" title="Buscar">
              <Search className="size-3.5" /> Buscar
            </button>
            <span className="ml-auto flex items-center gap-2">
              {pinned.length > 0 ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Pin className="size-3" /> {pinned.length} fijado{pinned.length === 1 ? "" : "s"}</span>
              ) : null}
              {!readOnly ? (
                <details data-autoclose className="relative">
                  <summary className="flex cursor-pointer list-none items-center rounded-md px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Opciones de la conversación"><MoreHorizontal className="size-4" /></summary>
                  <div className="absolute right-0 z-30 mt-1 w-52 rounded-lg border border-border bg-popover p-1 text-xs shadow-lg">
                    <button
                      onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; clearAll(); }}
                      disabled={clearing}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-muted disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" /> Borrar conversación
                    </button>
                  </div>
                </details>
              ) : null}
            </span>
          </>
        )}
      </div>
      {pinned.length > 0 && !searchOpen ? (
        <div className="shrink-0 space-y-1 border-b border-border bg-muted/40 px-3 py-1.5">
          {pinned.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5 text-xs">
              <Pin className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate text-muted-foreground"><span className="font-medium text-foreground">{isMine(p.author) ? "Tú" : p.author?.name}:</span> {p.body}</span>
              {!readOnly ? <button onClick={() => pin(p.id, true)} className="ml-auto shrink-0 text-muted-foreground hover:text-destructive" title="Desfijar"><X className="size-3" /></button> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
        {hasOlder ? (
          <div className="flex justify-center py-1">
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={loadingOlder}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              {loadingOlder ? "Cargando…" : "Cargar mensajes anteriores"}
            </button>
          </div>
        ) : (
          <p className="text-center text-xs text-muted-foreground">Inicio de la conversación</p>
        )}
        {roots.map((m, idx) => {
          const replies = repliesFor(m.id);
          const open = openThreads.has(m.id);
          const mine = isMine(m.author);
          const showDay = idx === 0 || dayKeyOf(roots[idx - 1].createdAt) !== dayKeyOf(m.createdAt);
          // Continuación: mismo autor seguido, mismo día y < 7 min → fila compacta sin avatar
          // ni nombre. El espaciado refleja el grupo (mt-3 al cambiar de autor, mt-px dentro).
          const prev = idx > 0 ? roots[idx - 1] : null;
          const cont = !showDay && !!prev && !prev.deleted && !m.deleted
            && prev.author?.name === m.author?.name && prev.author?.color === m.author?.color
            && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 7 * 60_000
            && m.id !== firstUnreadId;
          const hasFooter = (m.reactions?.length ?? 0) > 0 || replies.length > 0;
          const toggleThread = () =>
            setOpenThreads((prevSet) => {
              const next = new Set(prevSet);
              if (next.has(m.id)) next.delete(m.id);
              else next.add(m.id);
              return next;
            });
          return (
            <React.Fragment key={m.id}>
            {showDay ? (
              <div className="flex items-center gap-2 pb-1 pt-3">
                <span className="h-px flex-1 bg-border" />
                <span suppressHydrationWarning className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{dayLabel(m.createdAt)}</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : null}
            {m.id === firstUnreadId ? (
              <div className="flex items-center gap-2 pt-2" aria-label="Mensajes nuevos">
                <span className="h-px flex-1 bg-primary/50" />
                <span className="text-xs font-semibold text-primary">Mensajes nuevos</span>
                <span className="h-px flex-1 bg-primary/50" />
              </div>
            ) : null}
            {m.deleted ? (
              <div id={`msg-${m.id}`} className="mt-3 flex gap-2.5">
                <UserAvatar initials={m.author?.initials} name={m.author?.name} color={m.author?.color} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-semibold text-muted-foreground">{mine ? "Tú" : m.author?.name ?? "Sistema"}</span>
                    <span suppressHydrationWarning className="text-xs text-muted-foreground">{hhmm(m.createdAt)}</span>
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"><Trash2 className="size-3" /> Borrado · visible solo para admin</span>
                  </div>
                  <div className="mt-0.5 inline-block max-w-2xl rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-sm italic text-muted-foreground">
                    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.body || "(sin texto)"}</p>
                  </div>
                </div>
              </div>
            ) : (
            <div id={`msg-${m.id}`} className={cn("group relative -mx-2 flex gap-2.5 rounded-lg px-2 py-0.5 transition-colors hover:bg-muted/40", cont ? "mt-px" : "mt-3", highlighted === m.id && "bg-primary/5 ring-2 ring-primary/60")}>
              {cont ? <div className="w-8 shrink-0" aria-hidden /> : <UserAvatar initials={m.author?.initials} name={m.author?.name} color={m.author?.color} size="md" />}
              <div className="min-w-0 flex-1">
                {!cont ? (
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-semibold">{mine ? "Tú" : m.author?.name ?? "Sistema"}</span>
                    <span suppressHydrationWarning className="text-xs text-muted-foreground">{hhmm(m.createdAt)}</span>
                    {m.pinned ? <Pin className="size-3 self-center text-muted-foreground" aria-label="Fijado" /> : null}
                    {statusTag(m.status)}
                  </div>
                ) : m.pinned || m.status ? (
                  <div className="flex items-baseline gap-2">
                    {m.pinned ? <Pin className="size-3 self-center text-muted-foreground" aria-label="Fijado" /> : null}
                    {statusTag(m.status)}
                  </div>
                ) : null}
                {/* Barra de acciones flotante (reaccionar · hilo · fijar · más): superpuesta,
                    nunca desplaza el layout; en escritorio aparece al pasar el mouse. */}
                {!readOnly && (!m.status || m.status === "sent") && editing !== m.id ? (
                  <div data-quickreact className="absolute right-1 top-0 z-20 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-0.5 opacity-100 shadow-sm transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 md:-top-3 md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100">
                    <div className="relative">
                      <button type="button" onClick={() => setQuickFor((cur) => (cur === m.id ? null : m.id))} className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" title="Reaccionar">
                        <SmilePlus className="size-3.5" />
                      </button>
                      {quickFor === m.id ? (
                        <div className="absolute right-0 top-7 z-30 flex gap-0.5 rounded-full border border-border bg-popover px-1.5 py-1 shadow-lg">
                          {QUICK_REACTIONS.map((e) => (
                            <button key={e} type="button" onClick={() => { react(m.id, e); setQuickFor(null); }} className="flex size-7 items-center justify-center rounded-full text-lg hover:bg-muted">
                              {e}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button type="button" onClick={toggleThread} className="hidden size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground md:flex" title="Responder en hilo">
                      <MessageSquare className="size-3.5" />
                    </button>
                    <button type="button" onClick={() => pin(m.id, !!m.pinned)} className="hidden size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground md:flex" title={m.pinned ? "Desfijar" : "Fijar"}>
                      <Pin className={cn("size-3.5", m.pinned && "text-primary")} />
                    </button>
                    <details data-autoclose className="relative">
                      <summary className="flex size-6 cursor-pointer list-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" title="Más acciones"><MoreVertical className="size-3.5" /></summary>
                      <div className="absolute right-0 z-30 mt-1 w-40 rounded-lg border border-border bg-popover p-1 text-xs shadow-lg">
                        <button onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; toggleThread(); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted md:hidden">
                          <MessageSquare className="size-3.5" /> Responder en hilo
                        </button>
                        <button onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; pin(m.id, !!m.pinned); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted md:hidden">
                          <Pin className="size-3.5" /> {m.pinned ? "Desfijar" : "Fijar"}
                        </button>
                        <button
                          onClick={async () => {
                            try { await navigator.clipboard.writeText(`${window.location.origin}/chat/${channelId}?msg=${m.id}`); } catch { /* sin portapapeles */ }
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                        >
                          <Link2 className="size-3.5" /> Copiar enlace
                        </button>
                        <button
                          onClick={async () => {
                            setForwardDone(null);
                            setForwardFor((cur) => (cur === m.id ? null : m.id));
                            if (!forwardTargets) setForwardTargets(await getForwardTargets(channelId));
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                        >
                          <Share2 className="size-3.5" /> Reenviar a…
                        </button>
                        {forwardFor === m.id ? (
                          <div className="mt-1 max-h-40 overflow-y-auto border-t border-border pt-1">
                            {forwardDone === m.id ? (
                              <p className="px-2 py-1.5 text-emerald-600 dark:text-emerald-400">Reenviado ✓</p>
                            ) : forwardTargets == null ? (
                              <p className="px-2 py-1.5 text-muted-foreground">Cargando…</p>
                            ) : forwardTargets.length === 0 ? (
                              <p className="px-2 py-1.5 text-muted-foreground">Este chat no pertenece a un cliente (no hay chats hermanos).</p>
                            ) : (
                              forwardTargets.map((t) => (
                                <button
                                  key={t.id}
                                  onClick={async () => {
                                    const r = await forwardMessage(m.id, t.id);
                                    if (r.ok) setForwardDone(m.id);
                                  }}
                                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                                >
                                  <Share2 className="size-3 shrink-0 text-muted-foreground" /> <span className="truncate">{t.name}</span>
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                        {mine ? (
                          <button onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; setEditing(m.id); setEditText(m.body); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted">
                            <Pencil className="size-3.5" /> Editar
                          </button>
                        ) : null}
                        {mine || isAdmin ? (
                          <button onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; removeMsg(m.id); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-muted">
                            <Trash2 className="size-3.5" /> Borrar
                          </button>
                        ) : null}
                      </div>
                    </details>
                  </div>
                ) : null}
                {editing === m.id ? (
                  <div className="mt-0.5 w-full max-w-2xl">
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                    <div className="mt-1 flex gap-2">
                      <button onClick={() => saveEdit(m.id)} className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground"><Check className="size-3" /> Guardar</button>
                      <button onClick={() => setEditing(null)} className="text-xs text-muted-foreground">Cancelar</button>
                    </div>
                  </div>
                ) : m.body && m.body !== ATTACH_PLACEHOLDER ? (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
                    {renderBody(m.body, highlightPool)}
                    {m.editedAt ? <span className="ml-1 text-xs text-muted-foreground">(editado)</span> : null}
                  </p>
                ) : null}
                <Attachments items={m.attachments} author={m.author} projectId={projectId} readOnly={readOnly} canArchive={canArchive} onArchived={markArchived} />
                {m.poll ? (
                  <PollWidget poll={m.poll} myOptionId={myVotes[m.poll.id] ?? null} onVote={(opt) => vote(m.poll!.id, opt)} />
                ) : null}

                {/* Pie SOLO cuando hay contenido real (reacciones o respuestas): nunca aparece
                    ni desaparece con el mouse — reaccionar/responder viven en la barra flotante. */}
                {hasFooter ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {(m.reactions?.length ?? 0) > 0 || !readOnly ? (
                      <Reactions reactions={m.reactions} meId={me.id} onToggle={(e) => react(m.id, e)} />
                    ) : null}
                    <button
                      onClick={toggleThread}
                      className="inline-flex items-center gap-1 py-0.5 text-xs font-medium text-muted-foreground hover:text-primary"
                    >
                      <MessageSquare className="size-3" />
                      {replies.length > 0 ? `${replies.length} respuesta${replies.length === 1 ? "" : "s"}` : "Responder"}
                    </button>
                  </div>
                ) : null}

                {open ? (
                  <div className="mt-2 w-full space-y-2 self-stretch border-l-2 border-border pl-3 text-left">
                    {replies.map((r) => (
                      <div key={r.id} className="flex gap-2">
                        <UserAvatar initials={r.author?.initials} name={r.author?.name} color={r.author?.color} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold">{isMine(r.author) ? "Tú" : r.author?.name ?? "Sistema"}</span>
                            <span suppressHydrationWarning className="text-xs text-muted-foreground">{hhmm(r.createdAt)}</span>
                            {statusTag(r.status)}
                          </div>
                          {/* Mismo render que los mensajes raíz (enlaces, menciones y formato). */}
                          <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{renderBody(r.body, highlightPool)}</p>
                          <Attachments items={r.attachments} author={r.author} projectId={projectId} readOnly={readOnly} canArchive={canArchive} onArchived={markArchived} />
                          {r.poll ? (
                            <PollWidget poll={r.poll} myOptionId={myVotes[r.poll.id] ?? null} onVote={(opt) => vote(r.poll!.id, opt)} />
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {!readOnly ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          submitText(replyText[m.id] ?? "", m.id);
                          setReplyText((p) => ({ ...p, [m.id]: "" }));
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          value={replyText[m.id] ?? ""}
                          onChange={(e) => setReplyText((p) => ({ ...p, [m.id]: e.target.value }))}
                          placeholder="Responder en el hilo…"
                          className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                        />
                        <button className="text-xs font-medium text-primary disabled:opacity-40" disabled={!(replyText[m.id] ?? "").trim()}>
                          Enviar
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            )}
            {/* «Visto por N» bajo mi último mensaje: quién del canal ya lo vio (lastReadAt). */}
            {m.id === lastMineId && seenByForLast.length > 0 ? (
              <div className="mt-0.5 flex items-center gap-1.5 pl-11 text-[11px] text-muted-foreground" title={`Visto por ${seenByForLast.map((r) => r.name).join(", ")}`}>
                <span className="flex -space-x-1.5">
                  {seenByForLast.slice(0, 5).map((r) => (
                    <UserAvatar key={r.id} initials={r.initials} name={r.name} color={r.color} size="sm" ring />
                  ))}
                </span>
                <span>Visto por {seenByForLast.length}</span>
              </div>
            ) : null}
            </React.Fragment>
          );
        })}
        </div>
      </div>

      {!online ? (
        <p className="bg-amber-500/10 px-4 py-1 text-center text-[11px] text-amber-600 dark:text-amber-400">
          Sin conexión — los mensajes se enviarán al reconectar
        </p>
      ) : conn === "reconnecting" ? (
        <p className="bg-amber-500/10 px-4 py-1 text-center text-[11px] text-amber-600 dark:text-amber-400">
          Reconectando con el chat… los mensajes nuevos aparecerán al volver
        </p>
      ) : conn === "revoked" ? (
        <p className="bg-destructive/10 px-4 py-1 text-center text-[11px] text-destructive">
          Perdiste acceso a este canal — ya no recibirás mensajes nuevos
        </p>
      ) : null}

      {Object.keys(typingNames).length > 0 ? (
        <p className="flex items-center gap-1.5 px-4 py-0.5 text-[11px] italic text-muted-foreground">
          <span>{Object.keys(typingNames).join(", ")} {Object.keys(typingNames).length === 1 ? "está" : "están"} escribiendo</span>
          <span className="inline-flex items-end gap-0.5" aria-hidden>
            <span className="size-1 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
            <span className="size-1 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
            <span className="size-1 animate-bounce rounded-full bg-muted-foreground/60" />
          </span>
        </p>
      ) : null}

      {!readOnly ? (
       <div className="border-t border-border pb-[env(safe-area-inset-bottom)]">
        {pollMode ? (
          <form onSubmit={submitPoll} className="space-y-2 border-b border-border p-3">
            <input
              value={pollQ}
              onChange={(e) => setPollQ(e.target.value)}
              placeholder="Pregunta de la encuesta…"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            {pollOpts.map((o, i) => (
              <input
                key={i}
                value={o}
                onChange={(e) => setPollOpts((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`Opción ${i + 1}`}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            ))}
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setPollOpts((p) => [...p, ""])} className="text-xs font-medium text-primary">
                + Opción
              </button>
              <span className="flex-1" />
              <button type="button" onClick={() => setPollMode(false)} className="text-xs text-muted-foreground">
                Cancelar
              </button>
              <button className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                Crear encuesta
              </button>
            </div>
          </form>
        ) : null}
        <div ref={composerWrapRef} className="relative mx-auto w-full max-w-3xl">
        {mentionMatches.length > 0 ? (
          <div className="absolute bottom-full left-3 z-40 mb-1 w-72 max-w-[calc(100%-1.5rem)] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl ring-1 ring-black/5">
            <p className="border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">Mencionar a…</p>
            <div className="max-h-56 overflow-y-auto py-1">
              {mentionMatches.map((mem, idx) => {
                return (
                  <button
                    key={mem.id}
                    type="button"
                    onMouseEnter={() => setMentionIndex(idx)}
                    onClick={() => insertMention(mem.name)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                      idx === mentionIndex ? "bg-primary/10" : "hover:bg-muted",
                    )}
                  >
                    {mem.hint ? (
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"><AtSign className="size-3.5" /></span>
                    ) : (
                      <UserAvatar initials={mem.initials} name={mem.name} color={mem.color} size="sm" />
                    )}
                    <span className="truncate font-medium">{mem.hint ? mem.name : mentionLabel(mem.name)}</span>
                    {mem.hint ? <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground">{mem.hint}</span> : null}
                  </button>
                );
              })}
            </div>
            <p className="border-t border-border px-3 py-1 text-[10px] text-muted-foreground">↑↓ moverse · Enter elegir · Esc cerrar</p>
          </div>
        ) : null}
        <form onSubmit={submitMain} className="p-3">
          {attachErr ? (
            <div className="mb-2 flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <span>{attachErr}</span>
              <button type="button" onClick={() => setAttachErr(null)} className="shrink-0 font-medium hover:underline">Cerrar</button>
            </div>
          ) : null}
          {files.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs">
                  <FileText className="size-3" /> {f.name}
                  <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-card px-2 py-1.5">
            {recording ? (
              <div className="flex w-full items-center gap-3 px-1 py-1.5">
                <button type="button" onClick={() => finishRecording(false)} className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Cancelar grabación" title="Cancelar">
                  <Trash2 className="size-5" />
                </button>
                <span className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
                  <span className="size-2.5 animate-pulse rounded-full bg-rose-500" />
                  Grabando… {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, "0")}
                </span>
                <button type="button" onClick={() => finishRecording(true)} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label="Enviar nota de voz" title="Enviar nota de voz">
                  <Send className="size-4" />
                </button>
              </div>
            ) : (
            <>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Adjuntar archivo"
              title="Adjuntar archivo"
            >
              <Paperclip className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => setPollMode((v) => !v)}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-muted hover:text-foreground",
                pollMode ? "text-primary" : "text-muted-foreground",
              )}
              aria-label="Crear encuesta"
              title="Crear encuesta"
            >
              <BarChart3 className="size-5" />
            </button>
            <div className="shrink-0">
              <button
                ref={emojiBtnRef}
                type="button"
                onClick={() => setEmojiOpen((v) => !v)}
                className={cn("flex size-9 items-center justify-center rounded-full hover:bg-muted hover:text-foreground", emojiOpen ? "text-primary" : "text-muted-foreground")}
                aria-label="Emojis"
                title="Emojis"
              >
                <Smile className="size-5" />
              </button>
              {emojiOpen ? (
                <EmojiPicker anchorRef={emojiBtnRef} onClose={() => setEmojiOpen(false)} onPick={(e) => { setText((t) => t + e); setEmojiOpen(false); }} />
              ) : null}
            </div>
            <textarea
              ref={composerRef}
              value={text}
              onChange={(e) => onComposerChange(e.target.value)}
              onKeyDown={(e) => {
                // Con el menú de @menciones abierto, el teclado navega/elige (no envía).
                if (mentionMatches.length > 0) {
                  if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionMatches.length); return; }
                  if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
                  if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionMatches[Math.min(mentionIndex, mentionMatches.length - 1)].name); return; }
                  if (e.key === "Escape") { e.preventDefault(); setMentionQuery(null); return; }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={1}
              placeholder={uploading ? "Subiendo…" : "Escribe un mensaje…  (@ menciona · Enter envía · Shift+Enter salto)"}
              disabled={uploading}
              enterKeyHint="send"
              className={cn(
                "max-h-48 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-1 text-base outline-none placeholder:text-muted-foreground sm:text-sm",
                // Vacío: el placeholder es largo y, al envolverse, hacía que el cuadro arrancara con
                // varias líneas de alto. Forzamos UNA línea con elipsis (…) — esto también deja el
                // scrollHeight en 1 línea, así que el auto-crecimiento ya no infla la altura inicial.
                // Al escribir (text != "") se quita y el texto vuelve a envolver y crecer normal.
                !text && "overflow-x-hidden whitespace-nowrap text-ellipsis",
              )}
            />
            {text.trim() || files.length > 0 ? (
              <button
                type="submit"
                disabled={uploading}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                aria-label="Enviar"
              >
                <Send className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={startRecording}
                disabled={uploading}
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                aria-label="Grabar nota de voz"
                title="Grabar nota de voz"
              >
                <Mic className="size-5" />
              </button>
            )}
            </>
            )}
          </div>
        </form>
        </div>
       </div>
      ) : null}
    </div>
  );
}
