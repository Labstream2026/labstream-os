"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Play, Download, CheckCircle2, MessageSquare, Clock, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { clientCommentDeliverable, clientDecideDeliverable } from "./actions";

// Vista de ENTREGABLES para el PORTAL DEL CLIENTE (rol "cliente"). A diferencia del panel interno
// del equipo, aquí el cliente solo ve los entregables que ya salieron a su revisión (con una
// versión final que el equipo aprobó internamente), puede ABRIR el video/archivo final,
// COMENTAR y, si tiene permiso, APROBAR o solicitar cambios. No ve versiones en proceso,
// pre-aprobación interna, enlaces de revisión ni controles de subida del equipo.

export type ClientDeliverable = {
  id: string;
  name: string;
  type: string;
  status: string;
  dueDate: string | null;
  cover: { src: string } | null;
  finalVersion: { number: number; href: string | null } | null;
  comments: { id: string; authorName: string; body: string; fromClient: boolean; createdAt: string }[];
};

const STATUS: Record<string, { label: string; className: string }> = {
  ENVIADO_CLIENTE: { label: "Para tu revisión", className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  CORRECCIONES: { label: "Cambios solicitados", className: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300" },
  APROBADO: { label: "Aprobado", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  ENTREGADO: { label: "Entregado", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
};

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function ClientDeliverables({
  deliverables,
  canApprove,
  canComment,
}: {
  deliverables: ClientDeliverable[];
  canApprove: boolean;
  canComment: boolean;
}) {
  if (!deliverables.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <div className="text-4xl">🎬</div>
        <h2 className="mt-3 text-lg font-semibold">Aún no hay entregables para revisar</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Cuando el equipo de Labstream termine un video o material, aparecerá aquí para que lo veas y lo apruebes.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Aquí ves el material que el equipo ya terminó. Ábrelo, deja tu feedback y apruébalo cuando estés conforme.
      </p>
      {deliverables.map((d) => (
        <DeliverableCard key={d.id} d={d} canApprove={canApprove} canComment={canComment} />
      ))}
    </div>
  );
}

function DeliverableCard({ d, canApprove, canComment }: { d: ClientDeliverable; canApprove: boolean; canComment: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [comment, setComment] = React.useState("");
  const st = STATUS[d.status] ?? { label: d.status, className: "bg-muted text-muted-foreground" };
  const decidable = d.status === "ENVIADO_CLIENTE" || d.status === "CORRECCIONES";
  const final = d.finalVersion;

  const decide = (decision: "APROBADO" | "CAMBIOS") => {
    let note: string | undefined;
    if (decision === "APROBADO") {
      if (!window.confirm("¿Aprobar este entregable? El equipo recibirá tu aprobación.")) return;
    } else {
      note = window.prompt("¿Qué cambios necesitas? (opcional)") ?? undefined;
    }
    start(async () => {
      try {
        await clientDecideDeliverable(d.id, decision, note);
        router.refresh();
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  };

  const send = () => {
    const text = comment.trim();
    if (!text) return;
    start(async () => {
      try {
        await clientCommentDeliverable(d.id, final?.number ?? null, text);
        setComment("");
        router.refresh();
      } catch (e) {
        window.alert(e instanceof Error ? e.message : "No se pudo enviar.");
      }
    });
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Reproductor / portada */}
      <div className="relative aspect-[16/7] w-full bg-foreground/90">
        {d.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.cover.src} alt="" className="h-full w-full object-cover" />
        ) : null}
        {final?.href ? (
          <a
            href={final.href}
            target="_blank"
            rel="noreferrer"
            className="absolute inset-0 flex items-center justify-center"
            title="Ver el material final"
          >
            <span className="flex size-14 items-center justify-center rounded-full bg-white/90 text-foreground shadow-lg transition-transform hover:scale-105">
              <Play className="size-6 translate-x-0.5 fill-current" />
            </span>
          </a>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            <Clock className="mr-2 size-4" /> Aún no disponible
          </div>
        )}
        {final ? <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white">v{final.number}</span> : null}
      </div>

      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{d.name}</h3>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", st.className)}>{st.label}</span>
          {d.dueDate ? <span className="text-xs text-muted-foreground">· entrega {new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(new Date(d.dueDate))}</span> : null}
        </div>

        {/* Acciones */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {final?.href ? (
            <a href={final.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">
              <Download className="size-4" /> Ver / descargar
            </a>
          ) : null}
          {d.status === "APROBADO" || d.status === "ENTREGADO" ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
              <CheckCircle2 className="size-4" /> Aprobado por ti
            </span>
          ) : decidable && canApprove && final ? (
            <>
              <button type="button" onClick={() => decide("APROBADO")} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Aprobar
              </button>
              <button type="button" onClick={() => decide("CAMBIOS")} disabled={pending} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-60">
                Solicitar cambios
              </button>
            </>
          ) : null}
        </div>

        {/* Conversación */}
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MessageSquare className="size-3.5" /> Comentarios
          </div>
          {d.comments.length ? (
            <ul className="space-y-2">
              {d.comments.map((c) => (
                <li key={c.id} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.authorName}</span>
                    {c.fromClient ? <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">tú / cliente</span> : <span className="rounded-full bg-muted px-1.5 text-[10px]">equipo</span>}
                    <span>· {fmtDate(c.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Sin comentarios todavía.</p>
          )}

          {canComment ? (
            <div className="mt-3 flex items-end gap-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="Escribe tu feedback…"
                className="min-h-[2.5rem] flex-1 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <button type="button" onClick={send} disabled={pending || !comment.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
