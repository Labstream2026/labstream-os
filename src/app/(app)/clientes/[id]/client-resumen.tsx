import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { EntityEmoji } from "@/components/icons/marks";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

// ── Pestaña RESUMEN del cliente (rediseño aprobado por prototipo) ──
// La entrada por defecto de la ficha. Responde «¿qué necesita de mí este cliente?» antes que
// nada: primero lo que arde (un entregable vencido, en rojo y clicable), luego los números que
// importan, y una lista corta de sus proyectos. Antes se aterrizaba en la vista de tarjetas de
// proyectos —bonita pero muda sobre urgencias—. Todo llega calculado del servidor (fechas ya
// formateadas, semáforo resuelto): aquí solo se pinta.

export type ResumenProyecto = {
  id: string;
  name: string;
  emoji: string | null;
  statusLabel: string;
  statusClass: string;
  dueLabel: string | null;
  overdue: boolean;
  progress: number;
  lead: { initials: string | null; color: string | null } | null;
};

export function ClientResumen({
  proyectos,
  activos,
  entregables,
  porFacturar,
  proxLabel,
  overdue,
  accentHex,
}: {
  proyectos: ResumenProyecto[];
  activos: number;
  entregables: number;
  // null = no se muestra la baldosa (sin permiso de finanzas).
  porFacturar: number | null;
  proxLabel: string | null;
  // El entregable más urgente vencido, si lo hay: su pieza y su fecha.
  overdue: { name: string; label: string } | null;
  accentHex?: string;
}) {
  const tiles: { k: string; v: string; small?: boolean }[] = [
    { k: "Proyectos activos", v: String(activos) },
    { k: "Entregables en revisión", v: String(entregables) },
    ...(porFacturar != null ? [{ k: "Por facturar", v: String(porFacturar) }] : []),
    { k: "Próxima entrega", v: proxLabel ?? "sin fecha", small: true },
  ];

  return (
    <div>
      {overdue ? (
        // Salta a la pestaña Proyectos con un ancla de hash (ClientViewNav lo escucha). Sin JS.
        <a
          href="#proyectos"
          className="mb-4 flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 transition-colors hover:bg-red-500/[0.16]"
        >
          <AlertTriangle className="size-[17px] shrink-0 text-red-500" />
          <span className="text-sm font-semibold text-red-600 dark:text-red-300">{overdue.name}</span>
          <span className="text-[13px] text-red-600/90 dark:text-red-300/90">venció {overdue.label}</span>
          <span className="ml-auto text-[11.5px] text-red-500">revisar →</span>
        </a>
      ) : null}

      <div className="mb-5 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
        {tiles.map((t) => (
          <div key={t.k} className="rounded-xl border border-border/70 bg-card p-3.5">
            <p className="text-[11.5px] text-muted-foreground">{t.k}</p>
            <p className={cn("mt-1 font-bold tabular-nums tracking-tight", t.small ? "text-base pt-1" : "text-2xl")}>{t.v}</p>
          </div>
        ))}
      </div>

      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="text-[13px] font-semibold">Proyectos</h3>
        {proyectos.length > 5 ? (
          <a href="#proyectos" style={accentHex ? { color: accentHex } : undefined} className="ml-auto text-[11.5px] text-primary hover:underline">
            Ver los {proyectos.length} →
          </a>
        ) : null}
      </div>

      {proyectos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Este cliente aún no tiene proyectos.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
          {proyectos.slice(0, 5).map((p) => (
            <Link
              key={p.id}
              href={`/proyectos/${p.id}`}
              className="flex items-center gap-3 border-b border-border/60 px-3.5 py-2.5 transition-colors last:border-0 hover:bg-accent/40"
            >
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", p.statusClass)}>{p.statusLabel}</span>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {p.emoji ? <><EntityEmoji value={p.emoji} /> </> : null}{p.name}
              </span>
              {p.dueLabel ? (
                <span className={cn("shrink-0 text-[11.5px] tabular-nums", p.overdue ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                  {p.overdue ? `venció ${p.dueLabel}` : p.dueLabel}
                </span>
              ) : (
                <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">{p.progress}%</span>
              )}
              {p.lead ? <UserAvatar initials={p.lead.initials} color={p.lead.color} size="sm" /> : <span className="size-5 shrink-0" />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
