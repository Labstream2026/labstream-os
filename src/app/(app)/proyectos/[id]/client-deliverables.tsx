"use client";

import * as React from "react";
import Link from "next/link";
import { Play, CheckCircle2, MessageSquare, Clock, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// Vista de ENTREGABLES para el PORTAL DEL CLIENTE (rol "cliente"). Cada pieza ABRE la SALA de
// revisión unificada (/review/[token]) —la misma de «Mis entregas»— donde el usuario invitado ve
// el reproductor, comenta con timecode/dibujo y decide con el sistema completo: Aprobar (final),
// Solicitar/Reabrir cambios, o Pre-aprobar y enviar el enlace al cliente final. Esta tarjeta es
// solo el LANZADOR: portada, estado y el feedback reciente de un vistazo.

export type ClientDeliverable = {
  id: string;
  name: string;
  type: string;
  status: string;
  dueDate: string | null;
  cover: { src: string } | null;
  finalVersion: { number: number; href: string | null } | null;
  // Enlace a la sala de revisión (token firmado en el servidor).
  reviewHref: string;
  comments: { id: string; authorName: string; body: string; fromClient: boolean; createdAt: string }[];
};

const STATUS: Record<string, { label: string; className: string }> = {
  ENVIADO_CLIENTE: { label: "Para tu revisión", className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  CORRECCIONES: { label: "Cambios solicitados", className: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300" },
  APROBADO: { label: "Aprobado", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  ENTREGADO: { label: "Entregado", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
};

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function ClientDeliverables({
  deliverables,
  canApprove,
}: {
  deliverables: ClientDeliverable[];
  canApprove: boolean;
  // Conservado por compatibilidad con la llamada (comentar/decidir se hace en la sala).
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
        Aquí ves el material que el equipo ya terminó. Ábrelo para revisarlo, dejar tu feedback y {canApprove ? "aprobarlo o pre-aprobarlo" : "comentarlo"}.
      </p>
      {deliverables.map((d) => (
        <DeliverableCard key={d.id} d={d} canApprove={canApprove} />
      ))}
    </div>
  );
}

function DeliverableCard({ d, canApprove }: { d: ClientDeliverable; canApprove: boolean }) {
  const st = STATUS[d.status] ?? { label: d.status, className: "bg-muted text-muted-foreground" };
  const final = d.finalVersion;
  const decided = d.status === "APROBADO" || d.status === "ENTREGADO";

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Portada → abre la sala de revisión */}
      <Link href={d.reviewHref} className="relative block aspect-[16/7] w-full bg-foreground/90" title="Abrir la sala de revisión">
        {d.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.cover.src} alt="" className="h-full w-full object-cover" />
        ) : null}
        {final ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-white/90 text-foreground shadow-lg transition-transform hover:scale-105">
              <Play className="size-6 translate-x-0.5 fill-current" />
            </span>
          </span>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            <Clock className="mr-2 size-4" /> Aún no disponible
          </span>
        )}
        {final ? <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white">v{final.number}</span> : null}
      </Link>

      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{d.name}</h3>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", st.className)}>{st.label}</span>
        </div>

        {/* Acción única: abrir la sala de revisión unificada. */}
        <div className="mt-3">
          <Link href={d.reviewHref} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {decided ? (
              <>
                <CheckCircle2 className="size-4" /> Ver revisión
              </>
            ) : (
              <>
                Abrir revisión{canApprove ? " y aprobar" : ""} <ArrowRight className="size-4" />
              </>
            )}
          </Link>
        </div>

        {/* Feedback reciente (solo lectura); comentar y decidir se hace dentro de la sala. */}
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MessageSquare className="size-3.5" /> Comentarios
          </div>
          {d.comments.length ? (
            <ul className="space-y-2">
              {d.comments.slice(-4).map((c) => (
                <li key={c.id} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.authorName}</span>
                    {c.fromClient ? (
                      <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">tú / cliente</span>
                    ) : (
                      <span className="rounded-full bg-muted px-1.5 text-[10px]">equipo</span>
                    )}
                    <span>· {fmtDate(c.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Sin comentarios todavía. Ábrelo para dejar el primero.</p>
          )}
        </div>
      </div>
    </section>
  );
}
