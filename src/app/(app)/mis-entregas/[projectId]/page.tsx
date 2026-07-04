import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Play, MessageSquare, CheckCircle2, Clock, Image as ImageIcon } from "lucide-react";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { signReviewToken } from "@/lib/review-token";
import { photoViewSrc } from "@/lib/deliverable-photo";
import { DELIVERABLE_TYPE, deliverableOrientation, formatTimecode } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { CoverThumb } from "./cover-thumb";

export const dynamic = "force-dynamic";

const CLIENT_STATES = ["ENVIADO_CLIENTE", "CORRECCIONES", "APROBADO", "ENTREGADO"] as const;

// Etiqueta de estado con la voz del cliente (no la interna del equipo).
const STATUS: Record<string, { label: string; className: string }> = {
  ENVIADO_CLIENTE: { label: "Para tu revisión", className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  CORRECCIONES: { label: "Cambios solicitados", className: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300" },
  APROBADO: { label: "Aprobado", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  ENTREGADO: { label: "Entregado", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
};

// Orden de los bloques por tipo dentro de la campaña.
const TYPE_ORDER = ["REEL", "REEL_CELULAR", "SHORT", "VIDEO_LARGO", "FOTOGRAFIA", "PODCAST", "TEASER", "DOCUMENTO", "OTRO"];

// Vista de una CAMPAÑA para el cliente: sus piezas organizadas por bloque (tipo). Cada pieza
// abre la sala de revisión completa (/review con token firmado) — el mismo motor con comentario
// al segundo, captura de fotograma y dibujo que ya usa el equipo.
export default async function CampaignPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { projectId } = await params;

  // El cliente invitado SOLO ve las piezas donde está "tagueado" como revisor (mismo criterio que
  // el dashboard). Un miembro del equipo que abriera esta vista ve todas las de cara al cliente.
  const mine =
    session.role === "cliente"
      ? { OR: [{ reviewers: { some: { userId: session.id } } }, { reviewerId: session.id }] }
      : {};

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      emoji: true,
      isPrivate: true,
      leadId: true,
      members: { select: { userId: true, role: true } },
      client: { select: { name: true, members: { select: { userId: true, role: true } } } },
      deliverables: {
        where: { status: { in: [...CLIENT_STATES] }, ...mine },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          dueDate: true,
          coverFileAssetId: true,
          versions: { where: { internalApproved: true }, orderBy: { number: "desc" }, take: 1, select: { number: true, durationSec: true } },
          reviewComments: { where: { OR: [{ fromClient: true }, { visibleToClient: true }] }, select: { id: true } },
        },
      },
    },
  });

  if (!project) notFound();
  if (!canAccessProject(project, session)) redirect("/mis-entregas");

  const total = project.deliverables.length;
  const approved = project.deliverables.filter((d) => d.status === "APROBADO" || d.status === "ENTREGADO").length;

  // Piezas agrupadas por bloque (tipo), respetando el orden definido.
  const blocks = TYPE_ORDER.map((type) => ({
    type,
    label: DELIVERABLE_TYPE[type] ?? type,
    items: project.deliverables.filter((d) => d.type === type),
  })).filter((b) => b.items.length > 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <Link href="/mis-entregas" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Tus entregas
      </Link>

      <header className="mt-3 mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <span>{project.emoji ?? "🎬"}</span> {project.name}
        </h1>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
          <CheckCircle2 className="size-3.5" /> {approved} de {total} aprobadas
        </span>
      </header>

      {blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Aún no hay piezas para revisar en esta campaña.
        </div>
      ) : (
        <div className="space-y-8">
          {blocks.map((b) => (
            <section key={b.type}>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
                {b.label} <span className="font-normal">· {b.items.length}</span>
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {b.items.map((d) => {
                  const st = STATUS[d.status] ?? { label: d.status, className: "bg-muted text-muted-foreground" };
                  const vertical = deliverableOrientation(d.type) === "vertical";
                  const isPhoto = d.type === "FOTOGRAFIA";
                  // Miniatura de portada para cualquier orientación (se captura un fotograma al subir).
                  const cover = d.coverFileAssetId ? photoViewSrc({ fileAssetId: d.coverFileAssetId, url: null }) : null;
                  const v = d.versions[0];
                  const token = signReviewToken(d.id);
                  const due = d.dueDate && (d.status === "ENVIADO_CLIENTE" || d.status === "CORRECCIONES")
                    ? new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" }).format(d.dueDate)
                    : null;
                  return (
                    <Link
                      key={d.id}
                      href={`/review/${token}`}
                      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40"
                    >
                      <div className={cn("relative w-full overflow-hidden bg-muted", vertical ? "aspect-[9/14]" : "aspect-video")}>
                        {/* Base: ícono de video/foto. Si hay portada la imagen lo tapa; si la portada
                            no carga (archivo ausente), este ícono queda de fallback y no una imagen rota. */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          {isPhoto ? <ImageIcon className="size-7 text-muted-foreground" /> : <Play className="size-7 text-muted-foreground" />}
                        </div>
                        {cover ? <CoverThumb src={cover} /> : null}
                        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="flex size-11 items-center justify-center rounded-full bg-white/90 text-foreground shadow-lg">
                            <Play className="size-5 translate-x-0.5 fill-current" />
                          </span>
                        </span>
                        {v ? <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">v{v.number}</span> : null}
                        {d.reviewComments.length > 0 ? (
                          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">
                            <MessageSquare className="size-3" /> {d.reviewComments.length}
                          </span>
                        ) : null}
                        {v?.durationSec ? (
                          <span className="absolute bottom-2 right-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{formatTimecode(v.durationSec)}</span>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-1.5 p-2.5">
                        <p className="truncate text-xs font-medium">{d.name}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn("inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-medium", st.className)}>{st.label}</span>
                          {due ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Clock className="size-3" /> Revisar antes del {due}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
