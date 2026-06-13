"use client";

import * as React from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK = [
  "Redacta un correo de avance para el cliente del proyecto seleccionado.",
  "Resume el estado del proyecto y los próximos pasos.",
  "Propón 5 tareas para arrancar este proyecto.",
  "Dame 3 ideas de reel para redes a partir de este proyecto.",
];

export function AssistantChat({
  enabled,
  projects,
}: {
  enabled: boolean;
  projects: { id: string; label: string }[];
}) {
  const [messages, setMessages] = React.useState<Msg[]>([]);
  const [input, setInput] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: prompt }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, projectId: projectId || null }),
      });
      if (!res.ok || !res.body) {
        const msg = await res.text();
        setMessages((m) => updateLast(m, `⚠️ ${msg || "No se pudo conectar con la IA."}`));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => updateLast(m, acc));
      }
    } catch {
      setMessages((m) => updateLast(m, "⚠️ Error de conexión."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Sin contexto de proyecto</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        {!enabled ? (
          <span className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            IA no configurada (falta ANTHROPIC_API_KEY)
          </span>
        ) : null}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Sparkles className="size-8 text-primary" />
            <p className="font-medium">Asistente de Labstream</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Pídele resúmenes, correos para clientes, ideas o tareas. Elige un proyecto arriba para darle contexto.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {QUICK.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  disabled={!enabled}
                  className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  "max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm " +
                  (m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground")
                }
              >
                {m.content || (busy && i === messages.length - 1 ? <Loader2 className="size-4 animate-spin" /> : "")}
              </div>
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="mt-3 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!enabled || busy}
          placeholder="Escribe tu mensaje…"
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!enabled || busy || !input.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </form>
    </div>
  );
}

function updateLast(messages: Msg[], content: string): Msg[] {
  const copy = messages.slice();
  for (let i = copy.length - 1; i >= 0; i--) {
    if (copy[i].role === "assistant") {
      copy[i] = { ...copy[i], content };
      break;
    }
  }
  return copy;
}
