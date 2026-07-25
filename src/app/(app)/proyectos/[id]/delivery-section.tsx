import { Package } from "lucide-react";
import { db } from "@/lib/db";
import { getDeliveryPackage } from "@/lib/delivery-data";
import { signDeliveryToken } from "@/lib/delivery-token";
import { deliveryCountdownLabel, deliveryDaysLeft } from "@/lib/delivery-groups";
import { formatBogota, formatBogotaDate } from "@/lib/bogota-time";
import { cn } from "@/lib/utils";
import { DeliveryControls, ExcludeToggle } from "./delivery-controls";

// Pestaña «Entrega» de los entregables del proyecto: el paquete que ve el cliente (sala
// /entrega + Entregas finales del portal). Autónoma: consulta lo suyo, como MaterialCard.
// Aquí el equipo genera el enlace, fija la vigencia, decide qué entra y ve la actividad.

const BASE = (process.env.NEXTAUTH_URL || "https://os.labstreamsas.com").replace(/\/$/, "");

export async function DeliverySection({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { deliveryNonce: true, deliveryRevokedAt: true, deliveryExpiresAt: true, deliveryVisits: true },
  });
  if (!project) return null;

  const pack = await getDeliveryPackage(projectId);
  const active = Boolean(project.deliveryNonce) && !project.deliveryRevokedAt;
  const daysLeft = deliveryDaysLeft(project.deliveryExpiresAt);
  const expired = active && daysLeft !== null && daysLeft <= 0;
  const url = active && project.deliveryNonce ? `${BASE}/entrega/${signDeliveryToken(projectId, project.deliveryNonce)}` : null;

  const [downloads, events] = await Promise.all([
    db.deliveryEvent.count({ where: { projectId, kind: "DOWNLOAD" } }),
    db.deliveryEvent.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 8, select: { kind: true, label: true, createdAt: true } }),
  ]);
  const lastEvent = events[0] ?? null;

  const estado = !project.deliveryNonce
    ? { label: "Sin generar", cls: "bg-muted text-muted-foreground" }
    : project.deliveryRevokedAt
      ? { label: "Revocado", cls: "bg-destructive/10 text-destructive" }
      : expired
        ? { label: "Vencido", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" }
        : { label: "Activo", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };

  const expiresLabel = project.deliveryExpiresAt
    ? `hasta el ${formatBogotaDate(project.deliveryExpiresAt, { day: "numeric", month: "short" })} (${deliveryCountdownLabel(daysLeft) ?? ""})`
    : null;

  const included = pack.items.filter((i) => !i.excluded);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="flex items-center gap-2 text-sm font-bold tracking-tight">
            <Package className="size-4 text-primary" /> Paquete de entrega
          </h3>
          <span className={cn("rounded-full px-2.5 py-0.5 text-[10.5px] font-bold", estado.cls)}>{estado.label}</span>
          {active ? (
            <span className="ml-auto text-[11px] text-muted-foreground">
              {project.deliveryVisits} {project.deliveryVisits === 1 ? "visita" : "visitas"} · {downloads} descargas
              {lastEvent ? ` · última ${formatBogota(lastEvent.createdAt)}` : ""}
            </span>
          ) : null}
        </div>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">
          Un solo enlace con TODO el material final del proyecto (videos, formatos, fotos y portadas) para que el
          cliente lo descargue sin cuenta. Sigue vivo aunque el proyecto se termine o archive; los invitados con
          cuenta lo ven siempre en «Entregas finales».
        </p>
        <DeliveryControls projectId={projectId} canManage={canManage} active={active} url={url} expiresLabel={expiresLabel} />
        {events.length > 0 ? (
          <details className="mt-3 border-t border-border pt-2.5">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Actividad reciente ({events.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {events.map((e, i) => (
                <li key={i} className="flex items-baseline gap-2 text-xs">
                  <span className="shrink-0 text-muted-foreground">{formatBogota(e.createdAt)}</span>
                  <span className="min-w-0 truncate">
                    {e.kind === "VISIT" ? "El cliente abrió la sala de entrega" : `Descargó: ${e.label ?? "un archivo"}`}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Qué incluye · {included.length} de {pack.items.length} piezas
          {pack.covers.length ? ` · ${pack.covers.length} portadas` : ""}
        </p>
        {pack.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay material aprobado o entregado. Cuando el cliente apruebe piezas, entran solas al paquete.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {pack.items.map((i) => (
              <li key={i.id} className={cn("flex items-center gap-2.5 py-2", i.excluded && "opacity-55")}>
                <ExcludeToggle deliverableId={i.id} excluded={i.excluded} disabled={!canManage} />
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground">
                  {i.typeLabel}
                </span>
                <span className="min-w-0 truncate text-sm">
                  {i.number ? <span className="text-muted-foreground">#{i.number} · </span> : null}
                  {i.name}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                  {i.photos
                    ? `${i.photos.count} fotos`
                    : [i.download ? "máster" : null, i.renditions.length ? `${i.renditions.length} formatos` : null]
                        .filter(Boolean)
                        .join(" + ") || "sin archivo"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
