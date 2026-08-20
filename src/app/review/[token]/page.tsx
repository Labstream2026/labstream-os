import type * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { resolveReviewToken, signReviewToken } from "@/lib/review-token";
import { isEmailEnabled } from "@/lib/email";
import { deliverableStatusMeta, deliverableOrientation } from "@/lib/ui";
import { buildStageVersions } from "@/lib/review-version";
import { photoViewSrc, photoThumbSrc, photoLightboxSrc, photoMarkSrc } from "@/lib/deliverable-photo";
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

// La misma cabecera para el enlace de BORRADOR, en cualquier estado del entregable: lo que el
// externo necesita saber no es la etiqueta interna del equipo, sino que esto todavía se mueve.
const DRAFT_PILL = { label: "Borrador — versión de trabajo", className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" };

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
  // Un mismo /review/[token] atiende los DOS enlaces: el oficial y el de borrador. El scope
  // viaja firmado dentro del token, así que aquí solo hay que preguntar cuál es.
  const resolved = resolveReviewToken(token);
  if (!resolved) return <PublicLinkInvalid />;
  const { deliverableId, mode } = resolved;
  const isDraft = mode === "draft";

  const deliverable = await db.deliverable.findUnique({
    where: { id: deliverableId },
    include: {
      project: { select: { name: true, emoji: true, archivedAt: true, client: { select: { name: true } } } },
      // `kind`/`path` del archivo: con ellos se sabe si la pieza vive en el disco de LabTem y
      // ya tiene escalera adaptativa fabricada (ver `buildStageVersions`).
      versions: { orderBy: { number: "desc" }, include: { fileAsset: { select: { id: true, name: true, kind: true, path: true } } } },
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
      // Curaduría: lo excluido por el equipo NO sale del servidor por este enlace (ni en borrador).
      photos: { where: { excludedAt: null }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
      // Archivos finales por formato (centro de descargas del cliente).
      renditions: { orderBy: { position: "asc" }, select: { id: true, format: true, label: true, url: true } },
    },
  });
  if (!deliverable) return <PublicLinkInvalid />;
  // Proyecto en la PAPELERA: su material deja de estar accesible por enlace público. (Los
  // TERMINADOS sí siguen: el cliente conserva su centro de descargas del material aprobado.)
  if (deliverable.project.archivedAt) return <PublicLinkInvalid />;

  // Vigencia: cada enlace con la suya. El oficial se apaga con reviewRevokedAt/reviewExpiresAt;
  // el borrador vive mientras draftShareAt esté puesto y no haya vencido. Apagar uno NO toca al
  // otro — que es justo la razón de que sean tokens distintos.
  const expired = isDraft
    ? !!deliverable.draftShareExpiresAt && deliverable.draftShareExpiresAt.getTime() < Date.now()
    : !!deliverable.reviewExpiresAt && deliverable.reviewExpiresAt.getTime() < Date.now();
  const revoked = isDraft ? !deliverable.draftShareAt : !!deliverable.reviewRevokedAt;
  if (revoked || expired) {
    return (
      <RoomShell>
        <div className="flex min-h-screen items-center justify-center px-6 text-center">
          <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.05] p-8 backdrop-blur-xl">
            <Logo className="mx-auto h-6" />
            <h1 className="mt-4 text-xl font-bold">Enlace no disponible</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {expired
                ? `Este enlace de ${isDraft ? "borrador" : "revisión"} ha caducado. Pide uno nuevo a tu productor.`
                : `Este enlace de ${isDraft ? "borrador" : "revisión"} fue ${isDraft ? "apagado" : "revocado"} por el equipo. Pide uno nuevo a tu productor.`}
            </p>
          </div>
        </div>
      </RoomShell>
    );
  }

  // Compuerta de ESTADO: el cliente solo ve la pieza cuando está de cara a él (enviada,
  // con cambios, aprobada o entregada). Si el equipo la regresó a producción/edición/revisión
  // interna, el enlace muestra un aviso amable en vez del material (y sin etiquetas internas).
  // El BORRADOR se salta esta compuerta a propósito: existe justo para enseñar la pieza en
  // pre-producción, y a cambio no deja aprobar ni descargar (ver más abajo).
  if (!isDraft && !CLIENT_STATUS[deliverable.status]) {
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

  // Cuenta una visita (no bloquea el render si falla). Cada enlace lleva su propio contador:
  // así el productor distingue quién entró al borrador de quién entró al oficial.
  await db.deliverable
    .update({ where: { id: deliverableId }, data: isDraft ? { draftShareVisits: { increment: 1 } } : { reviewVisits: { increment: 1 } } })
    .catch(() => {});

  // Compuerta bloqueante: el cliente solo ve versiones aprobadas internamente. En BORRADOR es
  // exactamente la compuerta que se levanta —de eso se trata—: se muestra el material tal como
  // está, y la cabecera lo dice sin rodeos.
  const approved = isDraft ? deliverable.versions : deliverable.versions.filter((v) => v.internalApproved);
  const statusPill = isDraft ? DRAFT_PILL : CLIENT_STATUS[deliverable.status];
  // Si quien visita tiene sesión de cliente (usuario invitado de la app), le ofrecemos volver a
  // su sala y le evitamos el paso de "¿cómo te llamas?" (ya sabemos quién es).
  const session = await getSession();
  const backHref = session?.role === "cliente" ? "/mis-entregas" : null;
  const sessionName = session?.role === "cliente" ? session.name : null;

  // ¿Es el USUARIO INVITADO autenticado? (rol cliente, con permiso de aprobar y miembro del
  // proyecto del entregable). Solo a él le damos la ventana de doble botón (Pre-aprobar + Aprobar)
  // y la posibilidad de reabrir un aprobado; el cliente FINAL por enlace (sin sesión) ve la sala
  // normal (Aprobar / Solicitar cambios).
  // En BORRADOR nadie estrena la ventana de doble botón: ahí no se aprueba, ni el invitado.
  const isInvited =
    !isDraft &&
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
  // En BORRADOR no hay descarga: material sin pre-aprobar se ve, no se lleva.
  const downloadUrl = isDraft ? null : (versions[0]?.openUrl ?? null);
  // Los archivos finales por formato son del entregable terminado; el borrador no los ofrece.
  const renditions = isDraft ? [] : deliverable.renditions;

  // Entregable de FOTOGRAFIA: en vez del reproductor, una galería de selección. Las URLs de
  // visualización se calculan en el servidor (token de archivo para las locales, Drive para enlaces).
  const isPhoto = deliverable.type === "FOTOGRAFIA";
  const photos = deliverable.photos.map((p) => ({
    id: p.id,
    filename: p.filename,
    // Miniatura ~480 para la cuadrícula y vista ~1600 para el visor: el cliente no carga megas
    // para ojear, y mirar fotos no escribe «descargas» en la actividad.
    src: photoThumbSrc(p),
    srcXl: photoLightboxSrc(p),
    // Lo que el cliente rayó sobre la foto, si existe (JPEG aplanado servido aparte).
    marca: p.drawnAt ? photoMarkSrc(p.id) : null,
    pick: p.pick,
    clientNote: p.clientNote,
    seccion: p.section,
    // Proporción para las filas justificadas; sin dimensiones (fotos de Drive o viejas), 3:2 y
    // la galería la corrige al cargar la imagen.
    ar: p.width && p.height ? Math.min(2.8, Math.max(0.4, p.width / p.height)) : 1.5,
  }));
  // Héroe de la galería: la portada elegida en el estudio o, si no hay, la primera foto.
  const fotosCover = isPhoto
    ? deliverable.coverFileAssetId
      ? photoLightboxSrc({ fileAssetId: deliverable.coverFileAssetId, url: null })
      : (photos[0]?.srcXl ?? null)
    : null;
  // La PORTADA es propia de los reels (vertical): la aprueba el cliente. En videos horizontales no aplica.
  const isReel = deliverableOrientation(deliverable.type) === "vertical";
  const coverSrc = isReel && deliverable.coverFileAssetId ? photoViewSrc({ fileAssetId: deliverable.coverFileAssetId, url: null }) : null;
  // Estado de la decisión de portada, atado al archivo actual (una portada nueva vuelve a "pendiente").
  const coverDecided = coverSrc && deliverable.coverDecisionFor && deliverable.coverDecisionFor === deliverable.coverFileAssetId;
  // La pestaña de portada ES un panel de aprobación: en borrador no se pinta (coverStatus null
  // la esconde), igual que el resto de decisiones.
  const coverStatus = isDraft || !coverSrc ? null : coverDecided ? (deliverable.coverDecision === "APROBADA" ? "APROBADA" : "CAMBIOS") : "PENDIENTE";
  const coverDecisionBy = coverDecided ? deliverable.coverDecisionBy : null;
  const coverDecisionNote = coverDecided && deliverable.coverDecision === "CAMBIOS" ? deliverable.coverDecisionNote : null;

  // En pantallas grandes la sala aprovecha el ancho: videos horizontales (player más grande +
  // comentarios al lado) y galerías de fotos (más columnas). Los reels 9/16 se quedan en 5xl.
  const wideRoom = !isReel;
  const shellW = wideRoom ? " xl:max-w-[1880px]" : "";

  return (
    <RoomShell>
      {/* Cabecera «glass»: logo + pieza + estado, flotando sobre el carbón. */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-white/[0.04] backdrop-blur-xl">
        <div className={`mx-auto flex max-w-5xl items-center gap-3 px-6 py-3.5${shellW}`}>
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

      <main className={`relative mx-auto max-w-5xl px-6 py-6${shellW}`}>
        {/* Aviso de BORRADOR: quien abre este enlace tiene que saber, antes de mirar nada, que
            está viendo trabajo en curso y que lo que se espera de él son comentarios. */}
        {isDraft ? (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <p className="font-semibold">Esto todavía está en edición</p>
            <p className="mt-1 text-amber-200/80">
              Te lo compartimos antes de tiempo para que puedas opinar mientras aún es fácil cambiarlo. Deja tus comentarios
              {isPhoto ? " en cada foto" : " sobre el minuto exacto"} y el equipo los recibe al instante. La aprobación final llega después, en otro enlace.
            </p>
          </div>
        ) : null}
        {isPhoto ? (
          photos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Aún no hay fotos para revisar. En cuanto el equipo las suba, las verás aquí para elegir.
            </div>
          ) : (
            <>
              <PhotoGallery
                token={token}
                photos={photos}
                setName={deliverable.name}
                clientName={deliverable.project.client?.name ?? null}
                coverSrc={fotosCover}
              />
              {/* Las galerías también cierran su ciclo: aprobar/pedir cambios + descargas por formato.
                  En BORRADOR no: ahí se elige y se comenta, pero no se aprueba ni se descarga. */}
              {isDraft ? null : (
                <>
                  {/* Ancla del botón «Terminé mi selección» de la barra flotante de la galería. */}
                  <div id="decision-fotos">
                    <PhotoDecision token={token} status={deliverable.status} sessionName={sessionName} invited={invited} />
                  </div>
                  <DownloadCenter renditions={renditions} />
                </>
              )}
              <ReviewOnboarding isPhoto draftMode={isDraft} />
            </>
          )
        ) : versions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            {isDraft
              ? "Aún no hay ninguna versión subida. En cuanto el equipo suba la primera, aparecerá aquí."
              : "El material aún está en revisión interna del equipo. En cuanto esté listo, lo verás aquí."}
          </div>
        ) : (
          <ReviewClient
            token={token}
            versions={versions}
            status={deliverable.status}
            allowDrawings
            orientation={deliverableOrientation(deliverable.type)}
            immersiveEligible={deliverableOrientation(deliverable.type) === "vertical"}
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
            renditions={renditions}
            downloadUrl={downloadUrl}
            draftMode={isDraft}
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
