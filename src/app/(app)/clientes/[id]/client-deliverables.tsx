"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Film, Loader2, MessageSquare, Package } from "lucide-react";
import { deliverableStatusMeta, DELIVERABLE_TYPE } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { EntityEmoji } from "@/components/icons/marks";
import { setDeliverableStatus } from "@/app/(app)/proyectos/[id]/actions";

// ── Pestaña «Entregables» del cliente (rediseño aprobado por prototipo) ──
// Antes: filas de icono + texto, sin ver el material ni poder actuar. Ahora cada pieza enseña
// su PORTADA (la asignada; si no hay, el fotograma del video vía ?poster=1) y trae las dos
// acciones que se venían a buscar: «Comentar» (a la sala de revisión interna) y «Aprobar»
// (pre-aprobado → aprobado, para el productor con permiso). Todo lo sensible se calcula en el
// SERVIDOR (thumbSrc firmable, canApprove con el gate real); aquí solo se pinta y se dispara.

export type ClientDeliverable = {
  id: string;
  name: string;
  number: number | null;
  type: string;
  status: string;
  dueDate: Date | null; // lo usa la página (alerta de vencidos, próxima entrega)
  dueLabel: string | null;
  overdue: boolean;
  versionNumber: number | null;
  project: { id: string; name: string; emoji: string | null };
  // Portada asignada o fotograma del video (?poster=1); null = icono.
  thumbSrc: string | null;
  comments: number;
  // Visitas del cliente al enlace de revisión: 0 = pre-aprobado sin abrir; >0 = ya lo vio.
  reviewVisits: number;
  // Gestiona el proyecto Y tiene aprobar_entregables (mismo gate que la sala de revisiones).
  canApprove: boolean;
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

// Chip de estado, con el matiz de «Enviado a cliente»: pre-aprobado (aún no lo abre) vs con
// el cliente (ya lo está viendo) — mismo criterio que la pantalla de Revisiones.
function EstadoChip({ d }: { d: ClientDeliverable }) {
  if (d.status === "ENVIADO_CLIENTE") {
    return (
      <span className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
        d.reviewVisits > 0 ? "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
      )}>
        {d.reviewVisits > 0 ? "Con el cliente" : "Pre-aprobado"}
      </span>
    );
  }
  const meta = deliverableStatusMeta(d.status);
  return <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", meta.className)}>{meta.label}</span>;
}

// Aprobar en dos toques (sin el confirm feo del navegador): el primero arma, el segundo dispara.
function BotonAprobar({ d }: { d: ClientDeliverable }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = React.useState(false);
  const [pending, start] = React.useTransition();

  // Si el usuario se lo piensa y no confirma, el botón vuelve solo a su estado normal.
  React.useEffect(() => {
    if (!confirmando) return;
    const t = setTimeout(() => setConfirmando(false), 4000);
    return () => clearTimeout(t);
  }, [confirmando]);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirmando) { setConfirmando(true); return; }
        setConfirmando(false);
        start(async () => {
          await setDeliverableStatus(d.id, d.project.id, "APROBADO");
          router.refresh();
        });
      }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60",
        confirmando
          ? "bg-emerald-600 text-white hover:bg-emerald-700"
          : "border border-emerald-500/40 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300",
      )}
      title="Marcar como aprobado por el cliente"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
      {pending ? "Aprobando…" : confirmando ? "¿Confirmar aprobado?" : "Aprobar"}
    </button>
  );
}

// Miniatura de la pieza: portada o fotograma; si la imagen falla (póster imposible), icono.
function Mini({ d }: { d: ClientDeliverable }) {
  const [rota, setRota] = React.useState(false);
  if (!d.thumbSrc || rota) {
    return (
      <span className="grid h-14 w-[5.75rem] shrink-0 place-items-center rounded-lg bg-muted/60 ring-1 ring-border">
        <Film className="size-5 text-muted-foreground" />
      </span>
    );
  }
  return (
    <span className="relative block h-14 w-[5.75rem] shrink-0 overflow-hidden rounded-lg ring-1 ring-border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={d.thumbSrc} alt="" loading="lazy" onError={() => setRota(true)} className="absolute inset-0 h-full w-full object-cover" />
      {d.versionNumber ? (
        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-px text-[9px] font-medium text-white">v{d.versionNumber}</span>
      ) : null}
    </span>
  );
}

export function ClientDeliverables({ deliverables }: { deliverables: ClientDeliverable[] }) {
  // Filtro por proyecto: solo aparece cuando hay más de uno (con uno sería decorativo).
  const [proyecto, setProyecto] = React.useState<string>("");
  const proyectos = React.useMemo(() => {
    const m = new Map<string, { id: string; name: string; emoji: string | null }>();
    for (const d of deliverables) if (!m.has(d.project.id)) m.set(d.project.id, d.project);
    return [...m.values()];
  }, [deliverables]);
  const visibles = proyecto ? deliverables.filter((d) => d.project.id === proyecto) : deliverables;

  if (deliverables.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <Package className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">Este cliente aún no tiene entregables</p>
        <p className="text-sm text-muted-foreground">Se crean dentro de cada proyecto, en la pestaña «Entregables».</p>
      </div>
    );
  }

  // Conteo por estado para la tira-resumen (solo estados presentes, del conjunto filtrado).
  const counts = new Map<string, number>();
  for (const d of visibles) counts.set(d.status, (counts.get(d.status) ?? 0) + 1);

  const groups = STATUS_ORDER
    .map((status) => ({ status, items: visibles.filter((d) => d.status === status) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {/* Resumen por estado: el total de un vistazo y dónde está cada cosa. */}
        {STATUS_ORDER.filter((s) => counts.has(s)).map((status) => {
          const meta = deliverableStatusMeta(status);
          return (
            <span key={status} className={cn("rounded-full px-3 py-1 text-xs font-medium", meta.className)}>
              {counts.get(status)} · {meta.label}
            </span>
          );
        })}
        {proyectos.length > 1 ? (
          <select
            value={proyecto}
            onChange={(e) => setProyecto(e.target.value)}
            className="ml-auto max-w-[180px] truncate rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
            title="Filtrar por proyecto"
          >
            <option value="">Todos los proyectos</option>
            {proyectos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : null}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Ese proyecto no tiene entregables.</p>
      ) : null}

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
                <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/40 sm:px-4">
                  {/* La miniatura Y el texto navegan a la sala; las acciones quedan fuera del enlace. */}
                  <Link href={`/revisiones/${d.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Mini d={d} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {d.number ? <span className="mr-1 text-xs font-normal text-muted-foreground">#{d.number}</span> : null}
                        {d.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        <EntityEmoji value={d.project.emoji} fallback="🎬" /> {d.project.name}
                        {" · "}
                        {DELIVERABLE_TYPE[d.type] ?? d.type}
                        {d.versionNumber ? ` · v${d.versionNumber}` : " · sin versión"}
                        {d.dueLabel ? (
                          <span className={d.overdue ? " font-semibold text-red-600 dark:text-red-400" : ""}>
                            {" · "}{d.overdue ? `venció ${d.dueLabel}` : `entrega ${d.dueLabel}`}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>

                  <EstadoChip d={d} />
                  <Link
                    href={`/revisiones/${d.id}`}
                    className="hidden shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
                    title="Ver el video y dejar comentarios en la sala de revisión"
                  >
                    <MessageSquare className="size-3.5" />
                    Comentar{d.comments > 0 ? <span className="tabular-nums text-muted-foreground">· {d.comments}</span> : null}
                  </Link>
                  {d.canApprove && d.status === "ENVIADO_CLIENTE" ? <BotonAprobar d={d} /> : null}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
