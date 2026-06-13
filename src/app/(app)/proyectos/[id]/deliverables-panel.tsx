import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/user-avatar";
import { StatusSelect } from "@/components/actions/status-select";
import {
  DELIVERABLE_STATUS,
  DELIVERABLE_TYPE,
  deliverableStatusMeta,
  formatShortDate,
} from "@/lib/ui";
import { cn } from "@/lib/utils";
import { createDeliverable, setDeliverableStatus, addDeliverableVersion } from "./actions";

type Version = {
  id: string;
  number: number;
  notes: string | null;
  fileUrl: string | null;
  createdAt: Date;
  uploadedBy: { initials: string | null; avatarColor: string | null } | null;
};
type Deliverable = {
  id: string;
  name: string;
  type: string;
  status: string;
  owner: { initials: string | null; avatarColor: string | null } | null;
  versions: Version[];
};

const STATUS_OPTIONS = Object.entries(DELIVERABLE_STATUS).map(([value, m]) => ({ value, label: m.label }));

export function DeliverablesPanel({
  projectId,
  deliverables,
}: {
  projectId: string;
  deliverables: Deliverable[];
}) {
  return (
    <div className="space-y-5">
      {/* Nuevo entregable */}
      <form
        action={createDeliverable.bind(null, projectId)}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3"
      >
        <input
          name="name"
          required
          placeholder="Nuevo entregable…"
          className="min-w-48 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <select name="type" defaultValue="REEL" className="rounded-md border border-input bg-background px-2 py-2 text-sm">
          {Object.entries(DELIVERABLE_TYPE).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Añadir
        </button>
      </form>

      {deliverables.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay entregables.</p>
      ) : null}

      {deliverables.map((d) => (
        <div key={d.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {d.owner ? <UserAvatar initials={d.owner.initials} color={d.owner.avatarColor} size="md" /> : null}
              <div>
                <h3 className="font-semibold">{d.name}</h3>
                <p className="text-xs text-muted-foreground">{DELIVERABLE_TYPE[d.type] ?? d.type}</p>
              </div>
            </div>
            <StatusSelect
              value={d.status}
              options={STATUS_OPTIONS}
              action={setDeliverableStatus.bind(null, d.id, projectId)}
              className={cn("border-0", deliverableStatusMeta(d.status).className)}
            />
          </div>

          {/* Versiones */}
          <div className="mt-4 space-y-2">
            {d.versions
              .slice()
              .sort((a, b) => b.number - a.number)
              .map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2">
                  <span className="rounded bg-background px-2 py-0.5 text-xs font-semibold">V{v.number}</span>
                  <span className="flex-1 text-sm">{v.notes ?? "Sin notas"}</span>
                  {v.fileUrl ? (
                    <a href={v.fileUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                      Abrir
                    </a>
                  ) : null}
                  <span className="text-[11px] text-muted-foreground">{formatShortDate(v.createdAt)}</span>
                  {v.uploadedBy ? (
                    <UserAvatar initials={v.uploadedBy.initials} color={v.uploadedBy.avatarColor} size="sm" />
                  ) : null}
                </div>
              ))}
          </div>

          {/* Nueva versión */}
          <form
            action={addDeliverableVersion.bind(null, d.id, projectId)}
            className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3"
          >
            <input
              name="notes"
              placeholder="Notas de la versión…"
              className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              name="fileUrl"
              placeholder="Link (opcional)"
              className="min-w-40 flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent">
              + Versión
            </button>
          </form>
        </div>
      ))}
    </div>
  );
}
