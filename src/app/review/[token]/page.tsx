import type * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { verifyReviewToken, signReviewToken } from "@/lib/review-token";
import { isEmailEnabled } from "@/lib/email";
import { deliverableStatusMeta, deliverableOrientation } from "@/lib/ui";
import { buildStageVersions } from "@/lib/review-version";
import { photoViewSrc } from "@/lib/deliverable-photo";
import { PublicLinkInvalid } from "@/components/public-link-invalid";
import { Logo } from "@/components/brand/logo";
import { ReviewClient } from "./review-client";
import { PhotoGallery } from "./photo-gallery";
import { PhotoDecision } from "./photo-decision";
import { DownloadCenter } from "./download-center";
import { ReviewOnboarding } from "./review-onboarding";
import { EntityEmoji } from "@/components/icons/marks";

// Estado con la voz del cliente (no la etiqueta interna del equipo) para la cabecera de la sala.
const CLIENT_STATUS: Record<string, { label: string; className: string }> = {
  ENVIADO_CLIENTE: { label: "Para tu revisión", className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  CORRECCIONES: { label: "Cambios enviados", className: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300" },
  APROBADO: { label: "Aprobado", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  ENTREGADO: { label: "Entregado", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
};

// ── Tema «Estudio» de la sala del cliente ──
// SOLO esta ruta: gris casi negro elegante + acento en el naranja de la marca. Se aplica con la
// clase `dark` (activa las variantes dark: del motor) y un override de tokens en línea, así TODO
// el motor de revisión se retiñe sin tocar su código ni afectar a la bandeja interna del equipo.
const ROOM_VARS = {
  "--background": "240 5% 8%",
  "--foreground": "0 0% 95%",
  "--card": "240 5% 11%",
  "--card-foreground": "0 0% 95%",
  "--primary": "25 95% 53%", // naranja Labstream
  "--primary-foreground": "0 0% 100%",
  "--secondary": "240 5% 16%",
  "--secondary-foreground": "0 0% 92%",
  "--muted": "240 5% 14%",
  "--muted-foreground": "240 5% 66%",
  "--accent": "240 5% 16%",
  "--accent-foreground": "0 0% 95%",
  "--border": "240 5% 20%",
  "--input": "240 5% 24%",
  "--ring": "25 95% 53%",
} as React.CSSProperties;

// Cascarón de la sala: fondo carbón, resplandores naranjas suaves (le dan materia al efecto
// glass) y el scope oscuro. Lo usan la sala y sus pantallas de aviso, para una sola estética.
function RoomShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark relative min-h-screen overflow-x-clip bg-background text-foreground" style={ROOM_VARS}>
      <div aria-hidden className="pointer-events-none absolute -top-32 right-[-10%] size-96 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute bottom-[-6rem] left-[-8%] size-80 rounded-full bg-primary/10 blur-3xl" />
      {children}
    </div>
  );
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const deliverableId = verifyReviewToken(token);
  if (!deliverableId) return <PublicLinkInvalid />;

  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    include: {
      project: { select: { name: true, emoji: true, client: { select: { name: true } } } },
      versions: { orderBy: { number: "desc" }, include: { fileAsset: { select: { id: true, name: true } } } },
      // El portal del cliente SOLO carga los comentarios del cliente (fromClient) y las
      // RESPUESTAS del equipo dirigidas a él (visibleToClient, las de «Responder al cliente»).
      // Los comentarios INTERNOS de pre-aprobación nunca salen del servidor por este enlace.
      // El filtro vale también para las RESPUESTAS de hilo: una respuesta interna del equipo
      // (fromClient=false, visibleToClient=false) ni siquiera sale del servidor por este enlace.
      reviewComments: {
        where: { OR: [{ fromClient: true }, { visibleToClient: true }] },
        orderBy: { createdAt: "asc" },
        include: { resolvedBy: { select: { name: true } } },
      },
      photos: { orderBy: { position: "asc" } },
      // Archivos finales por formato (centro de descargas del cliente).
      renditions: { orderBy: { position: "asc" }, select: { id: true, format: true, label: true, url: true } },
    },
  });
  if (!deliverable) return <PublicLinkInvalid />;

  // Enlace revocado o caducado: estado inválido (no se muestra el material).
  const expired = deliverable.reviewExpiresAt ? deliverable.reviewExpiresAt.getTime() < Date.now() : false;
  if (deliverable.reviewRevokedAt || expired) {
    return (
      <RoomShell>
        <div className="flex min-h-screen items-center justify-center px-6 text-center">
          <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.05] p-8 backdrop-blur-xl">
            <Logo className="mx-auto h-6" />
            <h1 className="mt-4 text-xl font-bold">Enlace no disponible</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {expired ? "Este enlace de revisión ha caducado. Pide uno nuevo a tu productor." : "Este enlace de revisión fue revocado por el equipo. Pide uno nuevo a tu productor."}
            </p>
          </div>
        </div>
      </RoomShell>
    );
  }

  // Compuerta de ESTADO: el cliente solo ve la pieza cuando está de cara a él (enviada,
  // con cambios, aprobada o entregada). Si el equipo la regresó a producción/edición/revisión
  // interna, el enlace muestra un aviso amable en vez del material (y sin etiquetas internas).
  if (!CLIENT_STATUS[deliverable.status]) {
    return (
      <RoomShell>
        <div className="flex min-h-screen items-center justify-center px-6 text-center">
          <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.05] p-8 backdrop-blur-xl">
            <div className="text-4xl">🎬</div>
            <h1 className="mt-3 text-xl font-bold">Estamos trabajando en tu material</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              El equipo está preparando una nueva versión. Te avisaremos en cuanto esté lista para tu revisión.
            </p>
          </div>
        </div>
      </RoomShell>
    );
  }

  // Cuenta una visita (no bloquea el render si falla).
  await db.deliverable.update({ where: { id: deliverableId }, data: { reviewVisits: { increment: 1 } } }).catch(() => {});

  // Compuerta bloqueante: el cliente solo ve versiones aprobadas internamente.
  const approved = deliverable.versions.filter((v) => v.internalApproved);
  const statusPill = CLIENT_STATUS[deliverable.status];
  // Si quien visita tiene sesión de cliente (usuario invitado de la app), le ofrecemos volver a
  // su sala y le evitamos el paso de "¿cómo te llamas?" (ya sabemos quién es).
  const session = await getSession();
  const backHref = session?.role === "cliente" ? "/mis-entregas" : null;
  const sessionName = session?.role === "cliente" ? session.name : null;

  // ¿Es el USUARIO INVITADO autenticado? (rol cliente, con permiso de aprobar y miembro del
  // proyecto del entregable). Solo a él le damos la ventana de doble botón (Pre-aprobar + Aprobar)
  // y la posibilidad de reabrir un aprobado; el cliente FINAL por enlace (sin sesión) ve la sala
  // normal (Aprobar / Solicitar cambios).
  const isInvited =
    session?.role === "cliente" &&
    hasPermission(session, "aprobar_cliente") &&
    !!(await db.projectMember
      .findUnique({ where: { projectId_userId: { projectId: deliverable.projectId, userId: session.id } }, select: { userId: true } })
      .catch(() => null));
  const invited = isInvited
    ? {
        reviewLink: `${(process.env.NEXTAUTH_URL || "https://os.labstreamsas.com").replace(/\/$/, "")}/review/${signReviewToken(deliverable.id)}`,
        emailEnabled: await isEmailEnabled(),
      }
    : null;

  const versions = await buildStageVersions(approved);
  // Enlace de descarga al aprobar: la fuente de la última versión aprobada (Drive o archivo).
  const downloadUrl = versions[0]?.openUrl ?? null;

  // Entregable de FOTOGRAFIA: en vez del reproductor, una galería de selección. Las URLs de
  // visualización se calculan en el servidor (token de archivo para las locales, Drive para enlaces).
  const isPhoto = deliverable.type === "FOTOGRAFIA";
  const photos = deliverable.photos.map((p) => ({ id: p.id, filename: p.filename, src: photoViewSrc(p), pick: p.pick, clientNote: p.clientNote }));
  // La PORTADA es propia de los reels (vertical): la aprueba el cliente. En videos horizontales no aplica.
  const isReel = deliverableOrientation(deliverable.type) === "vertical";
  const coverSrc = isReel && deliverable.coverFileAssetId ? photoViewSrc({ fileAssetId: deliverable.coverFileAssetId, url: null }) : null;
  // Estado de la decisión de portada, atado al archivo actual (una portada nueva vuelve a "pendiente").
  const coverDecided = coverSrc && deliverable.coverDecisionFor && deliverable.coverDecisionFor === deliverable.coverFileAssetId;
  const coverStatus = !coverSrc ? null : coverDecided ? (deliverable.coverDecision === "APROBADA" ? "APROBADA" : "CAMBIOS") : "PENDIENTE";
  const coverDecisionBy = coverDecided ? deliverable.coverDecisionBy : null;
  const coverDecisionNote = coverDecided && deliverable.coverDecision === "CAMBIOS" ? deliverable.coverDecisionNote : null;

  return (
    <RoomShell>
      {/* Cabecera «glass»: logo + pieza + estado, flotando sobre el carbón. */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-white/[0.04] backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3.5">
          {backHref ? (
            <Link
              href={backHref}
              title="Volver a tus entregas"
              aria-label="Volver a tus entregas"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
            </Link>
          ) : null}
          <Logo className="h-6" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{deliverable.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              <EntityEmoji value={deliverable.project.emoji} /> {deliverable.project.name}
              {deliverable.project.client ? ` · ${deliverable.project.client.name}` : ""}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusPill.className}`}>{statusPill.label}</span>
        </div>
      </header>

      <main className="relative mx-auto max-w-5xl px-6 py-6">
        {isPhoto ? (
          photos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Aún no hay fotos para revisar. En cuanto el equipo las suba, las verás aquí para elegir.
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">Elige las fotos que te gustan y descarta las que no. Puedes dejar un comentario en cada una.</p>
              <PhotoGallery token={token} photos={photos} />
              {/* Las galerías también cierran su ciclo: aprobar/pedir cambios + descargas por formato. */}
              <PhotoDecision token={token} status={deliverable.status} sessionName={sessionName} invited={invited} />
              <DownloadCenter renditions={deliverable.renditions} />
              <ReviewOnboarding isPhoto />
            </>
          )
        ) : versions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            El material aún está en revisión interna del equipo. En cuanto esté listo, lo verás aquí.
          </div>
        ) : (
          <ReviewClient
            token={token}
            versions={versions}
            status={deliverable.status}
            allowDrawings
            orientation={deliverableOrientation(deliverable.type)}
            immersiveEligible={deliverable.type === "REEL_CELULAR"}
            deliverableName={deliverable.name}
            projectName={deliverable.project.name}
            projectEmoji={deliverable.project.emoji}
            clientName={deliverable.project.client?.name ?? null}
            sessionName={sessionName}
            invited={invited}
            copy={deliverable.copy}
            hashtags={deliverable.hashtags}
            coverSrc={coverSrc}
            coverStatus={coverStatus}
            coverForId={deliverable.coverFileAssetId}
            coverDecisionBy={coverDecisionBy}
            coverDecisionNote={coverDecisionNote}
            renditions={deliverable.renditions}
            downloadUrl={downloadUrl}
            comments={deliverable.reviewComments.map((c) => ({
              id: c.id,
              authorName: c.authorName,
              body: c.body,
              timecode: c.timecode,
              versionNumber: c.versionNumber,
              drawing: (c.drawingData as { image?: string } | null) ?? null,
              isNote: c.isNote,
              fromClient: c.fromClient,
              visibleToClient: c.visibleToClient,
              resolved: c.resolved,
              // El cliente ve el estado y la prioridad de cada corrección (solo lectura), y las
              // respuestas del hilo que le llegaron (parentId las ancla bajo su corrección).
              priority: c.priority,
              resolvedAt: c.resolvedAt?.toISOString() ?? null,
              resolvedByName: c.resolvedBy?.name ?? null,
              editedAt: c.editedAt?.toISOString() ?? null,
              parentId: c.parentId,
              createdAt: c.createdAt.toISOString(),
            }))}
          />
        )}
      </main>
    </RoomShell>
  );
}
