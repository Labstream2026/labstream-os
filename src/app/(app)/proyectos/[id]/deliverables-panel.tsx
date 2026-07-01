import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import { StatusSelect } from "@/components/actions/status-select";
import { DateInput } from "@/components/actions/date-input";
import { Check, Clock, ClipboardCheck, Trash2, ImagePlus, ChevronRight } from "lucide-react";
import { ConfirmSubmit } from "@/components/confirm-submit";
import {
  DELIVERABLE_STATUS,
  DELIVERABLE_TYPE,
  deliverableStatusMeta,
  deliverableOrientation,
  formatShortDate,
} from "@/lib/ui";
import { cn } from "@/lib/utils";
import { toDateInputValue } from "./task-shared";
import { signReviewToken } from "@/lib/review-token";
import { detectSource, SOURCE_LABEL } from "@/lib/media-source";
import { EmailReviewButton } from "./email-review-button";
import { PreApproval, ReviewLinkBar, ReviewThread } from "./deliverable-review";
import { createDeliverable, setDeliverableStatus, setDeliverableType, addDeliverableVersion, deleteDeliverable, setReviewExpiry, addDeliverablePhotos, deleteDeliverablePhoto, setDeliverableCover, removeDeliverableCover } from "./actions";
import { ReviewersPicker } from "./reviewers-picker";
import { DeliverableContentEditor, CoverStatusBadge } from "./deliverable-content-editor";
import { DeliverableRenditions } from "./deliverable-renditions";
import { SubmitButton } from "@/components/submit-button";

const REVIEW_BASE = process.env.NEXTAUTH_URL || "";

type Version = {
  id: string;
  number: number;
  notes: string | null;
  fileUrl: string | null;
  fileAssetId: string | null;
  internalApproved: boolean;
  createdAt: Date;
  uploadedBy: { initials: string | null; avatarColor: string | null } | null;
};
type Decision = {
  id: string;
  versionNumber: number | null;
  stage: string;
  result: string;
  byName: string | null;
  note: string | null;
  createdAt: Date;
};
type Photo = {
  id: string;
  filename: string;
  src: string; // miniatura/visualización (servidor)
  downloadSrc: string;
  pick: string; // PENDIENTE | ME_GUSTA | NO_ME_GUSTA
  clientNote: string | null;
};
type Member = { id: string; name: string; initials: string | null; color: string | null };
type Deliverable = {
  id: string;
  name: string;
  type: string;
  status: string;
  dueDate: Date | string | null;
  owner: { initials: string | null; avatarColor: string | null } | null;
  reviewerId: string | null;
  reviewerIds: string[]; // co-revisores que pueden pre-aprobar
  reviewExpiresAt: Date | string | null;
  reviewVisits: number;
  reviewRevoked: boolean;
  reviewAllowDrawings: boolean;
  cover: { src: string; full: string } | null; // portada del reel (imagen que acompaña al video)
  versions: Version[];
  photos: Photo[];
  decisions: Decision[];
  comments: {
    id: string;
    authorName: string;
    body: string;
    timecode: number | null;
    versionNumber: number | null;
    image: string | null;
    isNote: boolean;
    resolved: boolean;
    fromClient: boolean;
    createdAt: Date;
  }[];
};

const STATUS_OPTIONS = Object.entries(DELIVERABLE_STATUS).map(([value, m]) => ({ value, label: m.label }));
// Formatos editables después de publicar (vertical / horizontal / foto…): mismas opciones que al crear.
const TYPE_OPTIONS = Object.entries(DELIVERABLE_TYPE).map(([value, label]) => ({ value, label }));

