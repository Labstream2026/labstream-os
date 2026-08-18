"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, PenLine, Reply, Send, X } from "lucide-react";
import { enviarCorreo, marcarLeidoCorreo } from "./acciones";

// ── Redactar y responder (texto plano, a propósito) ─────────────────────────
// La primera versión envía texto: es lo que el equipo necesita para contestar rápido, y un
// compositor HTML es un proyecto en sí mismo. El hilo sí se respeta (In-Reply-To).

export function Redactar({ responderA }: {
  responderA?: { id: string; para: string; asunto: string } | null;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [listo, setListo] = React.useState(false);
  const [pendiente, arranca] = React.useTransition();

  const esRespuesta = !!responderA;
  const asuntoInicial = responderA ? (responderA.asunto.startsWith("Re:") ? responderA.asunto : `Re: ${responderA.asunto}`) : "";

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    arranca(async () => {
      const r = await enviarCorreo({
        para: String(fd.get("para") ?? ""),
        asunto: String(fd.get("asunto") ?? ""),
        texto: String(fd.get("texto") ?? ""),
        responderAId: responderA?.id ?? null,
      });
      if (!r.ok) { setError(r.error ?? "No se pudo enviar."); return; }
      setListo(true);
      setTimeout(() => { setAbierto(false); setListo(false); }, 1200);
      router.refresh();
    });
  };

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)}
        className={esRespuesta
          ? "inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
          : "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"}>
        {esRespuesta ? <><Reply className="size-3.5" /> Responder</> : <><PenLine className="size-3.5" /> Redactar</>}
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="flex w-full flex-col gap-2 rounded-xl border border-primary/40 bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">{esRespuesta ? "Responder" : "Correo nuevo"}</p>
        <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-3.5" /></button>
      </div>
      <input name="para" type="email" required defaultValue={responderA?.para ?? ""} placeholder="Para: cliente@ejemplo.com"
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
      <input name="asunto" defaultValue={asuntoInicial} placeholder="Asunto"
        className="rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
      <textarea name="texto" required rows={esRespuesta ? 5 : 8} placeholder="Escribe el mensaje…"
        className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pendiente || listo}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          {listo ? "Enviado ✓" : "Enviar"}
        </button>
        <span className="text-[10.5px] text-muted-foreground">Sale desde tu dirección, y queda también en Enviados del webmail.</span>
      </div>
    </form>
  );
}

// Marca leído al MONTARSE el lector — no al renderizar la página en el servidor, porque el
// prefetch de Next visita enlaces que nadie abrió y marcaría leído medio buzón por asomarse.
export function MarcarLeido({ id }: { id: string }) {
  React.useEffect(() => {
    void marcarLeidoCorreo(id);
  }, [id]);
  return null;
}
