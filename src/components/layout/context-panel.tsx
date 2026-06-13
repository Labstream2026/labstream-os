"use client";

import { Hash, Send, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";

type Msg = {
  initials: string;
  color: string;
  name: string;
  time: string;
  text: string;
};

const MESSAGES: Msg[] = [
  { initials: "MR", color: "indigo", name: "Mateo Ríos", time: "09:00", text: "Buenos días equipo ☕ Recordatorio: daily a las 12:00." },
  { initials: "NB", color: "cyan", name: "Nora Beltrán", time: "09:15", text: "Llego tarde al daily, estoy en una llamada con Horizon." },
  { initials: "IT", color: "rose", name: "Iván Torres", time: "09:30", text: "Subo el storyboard de la promo de Nova 🎬" },
];

export function ContextPanel({ open }: { open: boolean }) {
  return (
    <aside
      className={cn(
        "h-full shrink-0 border-l border-border bg-background transition-all duration-200 overflow-hidden",
        open ? "w-80" : "w-0 border-l-0",
      )}
    >
      <div className="flex h-full w-80 flex-col">
        {/* Header del canal */}
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <Hash className="size-4 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Equipo · general</p>
            <p className="truncate text-xs text-muted-foreground">Canal del equipo</p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>

        {/* Mensajes */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <p className="text-center text-xs text-muted-foreground">Inicio de los comentarios</p>
          {MESSAGES.map((m, i) => (
            <div key={i} className="flex gap-2.5">
              <UserAvatar initials={m.initials} color={m.color} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{m.name}</span>
                  <span className="text-[11px] text-muted-foreground">{m.time}</span>
                </div>
                <p className="text-sm text-foreground/90">{m.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Composer */}
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <input
              placeholder="Escribe un comentario…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground"
              aria-label="Enviar"
            >
              <Send className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
