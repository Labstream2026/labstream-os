import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import { StatusSelect } from "@/components/actions/status-select";
import { DateInput } from "@/components/actions/date-input";
import { Check, Clock, ClipboardCheck, Trash2, ImagePlus, ChevronRight } from "lucide-react";
import { ConfirmSubmit } from "@/components/confirm-submit";
import {
  DELIVERABLE_STATUS,
  DELIVERABLE_TYPE,
  DELIVERABLE_TYPE_OPTIONS,
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
import { createDeliverable, setDeliverableStatus, setDeliverableType, addDeliverableVersion, deleteDeliverable, setReviewExpiry, setInternalReviewDue, addDeliverablePhotos, deleteDeliverablePhoto, removeDeliverableCover } from "./actions";
import { DeliverablesSpace } from "./deliverables-space";
import { formatBogota } from "@/lib/bogota-time";
import { ReviewersPicker } from "./reviewers-picker";
import { VideoUploadField } from "./video-upload-field";
import { DeliverableContentEditor, CoverStatusBadge } from "./deliverable-content-editor";
import { DeliverableRenditions } from "./deliverable-renditions";
import { TypeAndCoverFields } from "./deliverable-create-fields";
import { DeliverableTabs } from "./deliverable-tabs";
import { SubmitButton } from "@/components/submit-button";

const REVIEW_BASE = process.env.NEXTAUTH_URL || "";

// Instante UTC → valores para <input type=date/time> en hora de Bogotá (para editar plazos).
const YMD_BOG = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" });
const HM_BOG = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
function bogYmd(v: Date | string | null): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? "" : YMD_BOG.format(d);
}
function bogHm(v: Date | string | null): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  return Number.isNaN(d.getTime()) ? "" : HM_BOG.format(d);
}

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
  // Consecutivo por proyecto (#1, #2…): identifica la pieza también en «Aprobados».
  number: number | null;
  type: string;
  status: string;
  dueDate: Date | string | null;
  // Límite de pre-aprobación interna y plazo vigente de la corrección (instantes UTC).
  internalReviewDueAt: Date | string | null;
  fixDueAt: Date | string | null;
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
    priority?: "OBLIGATORIA" | "SUGERENCIA";
    parentId?: string | null;
    createdAt: Date;
  }[];
};

const STATUS_OPTIONS = Object.entries(DELIVERABLE_STATUS).map(([value, m]) => ({ value, label: m.label }));
// Formatos editables después de publicar: SOLO vertical y horizontal (mismas opciones que al crear).
const TYPE_OPTIONS = DELIVERABLE_TYPE_OPTIONS.map(([value, label]) => ({ value, label }));

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

