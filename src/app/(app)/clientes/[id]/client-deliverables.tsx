import Link from "next/link";
import { deliverableStatusMeta, DELIVERABLE_TYPE, formatShortDate } from "@/lib/ui";
import { cn } from "@/lib/utils";

// Un entregable aplanado: trae consigo el proyecto al que pertenece para mostrarlo
// como etiqueta (la vista junta los entregables de TODOS los proyectos del cliente).
export type ClientDeliverable = {
  id: string;
  name: string;
  type: string;
  status: string;
  dueDate: Date | null;
  versionNumber: number | null;
  project: { id: string; name: string; emoji: string | null };
};

// Orden de los grupos: lo más accionable arriba (cambios, revisión, con cliente) y
// lo ya resuelto al final (aprobado/entregado). Solo se muestran los grupos con items.
const STATUS_ORDER = [
  "CORRECCIONES",
  "REVISION_INTERNA",
  "ENVIADO_CLIENTE",
  "EN_EDICION",
  "EN_PRODUCCION",
  "PENDIENTE",
  "APROBADO",
  "ENTREGADO",
];

const TYPE_EMOJI: Record<string, string> = {
  REEL: "🎬",
  SHORT: "🎬",
  VIDEO_LARGO: "🎬",
  TEASER: "🎬",
  FOTOGRAFIA: "📸",
  PODCAST: "🎙️",
  DOCUMENTO: "📄",
  OTRO: "📦",
};

export function ClientDeliverables({ deliverables }: { deliverables: ClientDeliverable[] }) {
  if (deliverables.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <p className="text-3xl">📦</p>
        <p className="mt-2 text-sm font-medium">Este cliente aún no tiene entregables</p>
        <p className="text-sm text-muted-foreground">Se crean dentro de cada proyecto, en la pestaña «Entregables».</p>
      </div>
    );
  }

  // Conteo por estado para la tira-resumen (solo estados presentes).
  const counts = new Map<string, number>();
  for (const d of deliverables) counts.set(d.status, (counts.get(d.status) ?? 0) + 1);

  const groups = STATUS_ORDER
    .map((status) => ({ status, items: deliverables.filter((d) => d.status === status) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      {/* Resumen por estado: el total de un vistazo y dónde está cada cosa. */}
      <div className="flex flex-wrap gap-2">
        {STATUS_ORDER.filter((s) => counts.has(s)).map((status) => {
          const meta = deliverableStatusMeta(status);
          return (
            <span key={status} className={cn("rounded-full px-3 py-1 text-xs font-medium", meta.className)}>
              {counts.get(status)} · {meta.label}
            </span>
          );
        })}
      </div>

      {groups.map((g) => {
        const meta = deliverableStatusMeta(g.status);
        return (
          <section key={g.status}>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              {meta.label}
              <span className="text-xs font-normal text-muted-foreground">({g.items.length})</span>
            </h3>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
              {g.items.map((d) => (
                <Link
                  key={d.id}
                  href={`/proyectos/${d.project.id}?tab=entregables`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <span className="text-lg leading-none">{TYPE_EMOJI[d.type] ?? "📦"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.project.emoji ?? "🎬"} {d.project.name}
                      {" · "}
                      {DELIVERABLE_TYPE[d.type] ?? d.type}
                      {d.versionNumber ? ` · v${d.versionNumber}` : " · sin versión"}
                      {d.dueDate ? ` · vence ${formatShortDate(d.dueDate)}` : ""}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", meta.className)}>
                    {meta.label}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
