"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type AuditMessage = { id: string; author: string | null; body: string; createdAt: string };

// Envuelve el Chat del día. Para ADMINISTRADORES añade una pestaña "Auditoría"
// con el registro del chat agrupado por día (consecutivo), para revisar al equipo.
// Los no-admin solo ven el chat.
export function EstadosTabs({
  isAdmin,
  audit,
  children,
}: {
  isAdmin: boolean;
  audit: AuditMessage[];
  children: React.ReactNode;
}) {
  const [tab, setTab] = React.useState<"chat" | "audit">("chat");
  if (!isAdmin) return <>{children}</>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 gap-1 border-b border-border px-3 py-1.5">
        <TabBtn active={tab === "chat"} onClick={() => setTab("chat")}>💬 Chat</TabBtn>
        <TabBtn active={tab === "audit"} onClick={() => setTab("audit")}>🗓️ Auditoría</TabBtn>
      </div>
      <div className="min-h-0 flex-1">
        {tab === "chat" ? children : <AuditLog messages={audit} />}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}
function dayLabel(key: string): string {
  const s = new Date(`${key}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function AuditLog({ messages }: { messages: AuditMessage[] }) {
  // El servidor envía del más nuevo al más viejo. Agrupamos por día (días nuevos
  // arriba) y dentro de cada día en orden cronológico (consecutivo).
  const groups = React.useMemo(() => {
    const map = new Map<string, AuditMessage[]>();
    for (const m of messages) {
      const k = dayKey(m.createdAt);
      (map.get(k) ?? map.set(k, []).get(k)!).push(m);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // días recientes primero
      .map(([day, items]) => ({ day, items: items.slice().reverse() })); // dentro del día: cronológico
  }, [messages]);

  if (groups.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Aún no hay registros del chat.</p>;
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-3">
      <p className="mb-3 text-xs text-muted-foreground">
        Registro del Chat del día por jornada (solo administradores). {messages.length} mensajes.
      </p>
      {groups.map((g) => (
        <section key={g.day} className="mb-6">
          <h3 className="sticky top-0 z-10 -mx-4 border-b border-border bg-background/95 px-4 py-1.5 text-xs font-semibold backdrop-blur">
            {dayLabel(g.day)} · {g.items.length} mensaje{g.items.length === 1 ? "" : "s"}
          </h3>
          <div className="mt-2 space-y-2">
            {g.items.map((m) => (
              <div key={m.id} className="rounded-lg border border-border/60 px-3 py-2">
                <p className="flex items-baseline gap-2 text-xs">
                  <span className="font-semibold">{m.author ?? "—"}</span>
                  <span suppressHydrationWarning className="text-[11px] text-muted-foreground">{hhmm(m.createdAt)}</span>
                </p>
                <p className="whitespace-pre-wrap break-words text-sm text-foreground/90 [overflow-wrap:anywhere]">{m.body}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
