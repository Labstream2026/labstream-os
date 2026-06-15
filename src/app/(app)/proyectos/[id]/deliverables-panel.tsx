import { UserAvatar } from "@/components/user-avatar";
import { StatusSelect } from "@/components/actions/status-select";
import { DateInput } from "@/components/actions/date-input";
import { Check, Clock } from "lucide-react";
import {
  DELIVERABLE_STATUS,
  DELIVERABLE_TYPE,
  deliverableStatusMeta,
  formatShortDate,
} from "@/lib/ui";
import { cn } from "@/lib/utils";
import { toDateInputValue } from "./task-shared";
import { signReviewToken } from "@/lib/review-token";
import { detectSource, SOURCE_LABEL } from "@/lib/media-source";
import { EmailReviewButton } from "./email-review-button";
import { PreApproval, ReviewLinkBar } from "./deliverable-review";
import { createDeliverable, setDeliverableStatus, addDeliverableVersion, setDeliverableDueDate } from "./actions";

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
type Deliverable = {
  id: string;
  name: string;
  type: string;
  status: string;
  dueDate: Date | string | null;
  owner: { initials: string | null; avatarColor: string | null } | null;
  reviewVisits: number;
  reviewRevoked: boolean;
  reviewAllowDrawings: boolean;
  versions: Version[];
  decisions: Decision[];
};

const STATUS_OPTIONS = Object.entries(DELIVERABLE_STATUS).map(([value, m]) => ({ value, label: m.label }));

function sourceLabel(v: Version): string | null {
  if (v.fileAssetId) return "Archivo subido";
  const s = detectSource(v.fileUrl);
  return s ? SOURCE_LABEL[s.type] : null;
}

export function DeliverablesPanel({
  projectId,
  canManage = false,
  deliverables,
  emailEnabled = false,
}: {
  projectId: string;
  canManage?: boolean;
  deliverables: Deliverable[];
  emailEnabled?: boolean;
}) {
  return (
    <div className="space-y-5">
      {/* Nuevo entregable */}
      <form
        action={createDeliverable.bind(null, projectId)}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3"
      >
        <input name="name" required placeholder="Nuevo entregable…" className="min-w-48 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <select name="type" defaultValue="REEL" className="rounded-md border border-input bg-background px-2 py-2 text-sm">
          {Object.entries(DELIVERABLE_TYPE).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
        </select>
        <input name="dueDate" type="date" title="Fecha de entrega" className="rounded-md border border-input bg-background px-2 py-2 text-sm" />
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Añadir</button>
      </form>

      {deliverables.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay entregables.</p> : null}

      {deliverables.map((d) => {
        const sorted = d.versions.slice().sort((a, b) => b.number - a.number);
        const latest = sorted[0] ?? null;
        const hasApproved = d.versions.some((v) => v.internalApproved);
        const reviewUrl = `${REVIEW_BASE}/review/${signReviewToken(d.id)}`;
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
                <span className="text-[11px] text-muted-foreground">🏁 Entrega</span>
                <DateInput name="dueDate" value={toDateInputValue(d.dueDate)} action={setDeliverableDueDate.bind(null, d.id, projectId)} title="Fecha de entrega" />
                <StatusSelect value={d.status} options={STATUS_OPTIONS} action={setDeliverableStatus.bind(null, d.id, projectId)} className={cn("border-0", deliverableStatusMeta(d.status).className)} />
              </div>
            </div>

            {/* Versiones */}
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

            {/* Nueva versión */}
            <form action={addDeliverableVersion.bind(null, d.id, projectId)} className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <input name="notes" placeholder="¿Qué cambió en esta versión?" className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <input name="fileUrl" placeholder="Link (Drive · YouTube · Vimeo · MP4)" className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <input type="file" name="file" title="Sube el material (vídeo, imagen, PDF…) para que el cliente lo vea en el portal" className="max-w-52 text-xs file:mr-2 file:rounded file:border file:border-border file:bg-background file:px-2 file:py-1 file:text-xs" />
              <button className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">+ Versión</button>
            </form>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Cada versión nueva pasa a pre-aprobación interna antes de llegar al cliente.</p>
          </div>
        );
      })}
    </div>
  );
}
