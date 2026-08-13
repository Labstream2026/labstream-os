"use client";

import * as React from "react";
import Link from "next/link";
import { Clapperboard, LayoutGrid, List as ListIcon, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EntityEmoji } from "@/components/icons/marks";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

// ── Pestaña «Proyectos» del cliente (rediseño aprobado por prototipo) ──
// Une las antiguas pestañas «Proyectos» (tarjetas) y «Lista» en una sola con conmutador, y
// cada proyecto dice MÁS: videos entregados/comprometidos, correcciones abiertas, última
// actividad y responsable — lo que antes obligaba a entrar proyecto por proyecto. Todo llega
// calculado del servidor (fechas formateadas, conteos hechos); aquí solo se pinta.

export type ProyectoInfo = {
  id: string;
  name: string;
  emoji: string | null;
  statusLabel: string;
  statusClass: string;
  progress: number;
  dueLabel: string | null;
  overdue: boolean;
  videosTotal: number;
  videosHechos: number;
  correcciones: number;
  // «hace 2 h» / «ayer»: el último movimiento registrado en la actividad del proyecto.
  actividadLabel: string | null;
  lead: { name: string; initials: string | null; color: string | null } | null;
};

function Metricas({ p, compacto = false }: { p: ProyectoInfo; compacto?: boolean }) {
  return (
    <span className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground", compacto && "gap-x-2")}>
      {p.videosTotal > 0 ? (
        <span className="inline-flex items-center gap-1 tabular-nums" title={`${p.videosHechos} de ${p.videosTotal} videos aprobados o entregados`}>
          <Clapperboard className="size-3.5" /> {p.videosHechos}/{p.videosTotal}
        </span>
      ) : null}
      {p.correcciones > 0 ? (
        <span className="inline-flex items-center gap-1 font-semibold text-orange-600 dark:text-orange-400" title="Entregables con correcciones pedidas">
          <Wrench className="size-3.5" /> {p.correcciones} {compacto ? "" : p.correcciones === 1 ? "corrección" : "correcciones"}
        </span>
      ) : null}
      {p.actividadLabel ? <span title="Último movimiento del proyecto">{p.actividadLabel}</span> : null}
    </span>
  );
}

function Tarjeta({ p, tintHex }: { p: ProyectoInfo; tintHex?: string }) {
  return (
    <Link
      href={`/proyectos/${p.id}`}
      style={tintHex ? { backgroundColor: `${tintHex}1f`, borderColor: `${tintHex}40` } : undefined}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border p-4 shadow-sm transition-all hover:shadow-md active:scale-[0.99] motion-reduce:active:scale-100",
        tintHex ? "hover:border-primary/40" : "border-border bg-card hover:border-border/80",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-lg">
          <EntityEmoji value={p.emoji} fallback="🎬" className="size-5.5" />
        </span>
        <Badge className={cn(p.statusClass)}>
          <span className="mr-1 inline-block size-1.5 rounded-full bg-current align-middle" />
          {p.statusLabel}
        </Badge>
      </div>

      <div>
        <h3 className="font-semibold leading-snug group-hover:text-primary">{p.name}</h3>
        {p.dueLabel ? (
          <p className={cn("mt-0.5 text-xs", p.overdue ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground")}>
            {p.overdue ? `venció ${p.dueLabel}` : `vence ${p.dueLabel}`}
          </p>
        ) : null}
      </div>

      <Metricas p={p} />

      <div className="mt-auto flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }} />
        </div>
        <span className="text-xs font-medium text-muted-foreground">{p.progress}%</span>
        {p.lead ? (
          <span title={`Responsable: ${p.lead.name}`}>
            <UserAvatar initials={p.lead.initials} color={p.lead.color} size="sm" />
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export function ClientProyectos({ proyectos, tintHex }: { proyectos: ProyectoInfo[]; tintHex?: string }) {
  const [vista, setVista] = React.useState<"tarjetas" | "lista">("tarjetas");
  React.useEffect(() => {
    // En microtask: el lint (react-hooks/set-state-in-effect) prohíbe el setState síncrono aquí.
    const t = setTimeout(() => {
      const v = window.localStorage.getItem("cliente-proyectos-vista");
      if (v === "lista" || v === "tarjetas") setVista(v);
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const cambia = (v: "tarjetas" | "lista") => {
    setVista(v);
    window.localStorage.setItem("cliente-proyectos-vista", v);
  };

  if (proyectos.length === 0) {
    return <p className="text-sm text-muted-foreground">Este cliente aún no tiene proyectos.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
          {([["tarjetas", "Tarjetas", LayoutGrid], ["lista", "Lista", ListIcon]] as const).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => cambia(v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                vista === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {vista === "tarjetas" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {proyectos.map((p) => <Tarjeta key={p.id} p={p} tintHex={tintHex} />)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Proyecto</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Videos</th>
                <th className="px-3 py-2 font-medium">Progreso</th>
                <th className="px-3 py-2 font-medium">Entrega</th>
                <th className="px-3 py-2 font-medium">Actividad</th>
                <th className="px-3 py-2 font-medium">Resp.</th>
              </tr>
            </thead>
            <tbody>
              {proyectos.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <Link href={`/proyectos/${p.id}`} className="font-medium hover:underline">
                      <EntityEmoji value={p.emoji} fallback="🎬" /> {p.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2"><Badge className={cn("text-[10px]", p.statusClass)}>{p.statusLabel}</Badge></td>
                  <td className="px-3 py-2">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {p.videosTotal ? `${p.videosHechos}/${p.videosTotal}` : "—"}
                      {p.correcciones > 0 ? <span className="ml-1.5 font-semibold text-orange-600 dark:text-orange-400">+{p.correcciones} corr.</span> : null}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }} />
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">{p.progress}%</span>
                    </span>
                  </td>
                  <td className={cn("px-3 py-2 text-xs", p.overdue ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                    {p.dueLabel ? (p.overdue ? `venció ${p.dueLabel}` : p.dueLabel) : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.actividadLabel ?? "—"}</td>
                  <td className="px-3 py-2">
                    {p.lead ? (
                      <span title={p.lead.name}>
                        <UserAvatar initials={p.lead.initials} color={p.lead.color} size="sm" />
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
