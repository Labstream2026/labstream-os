"use client";

import * as React from "react";
import Link from "next/link";
import { Send, MessageSquare, Paperclip, FileText, Download, Pencil, X, BarChart3 } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { sendMessage, sendMessageWithAttachments, createPoll, votePoll } from "@/app/(app)/chat/actions";
import { PollWidget } from "@/components/chat/poll-widget";
import type { PollData } from "@/lib/chat-bus";

export type Attachment = { id: string; name: string; mime: string | null; editable: boolean };

export type ChatMsg = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: string;
  author: { name: string; initials: string | null; color: string | null } | null;
  attachments?: Attachment[];
  poll?: PollData | null;
  myOptionId?: string | null;
  status?: "sending" | "sent" | "error" | "pending";
};

export type ChatMe = { name: string; initials: string | null; color: string | null };

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function Attachments({ items }: { items?: Attachment[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {items.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{a.name}</span>
          {a.editable ? (
            <Link href={`/docs/${a.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
              <Pencil className="size-3" /> Editar
            </Link>
          ) : null}
          <a href={`/api/files/${a.id}?download=1`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <Download className="size-3" /> Descargar
          </a>
        </div>
      ))}
    </div>
  );
}

export function ChannelChat({
  channelId,
  initialMessages,
  me,
  readOnly = false,
}: {
  channelId: string;
  initialMessages: ChatMsg[];
  me: ChatMe;
  readOnly?: boolean;
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
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const queueKey = `labstream-chat-queue:${channelId}`;

  const roots = messages.filter((m) => !m.parentId);
  const repliesFor = (id: string) =>
    messages.filter((m) => m.parentId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

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
        const m = data as ChatMsg;
        upsert({ ...m, status: "sent" });
        if (!m.parentId) scrollToBottom();
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [channelId, upsert, scrollToBottom]);

  React.useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

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
      const real = await sendMessage(channelId, body, parentId);
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
      setText("");
      setFiles([]);
      try {
        await sendMessageWithAttachments(fd); // el mensaje llega por SSE
      } finally {
        setUploading(false);
        scrollToBottom();
      }
      return;
    }
    submitText(text, null);
    setText("");
  }

  async function vote(pollId: string, optionId: string) {
    setMyVotes((prev) => ({ ...prev, [pollId]: optionId }));
    const data = await votePoll(pollId, optionId);
    if (data) setMessages((prev) => prev.map((m) => (m.poll?.id === pollId ? { ...m, poll: data } : m)));
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
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <p className="text-center text-xs text-muted-foreground">Inicio de la conversación</p>
        {roots.map((m) => {
          const replies = repliesFor(m.id);
          const open = openThreads.has(m.id);
          return (
            <div key={m.id} className="flex gap-2.5">
              <UserAvatar initials={m.author?.initials} color={m.author?.color} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{m.author?.name ?? "Sistema"}</span>
                  <span className="text-[11px] text-muted-foreground">{hhmm(m.createdAt)}</span>
                  {statusTag(m.status)}
                </div>
                <p className="text-sm text-foreground/90">{m.body}</p>
                <Attachments items={m.attachments} />
                {m.poll ? (
                  <PollWidget poll={m.poll} myOptionId={myVotes[m.poll.id] ?? null} onVote={(opt) => vote(m.poll!.id, opt)} />
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
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-primary"
                  >
                    <MessageSquare className="size-3" />
                    {replies.length > 0 ? `${replies.length} respuesta${replies.length === 1 ? "" : "s"}` : "Responder"}
                  </button>
                ) : null}

                {open ? (
                  <div className="mt-2 space-y-2 border-l-2 border-border pl-3">
                    {replies.map((r) => (
                      <div key={r.id} className="flex gap-2">
                        <UserAvatar initials={r.author?.initials} color={r.author?.color} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-semibold">{r.author?.name ?? "Sistema"}</span>
                            <span className="text-[10px] text-muted-foreground">{hhmm(r.createdAt)}</span>
                            {statusTag(r.status)}
                          </div>
                          <p className="text-[13px] text-foreground/90">{r.body}</p>
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
          );
        })}
      </div>

      {!online ? (
        <p className="bg-amber-500/10 px-4 py-1 text-center text-[11px] text-amber-600 dark:text-amber-400">
          Sin conexión — los mensajes se enviarán al reconectar
        </p>
      ) : null}

      {!readOnly ? (
       <div className="border-t border-border">
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
        <form onSubmit={submitMain} className="p-3">
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
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
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
              className="text-muted-foreground hover:text-foreground"
              aria-label="Adjuntar archivo"
              title="Adjuntar archivo"
            >
              <Paperclip className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setPollMode((v) => !v)}
              className={cn("hover:text-foreground", pollMode ? "text-primary" : "text-muted-foreground")}
              aria-label="Crear encuesta"
              title="Crear encuesta"
            >
              <BarChart3 className="size-4" />
            </button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={uploading ? "Subiendo…" : "Escribe un mensaje…"}
              disabled={uploading}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={uploading || (!text.trim() && files.length === 0)}
              className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              aria-label="Enviar"
            >
              <Send className="size-3.5" />
            </button>
          </div>
        </form>
       </div>
      ) : null}
    </div>
  );
}
