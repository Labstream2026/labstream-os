"use client";

import * as React from "react";
import Link from "next/link";
import { Send, MessageSquare, Paperclip, FileText, FileSpreadsheet, Presentation, FileType, File as FileIcon, Download, Pencil, Eye, X, BarChart3, Smile, SmilePlus, Pin, Trash2, MoreVertical, MoreHorizontal, Search, Check, Mic, Camera, ChevronDown, ChevronRight, Reply, CornerUpLeft, ListChecks, Share2, Link2, AtSign, FolderPlus, Loader2, Sparkles } from "lucide-react";
import { ActivityFeed, type ActivityItem } from "@/app/(app)/proyectos/[id]/activity-feed";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { formatBogota } from "@/lib/bogota-time";
import { sendMessage, sendMessageWithAttachments, createPoll, votePoll, toggleReaction, editMessage, deleteMessage, togglePin, notifyTyping, markChannelRead, markThreadRead, clearConversation, forwardMessage, getForwardTargets, archiveChatAttachment, getChannelReaders, createTaskFromMessage, type ChannelReader } from "@/app/(app)/chat/actions";
import { useRouter } from "next/navigation";
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
  // Cita estilo WhatsApp: a qué mensaje responde (autor + snippet). null = citado no disponible.
  quoted?: { id: string; author: string | null; body: string } | null;
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