export function DeliverablesPanel({
  projectId,
  canManage = false,
  deliverables,
  members = [],
  workTasks = [],
  emailEnabled = false,
}: {
  projectId: string;
  canManage?: boolean;
  deliverables: Deliverable[];
  members?: Member[];
  // Tareas del proyecto marcadas como "ítem de entregable", abiertas y sin vincular:
  // elegibles en el desplegable del formulario (se completan solas al mandar la versión).
  workTasks?: { id: string; title: string; assignee: string | null }[];
  emailEnabled?: boolean;
}) {
  // Lo VIVO se trabaja en «En curso»; lo que el cliente ya aprobó pasa al archivo
  // «Aprobados» (ordenado por consecutivo descendente) para no estorbar la ventana.
  const APPROVED = new Set(["APROBADO", "ENTREGADO"]);
  const activeList = deliverables.filter((d) => !APPROVED.has(d.status));
  const approvedList = deliverables
    .filter((d) => APPROVED.has(d.status))
    .sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
  return (
    <div className="space-y-5">
      {/* Nuevo entregable para revisión: nombre/video, link o archivo, responsable de
          revisión (solo miembros), caducidad opcional del enlace y fecha de entrega. */}
      <form
        action={createDeliverable.bind(null, projectId)}
        className="space-y-3 rounded-xl border border-border bg-card p-4"
      >
        <p className="text-sm font-semibold">Subir para revisión</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-[11px] font-medium text-muted-foreground">
            Nombre
            <input name="name" required placeholder="Nombre del proyecto o video…" className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
          </label>
          {/* Tipo + portada (la portada solo aparece si el tipo es reel) */}
          <TypeAndCoverFields options={DELIVERABLE_TYPE_OPTIONS} />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <input name="fileUrl" placeholder="Link (Drive · YouTube · Vimeo · MP4)" className="min-w-48 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <VideoUploadField name="file" title="O sube el material (vídeo, imagen, PDF…)" className="max-w-56 text-xs file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1.5 file:text-xs" />
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
            Caduca el enlace <span className="font-normal text-muted-foreground/70">· opcional</span>
            <input name="reviewExpiresAt" type="date" title="Si lo dejas vacío, el enlace no caduca" className="rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground" />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
            Pre-aprobación vence <span className="font-normal text-muted-foreground/70">· opcional</span>
            <span className="flex items-center gap-1">
              <input name="internalReviewDate" type="date" title="Plazo para que el equipo pre-apruebe. Si vence sin revisar, la tarea del revisor queda como incumplida" className="rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground" />
              <input name="internalReviewTime" type="time" defaultValue="18:00" title="Hora límite (Bogotá)" className="rounded-md border border-input bg-background px-2 py-2 text-sm text-foreground" />
            </span>
          </label>
          <SubmitButton pendingText="Subiendo…" className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Añadir</SubmitButton>
        </div>
        {workTasks.length > 0 ? (
          <details className="rounded-lg border border-dashed border-border px-3 py-2">
            <summary className="cursor-pointer list-none text-[11px] font-medium text-muted-foreground">
              Tareas de entregable vinculadas <span className="font-normal text-muted-foreground/70">· {workTasks.length} disponible{workTasks.length === 1 ? "" : "s"} · se completan solas al mandar la versión</span>
            </summary>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {workTasks.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name="workTaskIds" value={t.id} className="size-3.5 accent-[#F47A20]" />
                  <span className="truncate">{t.title}{t.assignee ? <span className="text-muted-foreground"> · {t.assignee}</span> : null}</span>
                </label>
              ))}
            </div>
          </details>
        ) : null}
        <p className="text-[11px] text-muted-foreground">Si añades link o archivo, se crea la v1 y pasa a pre-aprobación interna del responsable de la revisión.</p>
      </form>

      {(() => {
      const renderCard = (d: Deliverable) => {
        const sorted = d.versions.slice().sort((a, b) => b.number - a.number);
        const latest = sorted[0] ?? null;
        const hasApproved = d.versions.some((v) => v.internalApproved);
        const reviewUrl = `${REVIEW_BASE}/review/${signReviewToken(d.id)}`;
        const isPhoto = d.type === "FOTOGRAFIA";
        // La portada es propia de los reels (vertical). En videos horizontales no aplica.
        const isVertical = deliverableOrientation(d.type) === "vertical";
        // Resumen del <summary> calculado en el SERVIDOR: correcciones = comentarios raíz
        // que no son notas (las respuestas de hilo y las notas generales no se tildan).
        // Es una instantánea del render: no se refresca al tildar casillas — el conteo
        // vivo está dentro de la pestaña Correcciones.
        const fixes = d.comments.filter((c) => c.parentId == null && !c.isNote);
        const fixesDone = fixes.filter((c) => c.resolved).length;
        const fixesPending = fixes.length - fixesDone;
        const mediaBits = isPhoto
          ? `${d.photos.length} foto${d.photos.length === 1 ? "" : "s"}`
          : latest
            ? `v${latest.number}`
            : "sin versiones";
        return (
          <div key={d.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {d.owner ? <UserAvatar initials={d.owner.initials} color={d.owner.avatarColor} size="md" /> : null}
                <div>
                  <h3 className="font-semibold">
                    {d.number ? <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground" title="Consecutivo del entregable en este proyecto">#{d.number}</span> : null}
                    {d.name}
                  </h3>
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

            {/* Contenido PLEGADO por defecto: así se ve de un vistazo qué entregable abrir.
                El resumen del summary (mini barra de correcciones + versión/fotos + visitas)
                permite decidir sin desplegar; al abrir, el trabajo se organiza en pestañas. */}
            <details className="group/det mt-1">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ChevronRight className="size-4 shrink-0 transition-transform group-open/det:rotate-90" />
                {fixes.length > 0 ? (
                  <>
                    {/* Mini barra de progreso de correcciones (hechas/total) */}
                    <span aria-hidden className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.round((fixesDone / fixes.length) * 100)}%` }} />
                    </span>
                    <span>{fixesDone} de {fixes.length} {fixes.length === 1 ? "corrección hecha" : "correcciones hechas"}</span>
                  </>
                ) : (
                  <span>Sin correcciones</span>
                )}
                <span className="text-xs font-normal">· {mediaBits} · {d.reviewVisits} visita{d.reviewVisits === 1 ? "" : "s"}</span>
              </summary>
              <div className="pt-1">
                <DeliverableTabs
                  // Si hay correcciones, el editor cae directo a trabajarlas; si no, al contenido.
                  defaultKey={fixes.length > 0 ? "correcciones" : "contenido"}
                  tabs={[
                    {
                      key: "correcciones",
                      label: "Correcciones",
                      badge: fixesPending,
                      content: (
                        <div>
                          {/* Plazo VIGENTE de la corrección en curso (lo fija el productor al pedir cambios;
                              el cliente nunca lo ve — esta vista es solo del equipo). */}
                          {d.fixDueAt && d.status === "CORRECCIONES" ? (
                            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                              ⏱ La corrección vence el {formatBogota(d.fixDueAt)} — si la nueva versión llega después, la tarea queda como incumplida.
                            </p>
                          ) : null}

                          {/* Checklist de correcciones del cliente (resolver + responder) */}
                          <ReviewThread deliverableId={d.id} projectId={projectId} comments={d.comments} />

                          {/* CTA de cierre del ciclo: subir la versión corregida (solo material de
                              video/archivo; las fotos se añaden en Contenido). Mismo gating de siempre:
                              !isPhoto y sin canManage — cualquier editor sube su corrección. */}
                          {!isPhoto ? (
                            <div className="mt-4 space-y-2 rounded-lg bg-muted/40 p-3">
                              <p className="text-xs font-semibold">¿Correcciones listas? Sube la versión corregida y pasará a pre-aprobación.</p>
                              <form action={addDeliverableVersion.bind(null, d.id, projectId)} className="flex flex-wrap items-center gap-2">
                                <input name="notes" placeholder="¿Qué cambió en esta versión?" className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
                                <label className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground" title="Nuevo plazo de pre-aprobación para esta versión (opcional; si lo dejas vacío se conserva el actual)">
                                  Pre-aprobar antes de
                                  <input type="date" name="internalReviewDate" className="rounded-md border border-input bg-background px-1.5 py-1 text-xs" />
                                  <input type="time" name="internalReviewTime" defaultValue="18:00" className="rounded-md border border-input bg-background px-1.5 py-1 text-xs" />
                                </label>
                                <input name="fileUrl" placeholder="Link (Drive · YouTube · Vimeo · MP4)" className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
                                <VideoUploadField name="file" title="Sube el material (vídeo, imagen, PDF…) para que el cliente lo vea en el portal" className="max-w-52 text-xs file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-xs" />
                                {/* Portada opcional adjunta a la versión (solo reels; reemplaza la anterior si existía) */}
                                {isVertical ? (
                                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground" title="Imagen de portada que acompaña al reel (opcional)">
                                    Portada
                                    <input type="file" name="cover" accept="image/*" className="max-w-44 text-xs file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-xs" />
                                  </label>
                                ) : null}
                                <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">+ Subir versión</button>
                              </form>
                              <p className="text-[11px] text-muted-foreground">Cada versión nueva pasa a pre-aprobación interna antes de llegar al cliente.</p>
                            </div>
                          ) : null}
                        </div>
                      ),
                    },
                    {
                      key: "contenido",
                      label: "Contenido",
                      content: (
                        <div>
                          {/* Galería de fotos (FOTOGRAFIA) o versiones de video/archivo (resto) */}
                          {isPhoto ? (
                            <PhotoManager deliverableId={d.id} projectId={projectId} canManage={canManage} photos={d.photos} />
                          ) : (
                            <div className="space-y-2">
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

                          {/* Extras del reel (portada + copy/hashtags): solo aplican a los reels, igual que en la
                              sala del cliente. En horizontales/fotos no se muestran para dejar la vista más limpia. */}
                          {isVertical ? (
                            <div className="mt-3 space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Extras del reel</p>
                              {/* Portada: se adjunta al subir una versión; aquí se ve su estado de aprobación del cliente. */}
                              {d.cover ? (
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <a href={d.cover.full} data-lightbox rel="noreferrer" title="Ver portada a tamaño completo" className="shrink-0 cursor-zoom-in">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={d.cover.src} alt="Portada del reel" className="h-10 w-7 rounded border border-border object-cover" />
                                  </a>
                                  <span className="text-muted-foreground">Portada</span>
                                  <CoverStatusBadge deliverableId={d.id} />
                                  {canManage ? (
                                    <form action={removeDeliverableCover.bind(null, projectId, d.id)}>
                                      <SubmitButton pendingText="Quitando…" className="text-xs text-muted-foreground hover:text-destructive">Quitar</SubmitButton>
                                    </form>
                                  ) : null}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">Sin portada. Adjúntala al subir una versión.</p>
                              )}
                              {/* Copy + hashtags que el cliente verá y podrá copiar en su sala de revisión */}
                              {canManage ? <DeliverableContentEditor deliverableId={d.id} /> : null}
                            </div>
                          ) : d.cover ? (
                            // Horizontal/foto con portada huérfana: solo dejar quitarla, sin la sección de extras.
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                              <a href={d.cover.full} data-lightbox rel="noreferrer" title="Ver portada a tamaño completo" className="shrink-0 cursor-zoom-in">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={d.cover.src} alt="Portada" className="h-10 w-7 rounded border border-border object-cover" />
                              </a>
                              <span className="text-muted-foreground">Portada</span>
                              <CoverStatusBadge deliverableId={d.id} />
                              {canManage ? (
                                <form action={removeDeliverableCover.bind(null, projectId, d.id)}>
                                  <SubmitButton pendingText="Quitando…" className="text-xs text-muted-foreground hover:text-destructive">Quitar</SubmitButton>
                                </form>
                              ) : null}
                            </div>
                          ) : null}

                          {/* Archivos finales por formato (centro de descargas del cliente) */}
                          {canManage ? <DeliverableRenditions deliverableId={d.id} /> : null}
                        </div>
                      ),
                    },
                    {
                      key: "enlace",
                      label: "Enlace y ajustes",
                      content: (
                        <div>
                          {/* Enlace de revisión del cliente */}
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

                          {/* Ajustes en filas etiqueta/control (los mismos controles de siempre,
                              ordenados: nada de formularios crudos apilados). Editable solo por
                              quien gestiona, como hasta ahora. */}
                          {canManage ? (
                            <div className="mt-3 divide-y divide-border rounded-lg border border-border text-xs">
                              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                {/* Se puede cambiar DESPUÉS de publicar (vertical / horizontal / foto).
                                    Define la orientación de la revisión. */}
                                <span className="text-muted-foreground">Formato</span>
                                <StatusSelect value={d.type} options={TYPE_OPTIONS} action={setDeliverableType.bind(null, d.id, projectId)} />
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                <span className="text-muted-foreground">Revisores que pre-aprueban</span>
                                <ReviewersPicker deliverableId={d.id} projectId={projectId} members={members} value={d.reviewerIds} />
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                <span className="text-muted-foreground">Caduca el enlace</span>
                                <span className="flex items-center gap-1.5">
                                  <DateInput name="reviewExpiresAt" value={toDateInputValue(d.reviewExpiresAt)} action={setReviewExpiry.bind(null, d.id, projectId)} title="Vacío = el enlace no caduca" />
                                  {!d.reviewExpiresAt ? <span className="text-muted-foreground">sin caducidad</span> : null}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                <span className="text-muted-foreground" title="Plazo para que el equipo pre-apruebe. Al vencer, quien no revisó queda con la tarea incumplida">Pre-aprobación vence</span>
                                <span className="flex items-center gap-1.5">
                                  <form action={setInternalReviewDue.bind(null, d.id, projectId)} className="flex items-center gap-1">
                                    <input type="date" name="internalReviewDate" defaultValue={bogYmd(d.internalReviewDueAt)} className="rounded-md border border-input bg-background px-1.5 py-1 text-xs" />
                                    <input type="time" name="internalReviewTime" defaultValue={bogHm(d.internalReviewDueAt) || "18:00"} className="rounded-md border border-input bg-background px-1.5 py-1 text-xs" />
                                    <SubmitButton pendingText="…" className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent">OK</SubmitButton>
                                  </form>
                                  {!d.internalReviewDueAt ? <span className="text-muted-foreground">sin plazo</span> : null}
                                </span>
                              </div>
                            </div>
                          ) : null}

                          {/* Decisiones plegadas: son historial, no trabajo pendiente */}
                          {d.decisions.length > 0 ? (
                            <details className="mt-3 rounded-lg border border-border px-3 py-2">
                              <summary className="cursor-pointer list-none text-xs font-semibold text-muted-foreground hover:text-foreground">
                                Decisiones ({d.decisions.length})
                              </summary>
                              <ul className="mt-2 space-y-1">
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
                            </details>
                          ) : null}
                        </div>
                      ),
                    },
                  ]}
                />
              </div>
            </details>
          </div>
        );
      };
      return (
        <DeliverablesSpace
          activeCount={activeList.length}
          approvedCount={approvedList.length}
          active={
            <div className="space-y-5">
              {activeList.length === 0 ? <p className="text-sm text-muted-foreground">No hay entregables en curso. Crea uno arriba.</p> : activeList.map(renderCard)}
            </div>
          }
          approved={
            <div className="space-y-5">
              {approvedList.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay entregables aprobados por el cliente. Cuando apruebe uno, se archiva aquí con su consecutivo.</p>
              ) : (
                approvedList.map(renderCard)
              )}
            </div>
          }
        />
      );
      })()}
    </div>
  );
}
