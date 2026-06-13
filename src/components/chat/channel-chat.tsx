"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { sendMessage } from "@/app/(app)/chat/actions";

export type ChatMsg = {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string; initials: string | null; color: string | null } | null;
  status?: "sending" | "sent" | "error" | "pending";
};

export type ChatMe = { name: string; initials: string | null; color: string | null };

function hhmm(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

export function ChannelChat({
  channelId,
  initialMessages,
  me,
}: {
  channelId: string;
  initialMessages: ChatMsg[];
  me: ChatMe;
}) {
  const [messages, setMessages] = React.useState<ChatMsg[]>(initialMessages);
  const [text, setText] = React.useState("");
  const [online, setOnline] = React.useState(true);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const queueKey = `labstream-chat-queue:${channelId}`;

  const scrollToBottom = React.useCallback(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // upsert por id (evita duplicados cuando el SSE devuelve un mensaje que ya añadimos)
  const upsert = React.useCallback((m: ChatMsg) => {
    setMessages((prev) => {
      if (prev.some((x) => x.id === m.id)) return prev.map((x) => (x.id === m.id ? m : x));
      return [...prev, m];
    });
  }, []);

  // SSE
  React.useEffect(() => {
    const es = new EventSource(`/api/chat/${channelId}/stream`);
    es.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data) as ChatMsg;
        upsert({ ...m, status: "sent" });
        scrollToBottom();
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [channelId, upsert, scrollToBottom]);

  React.useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // estado online + reenvío de la cola al reconectar
  React.useEffect(() => {
    setOnline(navigator.onLine);
    const flush = async () => {
      setOnline(true);
      const raw = localStorage.getItem(queueKey);
      if (!raw) return;
      const queued: { tempId: string; body: string }[] = JSON.parse(raw);
      localStorage.removeItem(queueKey);
      for (const item of queued) await deliver(item.tempId, item.body);
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

  function persistQueue(tempId: string, body: string) {
    const raw = localStorage.getItem(queueKey);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push({ tempId, body });
    localStorage.setItem(queueKey, JSON.stringify(arr));
  }
  function unpersistQueue(tempId: string) {
    const raw = localStorage.getItem(queueKey);
    if (!raw) return;
    const arr = (JSON.parse(raw) as { tempId: string }[]).filter((x) => x.tempId !== tempId);
    localStorage.setItem(queueKey, JSON.stringify(arr));
  }

  async function deliver(tempId: string, body: string) {
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: "sending" } : m)));
    try {
      const real = await sendMessage(channelId, body);
      if (!real) return;
      unpersistQueue(tempId);
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        if (withoutTemp.some((m) => m.id === real.id)) return withoutTemp; // ya llegó por SSE
        return [...withoutTemp, { ...real, status: "sent" }];
      });
    } catch {
      persistQueue(tempId, body);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: navigator.onLine ? "error" : "pending" } : m)),
      );
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    const tempId = `temp-${Date.now()}-${Math.round(performance.now())}`;
    const optimistic: ChatMsg = {
      id: tempId,
      body,
      createdAt: new Date().toISOString(),
      author: me,
      status: navigator.onLine ? "sending" : "pending",
    };
    setMessages((prev) => [...prev, optimistic]);
    scrollToBottom();
    if (!navigator.onLine) {
      persistQueue(tempId, body);
      return;
    }
    await deliver(tempId, body);
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <p className="text-center text-xs text-muted-foreground">Inicio de la conversación</p>
        {messages.map((m) => (
          <div key={m.id} className="flex gap-2.5">
            <UserAvatar initials={m.author?.initials} color={m.author?.color} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold">{m.author?.name ?? "Sistema"}</span>
                <span className="text-[11px] text-muted-foreground">{hhmm(m.createdAt)}</span>
                {m.status && m.status !== "sent" ? (
                  <span
                    className={cn(
                      "text-[10px]",
                      m.status === "error" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {m.status === "sending" && "· enviando…"}
                    {m.status === "pending" && "· pendiente"}
                    {m.status === "error" && "· error"}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-foreground/90">{m.body}</p>
              {m.status === "error" ? (
                <button
                  onClick={() => deliver(m.id, m.body)}
                  className="text-[11px] text-primary hover:underline"
                >
                  Reintentar
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {!online ? (
        <p className="bg-amber-500/10 px-4 py-1 text-center text-[11px] text-amber-600 dark:text-amber-400">
          Sin conexión — los mensajes se enviarán al reconectar
        </p>
      ) : null}

      <form onSubmit={handleSend} className="border-t border-border p-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe un mensaje…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
            aria-label="Enviar"
          >
            <Send className="size-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
