"use client";

import * as React from "react";
import Link from "next/link";
import { Send, MessageSquare, Paperclip, FileText, FileSpreadsheet, Presentation, FileType, File as FileIcon, Download, Pencil, Eye, X, BarChart3, Smile, SmilePlus, Pin, Trash2, MoreVertical, MoreHorizontal, Search, Check } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { sendMessage, sendMessageWithAttachments, createPoll, votePoll, toggleReaction, editMessage, deleteMessage, togglePin, notifyTyping, markChannelRead, clearConversation } from "@/app/(app)/chat/actions";
import { PollWidget } from "@/components/chat/poll-widget";
import { EmojiPicker, QUICK_REACTIONS } from "@/components/chat/emoji-picker";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import type { PollData, ReactionItem } from "@/lib/chat-bus";

export type Attachment = { id: string; name: string; mime: string | null; editable: boolean };
export type Member = { id: string; name: string; initials?: string | null; color?: string | null };

// Marcebot se etiqueta por TEXTO (@Marcebot dispara al bot por regex en el servidor, sin
// depender de su ID de usuario). Por eso garantizamos que SIEMPRE esté en el autocompletado
// desde el cliente, aunque la consulta del servidor no lo traiga (registro sin isSystemBot, etc.).
const MENTION_BOT: Member = { id: "marcebot-mention", name: "Marcebot", initials: "🤖", color: "orange" };

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
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
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
    return <React.Fragment key={`t${idx}`}>{highlightMentions(part, members, `${idx}`, mine)}</React.Fragment>;
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

