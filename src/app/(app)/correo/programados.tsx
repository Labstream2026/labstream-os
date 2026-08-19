"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, FileText, Loader2, Send } from "lucide-react";
import { cancelarProgramado, enviarAhoraProgramado } from "./acciones";

// ── Carpeta «Programados»: la cola de salida, a la vista ────────────────────
// Cada fila es un correo YA COMPUESTO esperando su hora — o uno que NO pudo salir, con su
// causa. Desde aquí se adelanta («Enviar ahora»), se reintenta o se regresa a Borradores.
// Nada de esto toca el mensaje: la firma y los adjuntos quedaron congelados al escribirlo.

export type FilaProgramada = {
  id: string;
  para: string;
  asunto: string;
  cuando: string;
  /** null = esperando su hora; texto = NO salió y esta es la causa. */
  error: string | null;
  snippet: string;
};

export function ListaProgramados({ filas }: { filas: FilaProgramada[] }) {
  const router = useRouter();
  const [ocupado, setOcupado] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<string | null>(null);

  const corre = async (id: string, accion: (id: string) => Promise<{ ok: boolean; error?: string }>) => {
    setOcupado(id);
    setAviso(null);
    const r = await accion(id);
    if (!r.ok) setAviso(r.error ?? "No se pudo.");
    setOcupado(null);
    router.refresh();
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {aviso ? <p className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-[12px] font-medium text-destructive">{aviso}</p> : null}
      <ul className="divide-y divide-border">
        {filas.map((f) => (
          <li key={f.id} className="group flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 hover:bg-accent/40">
            {f.error ? (
              <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10.5px] font-bold uppercase text-destructive">No salió</span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10.5px] font-bold text-primary">
                <CalendarClock className="size-3" /> sale el {f.cuando}
              </span>
            )}
            <span className="w-44 shrink-0 truncate text-[13px] text-muted-foreground">{f.para}</span>
            <span className="min-w-0 flex-1 truncate text-[13px]">
              {f.asunto || "(sin asunto)"} {f.snippet ? <span className="text-muted-foreground">— {f.snippet}</span> : null}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {ocupado === f.id ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
              <button type="button" disabled={ocupado === f.id} onClick={() => void corre(f.id, enviarAhoraProgramado)}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                <Send className="size-3" /> {f.error ? "Reintentar" : "Enviar ahora"}
              </button>
              <button type="button" disabled={ocupado === f.id} onClick={() => void corre(f.id, cancelarProgramado)}
                title="Cancelar el envío y dejarlo en Borradores"
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                <FileText className="size-3" /> A borradores
              </button>
            </span>
            {f.error ? <p className="w-full pl-1 text-[11.5px] text-destructive/90">{f.error}</p> : null}
          </li>
        ))}
        {filas.length === 0 ? (
          <li className="px-4 py-12 text-center text-[12.5px] text-muted-foreground">
            Nada programado. En el compositor, la flechita junto a «Enviar» deja elegir cuándo sale el correo.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