// Panel deslizante de ACTIVIDAD del proyecto (destino al pulsar la barra de estado viva). Reusa el
// mismo timeline del proyecto (ActivityFeed). Se superpone al canal; el fondo cierra al tocarlo.
function ActivityPanel({
  items,
  status,
  onClose,
}: {
  items: ActivityItem[];
  status: { label: string; className: string } | null;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Actividad del proyecto">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="flex-1 bg-black/25 backdrop-blur-[1px]" />
      <div className="flex w-full max-w-sm flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-semibold">Actividad del proyecto</span>
            {status ? (
              <span className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.className}`}>{status.label}</span>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <ActivityFeed items={items} />
        </div>
      </div>
    </div>
  );
}

type MyThread = { rootId: string; channelId: string; channelName: string; author: { name: string; initials: string | null; color: string | null } | null; body: string; totalReplies: number; newCount: number; latestReplyAt: string };

// Panel «Mis hilos»: los hilos donde participo, con las respuestas nuevas destacadas. Clic → si el
// hilo es de ESTE canal salta a él; si es de otro, navega a ese canal en el mensaje raíz.
function ThreadsPanel({
  threads,
  currentChannelId,
  onOpenLocal,
  onNavigate,
  onClose,
}: {
  threads: MyThread[];
  currentChannelId: string;
  onOpenLocal: (rootId: string) => void;
  onNavigate: (channelId: string, rootId: string) => void;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="Mis hilos">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="flex-1 bg-black/25 backdrop-blur-[1px]" />
      <div className="flex w-full max-w-sm flex-col border-l border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="size-4 text-muted-foreground" /> Mis hilos</span>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {threads.length === 0 ? (
            <p className="px-3 py-10 text-center text-xs text-muted-foreground">Aún no sigues ningún hilo. Cuando respondas dentro de un hilo, aparecerá aquí con sus respuestas nuevas.</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.rootId}
                type="button"
                onClick={() => (t.channelId === currentChannelId ? onOpenLocal(t.rootId) : onNavigate(t.channelId, t.rootId))}
                className="flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <span className="truncate text-[11px] font-medium text-muted-foreground">#{t.channelName}</span>
                  {t.newCount > 0 ? (
                    <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary-foreground">{t.newCount} nueva{t.newCount === 1 ? "" : "s"}</span>
                  ) : (
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{t.totalReplies} resp.</span>
                  )}
                </span>
                <span className="flex items-start gap-2">
                  {t.author ? <UserAvatar initials={t.author.initials} name={t.author.name} color={t.author.color} size="sm" /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-xs text-foreground">{t.body || "(sin texto)"}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">{formatBogota(t.latestReplyAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
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
  const [threadFiles, setThreadFiles] = React.useState<Record<string, File[]>>({}); // adjuntos por hilo
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
  // Búsqueda server-side en TODO el historial del canal (no solo lo ya cargado): resultados + estado.
  const [searchResults, setSearchResults] = React.useState<ChatMsg[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  // Salto pendiente a un mensaje recién traído con ?around= (espera a que se pinte en el DOM).
  const [pendingJump, setPendingJump] = React.useState<string | null>(null);
  // Paginación hacia atrás: el fetch inicial trae solo la ventana reciente; estos permiten
  // cargar el historial anterior por demanda sin recargar la página.
  const [hasOlder, setHasOlder] = React.useState(initialMessages.length >= 50);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [typingNames, setTypingNames] = React.useState<Record<string, number>>({}); // name → expiry ts
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const topSentinelRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
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
  const draftKey = `labstream-chat-draft:${channelId}`;
  // Nota de voz grabada, a la espera de escucharla/enviarla/descartarla (preview antes de mandar).
  const [voicePreview, setVoicePreview] = React.useState<{ url: string; file: File } | null>(null);
  // Se está arrastrando un archivo sobre el chat (para resaltar la zona de soltar).
  const [dragOver, setDragOver] = React.useState(false);
  // ¿El scroll está al fondo? y cuántos mensajes llegaron mientras leías historial arriba (para
  // el botón flotante «ir al último N»).
  const [atBottom, setAtBottom] = React.useState(true);
  const [newCount, setNewCount] = React.useState(0);
  // Cita estilo WhatsApp: el mensaje al que estás respondiendo (se muestra sobre el composer).
  const [quoting, setQuoting] = React.useState<ChatMsg | null>(null);
  // «Crear tarea» desde un mensaje: id del mensaje → estado del intento (para el feedback inline).
  const [taskFrom, setTaskFrom] = React.useState<{ id: string; state: "loading" | "done" | "error"; projectId?: string; error?: string } | null>(null);
  // Reenviar a otro canal del mismo cliente: destinos perezosos + estado por mensaje.
  const [forwardFor, setForwardFor] = React.useState<string | null>(null);
  const [forwardTargets, setForwardTargets] = React.useState<{ id: string; name: string }[] | null>(null);
  const [forwardDone, setForwardDone] = React.useState<string | null>(null);
  // Permalink: mensaje resaltado al llegar con ?msg=... (se apaga solo).
  const [highlighted, setHighlighted] = React.useState<string | null>(null);
  // «Visto por»: lectores del canal (lastReadAt). Se refresca al montar, al cambiar los mensajes
  // (con debounce) y al volver a la pestaña. Vacío en DMs (no aplica) y hasta la 1ª carga.
  const [readers, setReaders] = React.useState<ChannelReader[]>([]);
  // Barra de estado viva: el pulso del proyecto (antes mensajes del bot) vive aquí, no en el hilo.
  // Datos iniciales del endpoint /activity; eventos nuevos llegan por SSE (kind "activity").
  const [actStatus, setActStatus] = React.useState<{ label: string; className: string } | null>(null);
  const [actItems, setActItems] = React.useState<ActivityItem[]>([]);
  const [actReady, setActReady] = React.useState(false);
  const [actNew, setActNew] = React.useState(0); // novedades desde la última vez que se abrió el panel
  const [actOpen, setActOpen] = React.useState(false);
  const [actFlash, setActFlash] = React.useState(false); // realce breve al llegar una novedad
  const actOpenRef = React.useRef(false); // evita cerrar sobre estado viejo en el handler del SSE
  // «Ponerte al día»: resumen de lo que te perdiste desde la última lectura (initialLastReadAt).
  type CatchupData = { total: number; authors: { name: string; count: number }[]; mentionedYou: boolean; summary: string[] | null };
  const [catchup, setCatchup] = React.useState<CatchupData | null>(null);
  const [catchupLoading, setCatchupLoading] = React.useState(false);
  const [catchupDismissed, setCatchupDismissed] = React.useState(false);
  // «Mis hilos» + badge de respuestas nuevas (hilos donde participo, cross-canal).
  const router = useRouter();
  const [myThreads, setMyThreads] = React.useState<MyThread[]>([]);
  const [threadsOpen, setThreadsOpen] = React.useState(false);

  const roots = messages
    .filter((m) => !m.parentId)
    // Ordenar por fecha: el render depende del orden del array; así los mensajes que lleguen
    // por SSE/catch-up/paginación fuera de orden quedan siempre cronológicos (como las respuestas).
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const repliesFor = (id: string) =>
    messages.filter((m) => m.parentId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pinned = messages.filter((m) => m.pinned && !m.parentId);
  // Respuestas nuevas por hilo (badge en el indicador «N respuestas» y en el botón «Mis hilos»).
  const threadNew = new Map(myThreads.filter((t) => t.newCount > 0).map((t) => [t.rootId, t.newCount] as const));

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

  // «Visto por»: refresca los lectores al montar, al cambiar los mensajes (debounce 1,2 s), al
  // volver a la pestaña, Y con un latido cada 15 s mientras la pestaña está visible — sin este
  // último, si alguien LEE tu último mensaje sin escribir otro y tu pestaña sigue enfocada, el
  // acuse nunca aparecía (no cambia messages.length ni hay visibilitychange). El servidor
  // devuelve [] en DMs y difusión, así que ahí «readers» queda vacío y no se pinta nada.
  React.useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      getChannelReaders(channelId)
        .then((r) => { if (!cancelled) setReaders(r); })
        .catch(() => {});
    };
    const t = setTimeout(load, 1200);
    const beat = setInterval(load, 15000);
    const onVis = () => load();
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; clearTimeout(t); clearInterval(beat); document.removeEventListener("visibilitychange", onVis); };
  }, [channelId, messages.length]);

  // Borrador persistente por canal: al abrir un canal se restaura lo que estabas escribiendo (no
  // se pierde al saltar entre chats). Se guarda en onComposerChange y se limpia al enviar.
  // Como la página /chat/[id] NO remonta ChannelChat al cambiar de canal (el estado `text`
  // persiste), se asigna SIEMPRE el borrador del canal actual (o "" si no tiene) — así un canal
  // sin borrador no hereda el texto del canal anterior.
  React.useEffect(() => {
    const restore = () => {
      try {
        setText(window.localStorage.getItem(draftKey) ?? "");
      } catch {
        /* localStorage no disponible */
      }
    };
    restore();
  }, [draftKey]);

  // Al desmontar (o cambiar de canal), suelta la URL de la nota de voz en preview.
  React.useEffect(() => {
    return () => {
      if (voicePreview) URL.revokeObjectURL(voicePreview.url);
    };
  }, [voicePreview]);

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

  // Saltar a un mensaje concreto (fijado, resultado…): lo centra y lo resalta 2,6 s. Si no está
  // en la ventana cargada no hace nada (el permalink ?msg= sí pagina; aquí basta el salto local).
  const jumpToMessage = React.useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlighted(id);
    setTimeout(() => setHighlighted(null), 2600);
  }, []);

  const upsert = React.useCallback((m: ChatMsg) => {
    setMessages((prev) =>
      prev.some((x) => x.id === m.id) ? prev.map((x) => (x.id === m.id ? m : x)) : [...prev, m],
    );
  }, []);

  // Abrir un hilo de «Mis hilos» que está en ESTE canal: cierra el panel, abre el hilo, lo marca
  // leído y salta al mensaje raíz. Los de OTRO canal navegan a ese canal en el raíz (?msg=).
  const openLocalThread = React.useCallback((rootId: string) => {
    setThreadsOpen(false);
    setOpenThreads((prev) => new Set(prev).add(rootId));
    void markThreadRead(rootId);
    setMyThreads((ts) => ts.map((t) => (t.rootId === rootId ? { ...t, newCount: 0 } : t)));
    setTimeout(() => jumpToMessage(rootId), 60);
  }, [jumpToMessage]);
  const navigateThread = React.useCallback((chId: string, rootId: string) => {
    router.push(`/chat/${chId}?msg=${rootId}`);
  }, [router]);

  // Espejo de mensajes para leer el último/primer createdAt sin recrear callbacks por cada cambio.
  const messagesRef = React.useRef(messages);
  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // ── Búsqueda en el historial COMPLETO (server-side) ──
  // Antes la lupa solo filtraba los mensajes ya cargados: lo viejo era imposible de encontrar. Ahora
  // consulta la BD (debounced) y, al hacer clic en un resultado, salta a él aunque no esté cargado.
  React.useEffect(() => {
    let cancelled = false;
    // Todo el setState va DENTRO del callback diferido (nunca síncrono en el cuerpo del efecto).
    const run = async () => {
      const term = search.trim();
      if (!searchOpen || term.length < 2) {
        if (!cancelled) {
          setSearchResults(null);
          setSearching(false);
        }
        return;
      }
      if (!cancelled) setSearching(true);
      try {
        const res = await fetch(`/api/chat/${channelId}/messages?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        const data = res.ok ? await res.json() : null;
        if (!cancelled) setSearchResults(Array.isArray(data?.results) ? data.results : []);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    };
    const t = setTimeout(run, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, searchOpen, channelId]);

  // Carga inicial de la actividad del proyecto (solo canales de proyecto). El setState va dentro de
  // load() (nunca síncrono en el cuerpo del efecto). Los eventos nuevos llegan luego por SSE.
  React.useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/chat/${channelId}/activity`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.projectId) return;
        setActStatus(data.status ?? null);
        setActItems(Array.isArray(data.items) ? data.items : []);
        setActReady(true);
      } catch {
        /* best-effort: si falla, simplemente no aparece la barra */
      }
    };
    load();
    return () => { cancelled = true; };
  }, [channelId, projectId]);

  // Espejo del estado del panel para leerlo desde el handler del SSE sin recrearlo (no es setState).
  React.useEffect(() => { actOpenRef.current = actOpen; }, [actOpen]);

  // «Ponerte al día»: si al abrir el canal hay bastantes mensajes sin leer, pide a Marcebot un
  // resumen de lo que te perdiste. setState solo dentro de load() (nunca síncrono en el efecto).
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setCatchup(null);
      setCatchupDismissed(false);
      if (!initialLastReadAt) return;
      const since = new Date(initialLastReadAt).getTime();
      // ¿Hay suficiente sin leer? (ajeno, no borrado, posterior a la última lectura.)
      const unread = messagesRef.current.filter(
        (m) => !m.deleted && new Date(m.createdAt).getTime() > since && !(m.author && m.author.name === me.name && m.author.color === me.color),
      ).length;
      if (unread < 3) return;
      setCatchupLoading(true);
      try {
        const res = await fetch(`/api/chat/${channelId}/catchup?since=${encodeURIComponent(initialLastReadAt)}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && data?.total >= 1) setCatchup(data);
        }
      } catch {
        /* best-effort: sin resumen si falla */
      } finally {
        if (!cancelled) setCatchupLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [channelId, initialLastReadAt, me.name, me.color]);

  // «Mis hilos»: hilos donde participo, con respuestas nuevas. Se refresca al cambiar de canal y al
  // abrir el panel. setState dentro de load() (nunca síncrono en el cuerpo del efecto).
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/chat/threads`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data?.threads)) setMyThreads(data.threads);
        }
      } catch {
        /* best-effort */
      }
    };
    load();
    return () => { cancelled = true; };
  }, [channelId, threadsOpen]);

  // Abrir un resultado: si ya está cargado va directo; si no, trae su VENTANA (?around=), la fusiona
  // y deja el salto pendiente hasta que el mensaje aparezca pintado. Cierra la búsqueda al saltar.
  const openResult = React.useCallback(
    async (id: string) => {
      if (messagesRef.current.some((m) => m.id === id)) {
        jumpToMessage(id);
      } else {
        try {
          const res = await fetch(`/api/chat/${channelId}/messages?around=${encodeURIComponent(id)}`, { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            const incoming: ChatMsg[] = data?.messages ?? [];
            if (incoming.length) {
              setMessages((prev) => {
                const ids = new Set(prev.map((m) => m.id));
                const add = incoming.filter((m) => !ids.has(m.id)).map((m) => ({ ...m, status: "sent" as const }));
                return add.length ? [...prev, ...add] : prev;
              });
              setHasOlder(true); // puede haber historial más viejo por encima de la ventana traída
            }
          }
        } catch {
          /* best-effort: si falla la ventana, al menos cerramos la búsqueda */
        }
        setPendingJump(id);
      }
      setSearchOpen(false);
      setSearch("");
      setSearchResults(null);
    },
    [channelId, jumpToMessage],
  );

  // Ejecuta el salto pendiente en cuanto el mensaje objetivo ya está en el DOM (tras fusionar la
  // ventana). Diferido a rAF: espera al pintado antes de hacer scroll y evita el setState síncrono.
  React.useEffect(() => {
    if (!pendingJump || !document.getElementById(`msg-${pendingJump}`)) return;
    const raf = requestAnimationFrame(() => {
      jumpToMessage(pendingJump);
      setPendingJump(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, pendingJump, jumpToMessage]);

  // ¿El scroll está (casi) al fondo? Se usa para no arrancar al usuario que lee historial arriba.
  const nearBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // Teclado en pantalla (iOS/PWA): iOS NO encoge el layout al abrir el teclado (interactiveWidget
  // solo lo respeta Android), así que el composer quedaría tapado. Se compensa con visualViewport:
  // se añade al fondo del chat un padding = alto del teclado, empujando el composer justo encima.
  // Solo en móvil (< 768px) para no afectar el escritorio ni el dock.
  React.useEffect(() => {
    const vv = window.visualViewport;
    const el = rootRef.current;
    if (!vv || !el) return;
    const apply = () => {
      const kb = window.innerWidth < 768 ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      el.style.paddingBottom = kb > 0 ? `${kb}px` : "";
      if (kb > 0 && nearBottom()) scrollToBottom();
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      el.style.paddingBottom = "";
    };
  }, [nearBottom, scrollToBottom]);

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

  // Carga infinita hacia arriba: cuando la sentinela del tope entra en vista (con margen), carga
  // el historial anterior sola (loadOlder ya preserva la posición del scroll). El botón manual
  // sigue de respaldo. rootMargin adelanta la carga un poco antes de llegar al borde.
  React.useEffect(() => {
    const sentinel = topSentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasOlder) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting && !loadingOlder) void loadOlder(); },
      { root, rootMargin: "300px 0px 0px 0px" },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasOlder, loadingOlder, loadOlder]);

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
        if (data?.kind === "activity") {
          // Barra de estado viva: una novedad del proyecto (ya NO como mensaje del bot en el hilo).
          const it = data.item as ActivityItem;
          setActItems((prev) => (prev.some((x) => x.id === it.id) ? prev : [it, ...prev].slice(0, 60)));
          if (!actOpenRef.current) setActNew((n) => n + 1); // no molesta si el panel ya está abierto
          setActReady(true); // aparece la barra aunque el canal no tuviera actividad previa
          setActFlash(true);
          window.setTimeout(() => setActFlash(false), 1000);
          return;
        }
        const m = data as ChatMsg;
        upsert({ ...m, status: "sent", reactions: m.reactions ?? [] });
        // Solo arrastra al fondo si el lector YA estaba al fondo (o si el mensaje es mío):
        // leer historial arriba no debe interrumpirse por cada mensaje entrante.
        if (!m.parentId && (nearBottom() || isMine(m.author))) scrollToBottom();
        // Mensaje AJENO llegado mientras lees arriba: cuenta para el botón «ir al último N».
        else if (!m.parentId && !isMine(m.author)) setNewCount((n) => n + 1);
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
      const queued: { tempId: string; body: string; parentId: string | null; quotedId?: string | null }[] = JSON.parse(raw);
      localStorage.removeItem(queueKey);
      for (const q of queued) await deliver(q.tempId, q.body, q.parentId, q.quotedId ?? null);
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

  function persist(tempId: string, body: string, parentId: string | null, quotedId?: string | null) {
    const arr = JSON.parse(localStorage.getItem(queueKey) || "[]");
    arr.push({ tempId, body, parentId, quotedId: quotedId ?? null });
    localStorage.setItem(queueKey, JSON.stringify(arr));
  }
  function unpersist(tempId: string) {
    const arr = JSON.parse(localStorage.getItem(queueKey) || "[]").filter(
      (x: { tempId: string }) => x.tempId !== tempId,
    );
    localStorage.setItem(queueKey, JSON.stringify(arr));
  }

  async function deliver(tempId: string, body: string, parentId: string | null, quotedId?: string | null) {
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "sending" } : m)));
    try {
      const real = await sendMessage(channelId, body, parentId, detectMentions(body, members), quotedId ?? null);
      if (!real) return;
      unpersist(tempId);
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        if (withoutTemp.some((m) => m.id === real.id)) return withoutTemp;
        return [...withoutTemp, { ...real, status: "sent" }];
      });
    } catch {
      persist(tempId, body, parentId, quotedId);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: navigator.onLine ? "error" : "pending" } : m)),
      );
    }
  }

  function submitText(body: string, parentId: string | null, quotedId?: string | null, quotedPreview?: ChatMsg["quoted"]) {
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
        quoted: quotedPreview ?? null,
      },
    ]);
    if (!parentId) scrollToBottom();
    if (!navigator.onLine) {
      persist(tempId, clean, parentId, quotedId);
      return;
    }
    void deliver(tempId, clean, parentId, quotedId);
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

  // Pegar una imagen del portapapeles (Ctrl/⌘+V) directo al chat — flujo diario en una productora
  // (pantallazo de un fotograma). Los items de imagen del clipboard entran como adjuntos.
  function onComposerPaste(e: React.ClipboardEvent) {
    const imgs = Array.from(e.clipboardData?.items ?? [])
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    if (imgs.length) {
      e.preventDefault();
      // El pantallazo suele venir sin nombre útil: le ponemos uno legible con la hora.
      addFiles(imgs.map((f) => (f.name && f.name !== "image.png" ? f : new File([f], `pegado-${Date.now()}.${(f.type.split("/")[1] || "png")}`, { type: f.type }))));
    }
  }
  // Arrastrar y soltar archivos sobre el chat.
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (dropped.length) addFiles(dropped);
  }

  // ¿El adjunto es una imagen? → miniatura previa en el chip (en vez del icono genérico).
  const imgPreviews = React.useMemo(() => {
    const map = new Map<File, string>();
    for (const f of files) if (f.type.startsWith("image/")) map.set(f, URL.createObjectURL(f));
    return map;
  }, [files]);
  React.useEffect(() => {
    return () => { for (const url of imgPreviews.values()) URL.revokeObjectURL(url); };
  }, [imgPreviews]);

  // Responder EN EL HILO con composer completo (texto multilínea + adjuntos). Estado propio por hilo
  // → no toca el composer principal. Reusa los caminos probados: sendMessageWithAttachments si hay
  // archivos (con parentId), si no submitText. Las menciones se detectan del texto en el servidor.
  async function sendThreadReply(parentId: string) {
    const body = (replyText[parentId] ?? "").trim();
    const tfiles = threadFiles[parentId] ?? [];
    if (!body && tfiles.length === 0) return;
    setReplyText((p) => ({ ...p, [parentId]: "" }));
    setThreadFiles((p) => ({ ...p, [parentId]: [] }));
    if (tfiles.length > 0) {
      const fd = new FormData();
      fd.set("channelId", channelId);
      fd.set("body", body);
      fd.set("parentId", parentId);
      tfiles.forEach((f) => fd.append("files", f));
      try {
        const saved = await sendMessageWithAttachments(fd);
        if (saved) upsert({ ...saved, status: "sent", reactions: saved.reactions ?? [] });
        else { setReplyText((p) => ({ ...p, [parentId]: body })); setThreadFiles((p) => ({ ...p, [parentId]: tfiles })); } // restaurar si falló
      } catch {
        setReplyText((p) => ({ ...p, [parentId]: body }));
        setThreadFiles((p) => ({ ...p, [parentId]: tfiles }));
      }
    } else {
      submitText(body, parentId);
    }
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
      if (quoting) fd.set("quotedId", quoting.id);
      sentFiles.forEach((f) => fd.append("files", f));
      setUploading(true);
      setAttachErr(null);
      setText("");
      setFiles([]);
      setQuoting(null);
      clearDraft();
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
    submitText(
      text,
      null,
      quoting?.id ?? null,
      quoting ? { id: quoting.id, author: quoting.author?.name ?? null, body: quoting.body.slice(0, 160) } : null,
    );
    setText("");
    setQuoting(null);
    clearDraft();
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
  // Detener la grabación: keep=false cancela; keep=true pasa la nota a PREVIEW (para escucharla
  // antes de mandarla), no la envía directo (antes finishRecording(true) subía al instante).
  function finishRecording(keep: boolean) {
    const mr = recRef.current;
    setRecording(false);
    if (!mr) { stopRecCleanup(); return; }
    mr.onstop = () => {
      // mr.mimeType puede venir vacío en iOS; usamos el tipo del primer chunk o caemos a mp4
      // (formato nativo de iOS), NO a webm —que iOS no graba— para no mal-etiquetar el archivo.
      const type = mr.mimeType || recChunks.current[0]?.type || "audio/mp4";
      const blob = new Blob(recChunks.current, { type });
      recChunks.current = [];
      recRef.current = null;
      stopRecCleanup();
      if (!keep || blob.size === 0) return;
      const ext = type.includes("webm") ? "weba" : type.includes("ogg") ? "ogg" : "m4a";
      const file = new File([blob], `nota-de-voz-${Date.now()}.${ext}`, { type });
      setVoicePreview({ url: URL.createObjectURL(file), file });
    };
    try { mr.stop(); } catch { stopRecCleanup(); }
  }
  // Descartar la nota de voz en preview (sin enviarla).
  function discardVoice() {
    if (voicePreview) URL.revokeObjectURL(voicePreview.url);
    setVoicePreview(null);
  }
  // Enviar la nota de voz que está en preview.
  async function sendVoice() {
    if (!voicePreview) return;
    const file = voicePreview.file;
    URL.revokeObjectURL(voicePreview.url);
    setVoicePreview(null);
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
  }
  React.useEffect(() => () => stopRecCleanup(), []);

  // Cambio del texto del composer: dispara "escribiendo…" (throttle), detecta @menciones y guarda
  // el borrador del canal (para que sobreviva a cambiar de chat).
  function onComposerChange(v: string) {
    setText(v);
    try {
      if (v) window.localStorage.setItem(draftKey, v);
      else window.localStorage.removeItem(draftKey);
    } catch {
      /* localStorage no disponible */
    }
    const now = Date.now();
    if (now - lastTypingRef.current > 2500) {
      lastTypingRef.current = now;
      void notifyTyping(channelId);
    }
    const m = /(?:^|\s)@([\p{L}0-9]*)$/u.exec(v);
    setMentionQuery(m ? m[1] : null);
  }
  // Vacía el borrador guardado (al enviar): el texto ya se limpia con setText("").
  function clearDraft() {
    try { window.localStorage.removeItem(draftKey); } catch { /* ignore */ }
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
    <div
      ref={rootRef}
      className="relative flex h-full flex-col"
      onDragOver={readOnly ? undefined : (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={readOnly ? undefined : (e) => { if (e.currentTarget === e.target) setDragOver(false); }}
      onDrop={readOnly ? undefined : onDrop}
    >
      {dialog}
      {/* Soltar archivos: overlay de destino mientras se arrastra algo sobre el chat. */}
      {dragOver ? (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm">
          <span className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg">Suelta para adjuntar</span>
        </div>
      ) : null}
      {/* Barra de ESTADO VIVA del proyecto: el pulso (antes mensajes del bot) sin interrumpir el hilo.
          Estado actual + última novedad, siempre a la vista; clic → panel de Actividad. */}
      {projectId && actReady ? (
        <button
          type="button"
          onClick={() => { setActOpen(true); setActNew(0); }}
          className={`flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2 text-left transition-colors ${actFlash ? "bg-primary/10" : "hover:bg-muted/40"}`}
          title="Ver la actividad del proyecto"
        >
          {actStatus ? (
            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${actStatus.className}`}>
              <span className="size-1.5 rounded-full bg-current" />
              {actStatus.label}
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {actItems[0] ? (
              <><span className="font-medium text-foreground">{actItems[0].user?.name ?? actItems[0].actorName ?? "Alguien"}</span> {actItems[0].summary}</>
            ) : (
              "Sin novedades todavía"
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary">
            {actNew > 0 ? (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary-foreground">{actNew}</span>
            ) : null}
            Actividad
            <ChevronRight className="size-3.5" />
          </span>
        </button>
      ) : null}
      {actOpen ? <ActivityPanel items={actItems} status={actStatus} onClose={() => setActOpen(false)} /> : null}
      {threadsOpen ? (
        <ThreadsPanel
          threads={myThreads}
          currentChannelId={channelId}
          onOpenLocal={openLocalThread}
          onNavigate={navigateThread}
          onClose={() => setThreadsOpen(false)}
        />
      ) : null}
      {/* «Ponerte al día»: resumen de lo que te perdiste (solo aparece con bastante sin leer). */}
      {!catchupDismissed && (catchup || catchupLoading) ? (
        <div className="shrink-0 border-b border-border bg-primary/[0.04] px-3 py-2.5">
          <div className="mx-auto flex max-w-3xl items-start gap-2.5">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Sparkles className="size-3.5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-xs font-semibold text-foreground">Ponerte al día</span>
                {catchup ? <span className="text-[11px] text-muted-foreground">· {catchup.total} mensaje{catchup.total === 1 ? "" : "s"} sin leer</span> : null}
                {catchup?.mentionedYou ? <span className="rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-300">te mencionaron</span> : null}
              </div>
              {catchupLoading && !catchup ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Marcebot está resumiendo lo que te perdiste…</p>
              ) : catchup?.summary && catchup.summary.length ? (
                <ul className="mt-1 space-y-0.5">
                  {catchup.summary.map((s, i) => (
                    <li key={i} className="flex gap-1.5 text-xs text-muted-foreground"><span className="mt-px text-primary">•</span><span>{s}</span></li>
                  ))}
                </ul>
              ) : catchup ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {catchup.authors.length ? `De ${catchup.authors.slice(0, 3).map((a) => a.name).join(", ")}${catchup.authors.length > 3 ? " y más" : ""}.` : "Mensajes nuevos en el canal."}
                </p>
              ) : null}
            </div>
            <button type="button" aria-label="Descartar" onClick={() => setCatchupDismissed(true)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button>
          </div>
        </div>
      ) : null}
      {/* Barra: buscar + mensajes fijados */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        {searchOpen ? (
          <div className="relative flex-1">
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en todo el chat…" className="w-full bg-transparent text-base outline-none sm:text-xs" />
              {searching ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" /> : null}
              <button type="button" aria-label="Cerrar búsqueda" onClick={() => { setSearch(""); setSearchOpen(false); setSearchResults(null); }} className="shrink-0 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
            </div>
            {/* Resultados del historial COMPLETO: clic → salta al mensaje (trayéndolo si hace falta). */}
            {searchResults !== null ? (
              <div className="absolute inset-x-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                {searchResults.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-muted-foreground">{searching ? "Buscando…" : "Sin resultados en este chat."}</p>
                ) : (
                  searchResults.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => void openResult(r.id)}
                      className="flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-muted"
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs font-medium text-foreground">{isMine(r.author) ? "Tú" : r.author?.name ?? "—"}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{formatBogota(r.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                      </span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{r.body || "—"}</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <button onClick={() => setSearchOpen(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted" title="Buscar">
              <Search className="size-3.5" /> Buscar
            </button>
            <button onClick={() => setThreadsOpen(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted" title="Mis hilos: los hilos donde participas y sus respuestas nuevas">
              <MessageSquare className="size-3.5" /> Hilos
              {threadNew.size > 0 ? <span className="ml-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary-foreground">{threadNew.size}</span> : null}
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
              {/* Clic en el fijado → salta al mensaje original (antes no era clicable). */}
              <button
                type="button"
                onClick={() => jumpToMessage(p.id)}
                className="min-w-0 flex-1 truncate text-left text-muted-foreground hover:text-foreground"
                title="Ir al mensaje fijado"
              >
                <span className="font-medium text-foreground">{isMine(p.author) ? "Tú" : p.author?.name}:</span> {p.body}
              </button>
              {!readOnly ? <button onClick={() => pin(p.id, true)} className="ml-auto shrink-0 text-muted-foreground hover:text-destructive" title="Desfijar"><X className="size-3" /></button> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-auto"
        onScroll={() => {
          const bottom = nearBottom();
          setAtBottom(bottom);
          if (bottom && newCount) setNewCount(0);
        }}
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
        {/* Sentinela para carga infinita hacia arriba: al acercarse al tope, carga el historial
            anterior sola (el botón queda de respaldo). */}
        <div ref={topSentinelRef} aria-hidden />
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
              else {
                next.add(m.id);
                // Abrir un hilo con respuestas nuevas lo marca leído y baja su badge.
                if (threadNew.get(m.id)) {
                  void markThreadRead(m.id);
                  setMyThreads((ts) => ts.map((t) => (t.rootId === m.id ? { ...t, newCount: 0 } : t)));
                }
              }
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
                    {/* Responder CITANDO (estilo WhatsApp): pone el mensaje como cita sobre el composer. */}
                    <button type="button" onClick={() => { setQuoting(m); composerRef.current?.focus(); }} className="hidden size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground md:flex" title="Responder (citar)">
                      <Reply className="size-3.5" />
                    </button>
                    <button type="button" onClick={toggleThread} className="hidden size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground md:flex" title="Responder en hilo">
                      <MessageSquare className="size-3.5" />
                    </button>
                    <button type="button" onClick={() => pin(m.id, !!m.pinned)} className="hidden size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground md:flex" title={m.pinned ? "Desfijar" : "Fijar"}>
                      <Pin className={cn("size-3.5", m.pinned && "text-primary")} />
                    </button>
                    <details data-autoclose className="relative">
                      <summary className="flex size-6 cursor-pointer list-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" title="Más acciones"><MoreVertical className="size-3.5" /></summary>
                      <div className="absolute right-0 z-30 mt-1 w-40 rounded-lg border border-border bg-popover p-1 text-xs shadow-lg">
                        <button onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; setQuoting(m); composerRef.current?.focus(); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted md:hidden">
                          <Reply className="size-3.5" /> Responder (citar)
                        </button>
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
                        {/* Crear tarea desde el mensaje: solo en canales de PROYECTO (projectId), lo
                            que se acuerda en el chat deja de perderse. */}
                        {projectId ? (
                          <button
                            onClick={async (e) => {
                              (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                              setTaskFrom({ id: m.id, state: "loading" });
                              const r = await createTaskFromMessage(channelId, m.id).catch(() => ({ ok: false as const, error: "Error de red." }));
                              setTaskFrom(r.ok ? { id: m.id, state: "done", projectId: r.projectId } : { id: m.id, state: "error", error: r.error });
                              setTimeout(() => setTaskFrom((cur) => (cur?.id === m.id ? null : cur)), 6000);
                            }}
                            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted"
                          >
                            <ListChecks className="size-3.5" /> Crear tarea
                          </button>
                        ) : null}
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
                {/* Cita: bloque del mensaje al que responde este, clicable para saltar al original. */}
                {m.quoted ? (
                  <button
                    type="button"
                    onClick={() => m.quoted && jumpToMessage(m.quoted.id)}
                    className="mb-1 flex w-full max-w-2xl items-start gap-1.5 rounded-md border-l-2 border-primary/60 bg-muted/40 px-2 py-1 text-left text-xs hover:bg-muted/70"
                    title="Ir al mensaje citado"
                  >
                    <CornerUpLeft className="mt-0.5 size-3 shrink-0 text-primary/70" />
                    <span className="min-w-0">
                      <span className="font-medium text-foreground/80">{m.quoted.author ?? "Alguien"}</span>
                      <span className="ml-1 text-muted-foreground">{m.quoted.body}</span>
                    </span>
                  </button>
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
                {/* Feedback de «Crear tarea» desde este mensaje. */}
                {taskFrom?.id === m.id ? (
                  <div className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                    <ListChecks className="size-3.5 text-primary" />
                    {taskFrom.state === "loading" ? (
                      <span className="text-muted-foreground">Creando tarea…</span>
                    ) : taskFrom.state === "done" ? (
                      <>
                        <span className="text-emerald-600 dark:text-emerald-400">Tarea creada</span>
                        <a href={`/proyectos/${taskFrom.projectId}?tab=tareas`} className="font-medium text-primary hover:underline">Ver tareas →</a>
                      </>
                    ) : (
                      <span className="text-destructive">{taskFrom.error ?? "No se pudo crear la tarea."}</span>
                    )}
                  </div>
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
                      {threadNew.get(m.id) ? <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary-foreground">{threadNew.get(m.id)} nueva{threadNew.get(m.id) === 1 ? "" : "s"}</span> : null}
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
                      <div className="space-y-1.5">
                        {/* Adjuntos pendientes del hilo (chips con quitar). */}
                        {(threadFiles[m.id]?.length ?? 0) > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {(threadFiles[m.id] ?? []).map((f, i) => (
                              <span key={i} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs">
                                <Paperclip className="size-3 text-muted-foreground" />
                                <span className="max-w-[10rem] truncate">{f.name}</span>
                                <button type="button" aria-label="Quitar adjunto" onClick={() => setThreadFiles((p) => ({ ...p, [m.id]: (p[m.id] ?? []).filter((_, idx) => idx !== i) }))} className="text-muted-foreground hover:text-destructive"><X className="size-3" /></button>
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <form onSubmit={(e) => { e.preventDefault(); void sendThreadReply(m.id); }} className="flex items-end gap-2">
                          <label className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" title="Adjuntar archivo">
                            <Paperclip className="size-4" />
                            <input type="file" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) setThreadFiles((p) => ({ ...p, [m.id]: [...(p[m.id] ?? []), ...fs] })); e.target.value = ""; }} />
                          </label>
                          <textarea
                            rows={1}
                            value={replyText[m.id] ?? ""}
                            onChange={(e) => setReplyText((p) => ({ ...p, [m.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendThreadReply(m.id); } }}
                            placeholder="Responder en el hilo…  ·  @ para mencionar · Enter envía"
                            className="max-h-32 min-h-[2.25rem] flex-1 resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-base outline-none focus:ring-1 focus:ring-ring sm:text-sm"
                          />
                          <button className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40" disabled={!(replyText[m.id] ?? "").trim() && (threadFiles[m.id]?.length ?? 0) === 0} aria-label="Enviar"><Send className="size-4" /></button>
                        </form>
                      </div>
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

      {/* Botón flotante «ir al último»: aparece al leer historial arriba, con el nº de mensajes
          llegados mientras tanto. Anclado sobre el composer (la raíz es relative). */}
      {!atBottom ? (
        <button
          type="button"
          onClick={() => { scrollToBottom(); setNewCount(0); }}
          className="absolute bottom-24 right-4 z-30 flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-lg hover:bg-muted"
          aria-label="Ir al último mensaje"
        >
          {newCount > 0 ? <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{newCount > 99 ? "99+" : newCount}</span> : null}
          {newCount > 0 ? "nuevos" : "Ir al último"}
          <ChevronDown className="size-3.5" />
        </button>
      ) : null}

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
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-base outline-none focus:ring-1 focus:ring-ring sm:text-sm"
            />
            {pollOpts.map((o, i) => (
              <input
                key={i}
                value={o}
                onChange={(e) => setPollOpts((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`Opción ${i + 1}`}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-base outline-none focus:ring-1 focus:ring-ring sm:text-sm"
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
          {/* Cita activa (estilo WhatsApp): a qué mensaje respondes; la X cancela. */}
          {quoting ? (
            <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-primary bg-muted/50 px-2.5 py-1.5 text-xs">
              <CornerUpLeft className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-primary">Respondiendo a {isMine(quoting.author) ? "ti" : quoting.author?.name ?? "un mensaje"}</p>
                <p className="truncate text-muted-foreground">{quoting.body || "📎 Adjunto"}</p>
              </div>
              <button type="button" onClick={() => setQuoting(null)} aria-label="Cancelar cita" className="shrink-0 text-muted-foreground hover:text-destructive"><X className="size-3.5" /></button>
            </div>
          ) : null}
          {files.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {files.map((f, i) => {
                const preview = imgPreviews.get(f);
                return (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-md bg-muted py-1 pl-1 pr-2 text-xs">
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt={f.name} className="size-8 rounded object-cover" />
                    ) : (
                      <FileText className="ml-1 size-3" />
                    )}
                    <span className="max-w-[10rem] truncate">{f.name}</span>
                    <button type="button" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} aria-label={`Quitar ${f.name}`}>
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
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
                <button type="button" onClick={() => finishRecording(true)} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground" aria-label="Detener y escuchar" title="Detener y escuchar antes de enviar">
                  <Check className="size-5" />
                </button>
              </div>
            ) : voicePreview ? (
              // Escucha previa: revisar la nota antes de mandarla (descartar / reproducir / enviar).
              <div className="flex w-full items-center gap-2 px-1 py-1">
                <button type="button" onClick={discardVoice} className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Descartar nota de voz" title="Descartar">
                  <Trash2 className="size-5" />
                </button>
                <audio src={voicePreview.url} controls className="h-9 min-w-0 flex-1" />
                <button type="button" onClick={sendVoice} disabled={uploading} className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40" aria-label="Enviar nota de voz" title="Enviar nota de voz">
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
              onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
            />
            {/* Cámara directa (móvil): capture abre la cámara trasera para una foto de set/claqueta
                en 2 toques. En escritorio el botón se oculta (no aporta). */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
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
              onClick={() => cameraRef.current?.click()}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
              aria-label="Tomar foto"
              title="Tomar foto"
            >
              <Camera className="size-5" />
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
              onPaste={onComposerPaste}
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