function Attachments({ items }: { items?: Attachment[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1.5">
      {items.map((a) => {
        if (isImage(a)) {
          // Vista previa de imagen → abre en el visor (misma página, cierra con Escape/×).
          // Mantiene href para abrir/descargar con Cmd/Ctrl+clic o si no hay JS.
          return (
            <a key={a.id} href={`/api/files/${a.id}`} data-lightbox data-lightbox-name={a.name} rel="noreferrer" className="block cursor-zoom-in">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/files/${a.id}`}
                alt={a.name}
                className="max-h-56 max-w-full rounded-lg border border-border object-contain"
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{a.name}</span>
            </a>
          );
        }
        const { Icon, color } = fileIcon(a.name);
        return (
          <div key={a.id} className="w-56 max-w-full rounded-xl border border-border bg-background p-2.5">
            <div className="flex items-center gap-2">
              <Icon className={cn("size-7 shrink-0", color)} />
              <span className="min-w-0 flex-1 truncate text-xs font-medium" title={a.name}>{shortName(a.name)}</span>
            </div>
            <div className="mt-2 flex items-center gap-3 border-t border-border pt-2 text-[11px]">
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
  readOnly = false,
  isAdmin = false,
}: {
  channelId: string;
  initialMessages: ChatMsg[];
  me: ChatMe;
  members?: Member[];
  readOnly?: boolean;
  isAdmin?: boolean;
}) {
  const [messages, setMessages] = React.useState<ChatMsg[]>(initialMessages);
  const [text, setText] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [replyText, setReplyText] = React.useState<Record<string, string>>({});
  const [openThreads, setOpenThreads] = React.useState<Set<string>>(new Set());
  const [online, setOnline] = React.useState(true);
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
  const [typingNames, setTypingNames] = React.useState<Record<string, number>>({}); // name → expiry ts
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const emojiBtnRef = React.useRef<HTMLButtonElement>(null);
  const composerRef = React.useRef<HTMLTextAreaElement>(null);
  const composerWrapRef = React.useRef<HTMLDivElement>(null);
  const lastTypingRef = React.useRef(0);
  const queueKey = `labstream-chat-queue:${channelId}`;

  const q = search.trim().toLowerCase();
  const roots = messages
    .filter((m) => !m.parentId)
    .filter((m) => !q || m.body.toLowerCase().includes(q));
  const repliesFor = (id: string) =>
    messages.filter((m) => m.parentId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pinned = messages.filter((m) => m.pinned && !m.parentId);

  // ¿El mensaje es mío? (para alinearlo a la derecha con burbuja propia).
  const isMine = (a: ChatMsg["author"]) => !!a && a.name === me.name && a.color === me.color;

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

  React.useEffect(() => {
    const es = new EventSource(`/api/chat/${channelId}/stream`);
    es.onmessage = (e) => {
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
        if (!m.parentId) scrollToBottom();
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [channelId, upsert, scrollToBottom, me.id, isAdmin]);

  React.useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // Marca el canal como leído solo si la pestaña está visible (con debounce para no
  // llamar por cada mensaje). Así los no-leídos no se borran si llegan en segundo plano.
  React.useEffect(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const t = setTimeout(() => void markChannelRead(channelId), 800);
    return () => clearTimeout(t);
  }, [channelId, messages.length]);
  React.useEffect(() => {
    let last = 0;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      // Throttle: ráfagas de visibilitychange/focus (extensiones, cambio de pestaña)
      // no deben disparar más de una marca cada 5 s.
      if (Date.now() - last < 5000) return;
      last = Date.now();
      void markChannelRead(channelId);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [channelId]);

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

  async function submitMain(e: React.FormEvent) {
    e.preventDefault();
    if (files.length > 0) {
      const fd = new FormData();
      fd.set("channelId", channelId);
      fd.set("body", text.trim());
      files.forEach((f) => fd.append("files", f));
      setUploading(true);
      setAttachErr(null);
      setText("");
      setFiles([]);
      try {
        // El servidor devuelve el mensaje ya guardado: se muestra al instante
        // (sin depender del SSE, que puede no llegar al propio emisor).
        const saved = await sendMessageWithAttachments(fd);
        if (saved) upsert({ ...saved, status: "sent", reactions: saved.reactions ?? [] });
      } catch {
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
  // Lista para mencionar: el equipo del servidor + Marcebot garantizado (si no vino ya).
  const mentionPool = React.useMemo(
    () => (members.some((m) => /^\s*marcebot\s*$/i.test(m.name)) ? members : [MENTION_BOT, ...members]),
    [members],
  );
  const mentionMatches = mentionQuery != null
    ? mentionPool.filter((mem) => mem.id !== me.id && mem.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
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
            <button onClick={() => { setSearch(""); setSearchOpen(false); }} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
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
        <div className="shrink-0 space-y-1 border-b border-border bg-amber-50/50 px-3 py-1.5 dark:bg-amber-500/5">
          {pinned.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5 text-[11px]">
              <Pin className="size-3 shrink-0 text-amber-600" />
              <span className="truncate text-muted-foreground"><span className="font-medium text-foreground">{isMine(p.author) ? "Tú" : p.author?.name}:</span> {p.body}</span>
              {!readOnly ? <button onClick={() => pin(p.id, true)} className="ml-auto shrink-0 text-muted-foreground hover:text-destructive" title="Desfijar"><X className="size-3" /></button> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4">
        <p className="text-center text-xs text-muted-foreground">Inicio de la conversación</p>
        {roots.map((m, idx) => {
          const replies = repliesFor(m.id);
          const open = openThreads.has(m.id);
          const mine = isMine(m.author);
          const showDay = idx === 0 || dayKeyOf(roots[idx - 1].createdAt) !== dayKeyOf(m.createdAt);
          return (
            <React.Fragment key={m.id}>
            {showDay ? (
              <div className="flex items-center gap-2 py-1">
                <span className="h-px flex-1 bg-border" />
                <span suppressHydrationWarning className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{dayLabel(m.createdAt)}</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : null}
            {m.deleted ? (
              <div className={cn("flex gap-2.5", mine && "flex-row-reverse")}>
                <UserAvatar initials={m.author?.initials} name={m.author?.name} color={m.author?.color} size="md" />
                <div className={cn("flex min-w-0 flex-1 flex-col", mine && "items-end")}>
                  <div className={cn("flex items-baseline gap-2", mine && "flex-row-reverse")}>
                    <span className="text-sm font-semibold text-muted-foreground">{mine ? "Tú" : m.author?.name ?? "Sistema"}</span>
                    <span suppressHydrationWarning className="text-[11px] text-muted-foreground">{hhmm(m.createdAt)}</span>
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"><Trash2 className="size-3" /> Borrado · visible solo para admin</span>
                  </div>
                  <div className="mt-0.5 inline-block max-w-[88%] rounded-2xl border border-dashed border-border bg-muted/40 px-3 py-2 text-sm italic text-muted-foreground">
                    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.body || "(sin texto)"}</p>
                  </div>
                </div>
              </div>
            ) : (
            <div className={cn("flex gap-2.5", mine && "flex-row-reverse")}>
              <UserAvatar initials={m.author?.initials} name={m.author?.name} color={m.author?.color} size="md" />
              <div className={cn("flex min-w-0 flex-1 flex-col", mine && "items-end")}>
                <div className={cn("flex items-baseline gap-2", mine && "flex-row-reverse")}>
                  <span className="text-sm font-semibold">{mine ? "Tú" : m.author?.name ?? "Sistema"}</span>
                  <span suppressHydrationWarning className="text-[11px] text-muted-foreground">{hhmm(m.createdAt)}</span>
                  {m.editedAt ? <span className="text-[10px] text-muted-foreground">(editado)</span> : null}
                  {m.pinned ? <Pin className="size-3 text-amber-600" /> : null}
                  {statusTag(m.status)}
                  {!readOnly && !m.status ? (
                    <details data-autoclose className="relative">
                      <summary className="cursor-pointer list-none rounded px-1 text-muted-foreground hover:text-foreground"><MoreVertical className="size-3.5" /></summary>
                      <div className={cn("absolute z-20 mt-1 w-36 rounded-lg border border-border bg-popover p-1 text-xs shadow-lg", mine ? "left-0" : "right-0")}>
                        <button onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; pin(m.id, !!m.pinned); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted">
                          <Pin className="size-3.5" /> {m.pinned ? "Desfijar" : "Fijar"}
                        </button>
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
                  ) : null}
                </div>
                {editing === m.id ? (
                  <div className="mt-0.5 w-full max-w-[88%]">
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={2} className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                    <div className="mt-1 flex gap-2">
                      <button onClick={() => saveEdit(m.id)} className="inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground"><Check className="size-3" /> Guardar</button>
                      <button onClick={() => setEditing(null)} className="text-xs text-muted-foreground">Cancelar</button>
                    </div>
                  </div>
                ) : m.body && m.body !== ATTACH_PLACEHOLDER ? (
                  <div
                    className={cn(
                      "mt-0.5 inline-block max-w-[88%] rounded-2xl px-3 py-2 text-sm",
                      mine ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted text-foreground/90",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{renderBody(m.body, mentionPool, mine)}</p>
                  </div>
                ) : null}
                <div className={cn("max-w-[88%]", mine && "flex flex-col items-end")}>
                  <Attachments items={m.attachments} />
                  {m.poll ? (
                    <PollWidget poll={m.poll} myOptionId={myVotes[m.poll.id] ?? null} onVote={(opt) => vote(m.poll!.id, opt)} />
                  ) : null}
                </div>

                {!readOnly || (m.reactions?.length ?? 0) > 0 ? (
                  <Reactions reactions={m.reactions} meId={me.id} onToggle={(e) => react(m.id, e)} />
                ) : null}

                {!readOnly || replies.length > 0 ? (
                  <button
                    onClick={() =>
                      setOpenThreads((prev) => {
                        const next = new Set(prev);
                        next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                        return next;
                      })
                    }
                    className="mt-1 inline-flex items-center gap-1 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-primary"
                  >
                    <MessageSquare className="size-3" />
                    {replies.length > 0 ? `${replies.length} respuesta${replies.length === 1 ? "" : "s"}` : "Responder"}
                  </button>
                ) : null}

                {open ? (
                  <div className="mt-2 w-full space-y-2 self-stretch border-l-2 border-border pl-3 text-left">
                    {replies.map((r) => (
                      <div key={r.id} className="flex gap-2">
                        <UserAvatar initials={r.author?.initials} name={r.author?.name} color={r.author?.color} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-semibold">{isMine(r.author) ? "Tú" : r.author?.name ?? "Sistema"}</span>
                            <span suppressHydrationWarning className="text-[10px] text-muted-foreground">{hhmm(r.createdAt)}</span>
                            {statusTag(r.status)}
                          </div>
                          <p className="whitespace-pre-wrap break-words text-[13px] text-foreground/90">{r.body}</p>
                          <Attachments items={r.attachments} />
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
                          className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
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
            </React.Fragment>
          );
        })}
        </div>
      </div>

      {!online ? (
        <p className="bg-amber-500/10 px-4 py-1 text-center text-[11px] text-amber-600 dark:text-amber-400">
          Sin conexión — los mensajes se enviarán al reconectar
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
                const isBot = mem.initials === "🤖" || /marcebot/i.test(mem.name);
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
                    <UserAvatar initials={mem.initials} name={mem.name} color={mem.color} size="sm" />
                    <span className="truncate font-medium">{mentionLabel(mem.name)}</span>
                    {isBot ? <span className="ml-auto shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">bot</span> : null}
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
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
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
              className="max-h-48 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1 py-1 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
            />
            <button
              type="submit"
              disabled={uploading || (!text.trim() && files.length === 0)}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
              aria-label="Enviar"
            >
              <Send className="size-4" />
            </button>
          </div>
        </form>
        </div>
       </div>
      ) : null}
    </div>
  );
}