const PICK_META: Record<string, { label: string; cls: string }> = {
  ME_GUSTA: { label: "♥ Le gusta", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  NO_ME_GUSTA: { label: "✗ Descartada", cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  PENDIENTE: { label: "Pendiente", cls: "bg-background text-muted-foreground" },
};

// Galería de fotos del entregable (type = FOTOGRAFIA): el equipo sube fotos (NAS o enlaces de
// Drive) y ve qué marcó el cliente. La selección la hace el cliente desde su portal de revisión.
function PhotoManager({ deliverableId, projectId, canManage, photos }: { deliverableId: string; projectId: string; canManage: boolean; photos: Photo[] }) {
  const liked = photos.filter((p) => p.pick === "ME_GUSTA").length;
  const disliked = photos.filter((p) => p.pick === "NO_ME_GUSTA").length;
  const pending = photos.length - liked - disliked;
  return (
    <div className="mt-4 space-y-3">
      {canManage ? (
        <form action={addDeliverablePhotos.bind(null, projectId, deliverableId)} className="space-y-2 rounded-lg border border-dashed border-border p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold"><ImagePlus className="size-3.5" /> Añadir fotos a la galería</p>
          <input type="file" name="photos" accept="image/*" multiple className="block w-full text-xs file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1.5 file:text-xs" />
          <textarea name="photoLinks" rows={2} placeholder="…o pega enlaces de Google Drive / imágenes (uno por línea)" className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring" />
          <SubmitButton pendingText="Subiendo…" className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Añadir fotos</SubmitButton>
        </form>
      ) : null}

      {photos.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">{photos.length} fotos</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">♥ {liked} le gustan</span>
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">✗ {disliked} descartadas</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{pending} pendientes</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((p) => {
              const meta = PICK_META[p.pick] ?? PICK_META.PENDIENTE;
              return (
                <div key={p.id} className="group relative overflow-hidden rounded-lg border border-border bg-muted/40">
                  <a href={p.downloadSrc} target="_blank" rel="noreferrer" title={`Descargar ${p.filename}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt={p.filename} loading="lazy" className="aspect-square w-full object-cover" />
                  </a>
                  <span className={cn("absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-medium", meta.cls)}>{meta.label}</span>
                  {canManage ? (
                    <form action={deleteDeliverablePhoto.bind(null, p.id, projectId)} className="absolute right-1 top-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                      <ConfirmSubmit message={`¿Eliminar la foto «${p.filename}»?`} className="flex size-6 items-center justify-center rounded bg-background/80 text-muted-foreground hover:text-destructive" title="Eliminar foto">
                        <Trash2 className="size-3.5" />
                      </ConfirmSubmit>
                    </form>
                  ) : null}
                  {p.clientNote ? <p className="line-clamp-2 px-1.5 py-1 text-[10px] text-muted-foreground">“{p.clientNote}”</p> : null}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Aún no hay fotos. Súbelas arriba; el cliente las verá en su enlace de revisión para marcar las que le gustan y las que no.</p>
      )}
    </div>
  );
}

function sourceLabel(v: Version): string | null {
  if (v.fileAssetId) return "Archivo subido";
  const s = detectSource(v.fileUrl);
  return s ? SOURCE_LABEL[s.type] : null;
}

// Portada del reel: imagen que acompaña al video entregado. El equipo la sube/cambia/quita.
// Solo para entregables de video (no para galerías de fotos, que tienen su propia cuadrícula).
function CoverManager({ deliverableId, projectId, canManage, cover }: { deliverableId: string; projectId: string; canManage: boolean; cover: { src: string; full: string } | null }) {
  if (!cover && !canManage) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-3">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <a href={cover.full} data-lightbox rel="noreferrer" title="Ver portada a tamaño completo" className="shrink-0 cursor-zoom-in">
          <img src={cover.src} alt="Portada del reel" className="h-20 w-32 rounded-md border border-border object-cover" />
        </a>
      ) : (
        <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
          <ImagePlus className="size-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold">🖼️ Portada del reel</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">La imagen que el cliente aprueba antes de publicar el reel.</p>
        {cover ? <div className="mt-1.5"><CoverStatusBadge deliverableId={deliverableId} /></div> : null}
        {canManage ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <form action={setDeliverableCover.bind(null, projectId, deliverableId)} className="flex items-center gap-2">
              <input type="file" name="cover" accept="image/*" required className="max-w-44 text-xs file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-xs" />
              <SubmitButton pendingText="Subiendo…" className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90">{cover ? "Cambiar" : "Subir portada"}</SubmitButton>
            </form>
            {cover ? (
              <form action={removeDeliverableCover.bind(null, projectId, deliverableId)}>
                <SubmitButton pendingText="Quitando…" className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-destructive">Quitar</SubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DeliverablesPanel({
  projectId,
  canManage = false,
  deliverables,
  members = [],
  emailEnabled = false,
}: {
  projectId: string;
  canManage?: boolean;
  deliverables: Deliverable[];
  members?: Member[];
  emailEnabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      {/* Nuevo entregable para revisión: nombre/video, link o archivo, responsable de
          revisión (solo miembros), caducidad opcional del enlace y fecha de entrega. */}
      <form
        action={createDeliverable.bind(null, projectId)}
        className="space-y-2.5 rounded-xl border border-border bg-card p-4"
      >
        <p className="text-sm font-semibold">Subir para revisión</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-[11px] font-medium text-muted-foreground">
            Nombre
            <input name="name" required placeholder="Nombre del proyecto o video…" className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
            Tipo de contenido
            <select name="type" defaultValue="REEL" title="Define el formato de revisión: vertical (9:16), horizontal (16:9) o galería de fotos" className="rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground">
              {Object.entries(DELIVERABLE_TYPE).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <input name="fileUrl" placeholder="Link (Drive · YouTube · Vimeo · MP4)" className="min-w-48 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input type="file" name="file" title="O sube el material (vídeo, imagen, PDF…)" className="max-w-56 text-xs file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1.5 file:text-xs" />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
            Responsable de la revisión
            <select name="reviewerId" defaultValue="" className="rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground">
              <option value="">Sin responsable</option>
              {members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
            Caduca el enlace (opcional)
            <input name="reviewExpiresAt" type="date" title="Si lo dejas vacío, el enlace no caduca" className="rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground" />
          </label>
          <SubmitButton pendingText="Subiendo…" className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Añadir</SubmitButton>
        </div>
        <p className="text-[11px] text-muted-foreground">Si añades link o archivo, se crea la v1 y pasa a pre-aprobación interna del responsable de la revisión.</p>
      </form>

      {deliverables.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay entregables.</p> : null}

      {deliverables.map((d) => {
        const sorted = d.versions.slice().sort((a, b) => b.number - a.number);
        const latest = sorted[0] ?? null;
        const hasApproved = d.versions.some((v) => v.internalApproved);
        const reviewUrl = `${REVIEW_BASE}/review/${signReviewToken(d.id)}`;
        const isPhoto = d.type === "FOTOGRAFIA";
        // La portada es propia de los reels (vertical). En videos horizontales no aplica.
        const isVertical = deliverableOrientation(d.type) === "vertical";
        const verCount = isPhoto ? d.photos.length : d.versions.length;
        const comCount = d.comments.length;
        const summaryBits = isPhoto ? `${verCount} foto${verCount === 1 ? "" : "s"}` : `${verCount} versión${verCount === 1 ? "" : "es"}`;
        return (
          <div key={d.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {d.owner ? <UserAvatar initials={d.owner.initials} color={d.owner.avatarColor} size="md" /> : null}
                <div>
                  <h3 className="font-semibold">{d.name}</h3>
                  <p className="text-xs text-muted-foreground">{DELIVERABLE_TYPE[d.type] ?? d.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {d.versions.length > 0 ? (
                  <Link href={`/revisiones/${d.id}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent" title="Abrir en la bandeja de revisión (player + comentarios)">
                    <ClipboardCheck className="size-3.5" /> Revisar
                  </Link>
                ) : null}
                <StatusSelect value={d.status} options={STATUS_OPTIONS} action={setDeliverableStatus.bind(null, d.id, projectId)} className={cn("border-0", deliverableStatusMeta(d.status).className)} />
                {canManage ? (
                  <form action={deleteDeliverable.bind(null, d.id, projectId)}>
                    <ConfirmSubmit message={`¿Eliminar el entregable «${d.name}» con TODAS sus versiones, comentarios y decisiones? No se puede deshacer.`} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Borrar todo">
                      <Trash2 className="size-4" />
                    </ConfirmSubmit>
                  </form>
                ) : null}
              </div>
            </div>

            {/* Contenido (versiones, correcciones, portada, enlaces) PLEGADO por defecto: así se ve
                de un vistazo qué entregable abrir. El usuario despliega el que quiere. */}
            <details className="group/det mt-1">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight className="size-4 shrink-0 transition-transform group-open/det:rotate-90" />
                <span>Ver contenido y correcciones</span>
                <span className="text-xs font-normal">· {summaryBits}{comCount > 0 ? ` · ${comCount} comentario${comCount === 1 ? "" : "s"}` : ""}</span>
              </summary>
              <div className="pt-1">

            {/* Portada: solo para reels (vertical). No aplica a videos horizontales ni a galerías de fotos. */}
            {isVertical ? <CoverManager deliverableId={d.id} projectId={projectId} canManage={canManage} cover={d.cover} /> : null}

            {/* Copy + hashtags que el cliente verá y podrá copiar en su sala de revisión */}
            {canManage ? <DeliverableContentEditor deliverableId={d.id} /> : null}

            {/* Archivos finales por formato (centro de descargas del cliente) */}
            {canManage ? <DeliverableRenditions deliverableId={d.id} /> : null}

            {/* Formato + responsable de la revisión + caducidad del enlace (editable por el responsable) */}
            {canManage ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Formato:</span>
                  {/* Se puede cambiar DESPUÉS de publicar (vertical / horizontal / foto). Define la
                      orientación de la revisión. */}
                  <StatusSelect value={d.type} options={TYPE_OPTIONS} action={setDeliverableType.bind(null, d.id, projectId)} />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Revisores (pre-aprueban):</span>
                  <ReviewersPicker deliverableId={d.id} projectId={projectId} members={members} value={d.reviewerIds} />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Caduca el enlace:</span>
                  <DateInput name="reviewExpiresAt" value={toDateInputValue(d.reviewExpiresAt)} action={setReviewExpiry.bind(null, d.id, projectId)} title="Vacío = el enlace no caduca" />
                  {!d.reviewExpiresAt ? <span className="text-muted-foreground">sin caducidad</span> : null}
                </span>
              </div>
            ) : null}

            {/* Galería de fotos (FOTOGRAFIA) o versiones de video/archivo (resto) */}
            {isPhoto ? (
              <PhotoManager deliverableId={d.id} projectId={projectId} canManage={canManage} photos={d.photos} />
            ) : (
            <div className="mt-4 space-y-2">
              {sorted.map((v) => {
                const src = sourceLabel(v);
                return (
                  <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 px-3 py-2">
                    <span className="rounded bg-background px-2 py-0.5 text-xs font-semibold">V{v.number}</span>
                    {v.internalApproved ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><Check className="size-3" /> Aprobada interna</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"><Clock className="size-3" /> Pendiente interna</span>
                    )}
                    <span className="flex-1 text-sm">{v.notes ?? "Sin notas"}</span>
                    {src ? <span className="rounded bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">{src}</span> : null}
                    {v.fileAssetId ? (
                      <a href={`/api/files-asset/${v.fileAssetId}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Ver archivo</a>
                    ) : v.fileUrl ? (
                      <a href={v.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Abrir</a>
                    ) : null}
                    <span className="text-[11px] text-muted-foreground">{formatShortDate(v.createdAt)}</span>
                    {v.uploadedBy ? <UserAvatar initials={v.uploadedBy.initials} color={v.uploadedBy.avatarColor} size="sm" /> : null}
                    {/* Pre-aprobación interna de la última versión pendiente */}
                    {canManage && latest && v.id === latest.id && !v.internalApproved ? (
                      <PreApproval deliverableId={d.id} projectId={projectId} versionNumber={v.number} />
                    ) : null}
                  </div>
                );
              })}
            </div>
            )}

            {/* Decisiones */}
            {d.decisions.length > 0 ? (
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Decisiones</p>
                <ul className="space-y-1">
                  {d.decisions.map((dec) => {
                    const ok = dec.result === "APROBADO";
                    return (
                      <li key={dec.id} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={cn("rounded px-1.5 py-0.5 font-medium", dec.stage === "INTERNA" ? "bg-secondary text-secondary-foreground" : "bg-primary/10 text-primary")}>
                          {dec.stage === "INTERNA" ? "Interna" : "Cliente"}
                        </span>
                        <span className={ok ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}>
                          {ok ? "Aprobado" : "Cambios solicitados"}
                        </span>
                        {dec.versionNumber ? <span className="text-muted-foreground">v{dec.versionNumber}</span> : null}
                        {dec.byName ? <span className="text-muted-foreground">· {dec.byName}</span> : null}
                        <span className="text-muted-foreground">· {formatShortDate(dec.createdAt)}</span>
                        {dec.note ? <span className="w-full text-muted-foreground">“{dec.note}”</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {/* Enlace de revisión del cliente */}
            <div className="mt-3">
              <ReviewLinkBar
                deliverableId={d.id}
                projectId={projectId}
                url={reviewUrl}
                visits={d.reviewVisits}
                revoked={d.reviewRevoked}
                allowDrawings={d.reviewAllowDrawings}
                hasApproved={hasApproved}
              >
                {emailEnabled && !d.reviewRevoked ? <EmailReviewButton deliverableId={d.id} /> : null}
              </ReviewLinkBar>
            </div>

            {/* Comentarios del cliente (resolver + responder) */}
            <ReviewThread deliverableId={d.id} projectId={projectId} comments={d.comments} />

            {/* Nueva versión (solo material de video/archivo; las fotos se añaden arriba) */}
            {!isPhoto ? (
              <>
                <form action={addDeliverableVersion.bind(null, d.id, projectId)} className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <input name="notes" placeholder="¿Qué cambió en esta versión?" className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
                  <input name="fileUrl" placeholder="Link (Drive · YouTube · Vimeo · MP4)" className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
                  <input type="file" name="file" title="Sube el material (vídeo, imagen, PDF…) para que el cliente lo vea en el portal" className="max-w-52 text-xs file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-xs" />
                  <button className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">+ Versión</button>
                </form>
                <p className="mt-1.5 text-[11px] text-muted-foreground">Cada versión nueva pasa a pre-aprobación interna antes de llegar al cliente.</p>
              </>
            ) : null}
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
}
