import { MapPin, Server, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISK_FULL_PCT } from "@/lib/material-health";

// ── La cabecera de un disco montado, fuera de la Biblioteca ───────────────────
// La misma tarjeta que abre la ficha del disco (nombre, chips, verificación y la barra de
// ocupación EN VIVO), para que la pestaña Discos y la ficha hablen el mismo idioma. Vive
// aparte porque aquí no hay QR ni «Raíz»: eso es de la ficha; esto es el sitio de trabajo.
//
// El dato de ocupación llega leído del statfs del montaje —no de lo anotado a mano— y por
// eso el «71 %» de Operaciones avisa solo, sin que nadie actualice nada.

function tb(gb: number | null): string {
  if (gb == null) return "—";
  return `${(gb / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} TB`;
}

export function CabeceraDisco({
  nombre,
  color,
  kindLabel,
  montado,
  ubicacion,
  lastCheckDays,
  pideCheck = false,
  usedGB,
  totalGB,
  enVivo,
}: {
  nombre: string;
  color: string | null;
  kindLabel: string;
  montado: boolean;
  ubicacion: string | null;
  lastCheckDays: number | null;
  pideCheck?: boolean;
  usedGB: number | null;
  totalGB: number | null;
  enVivo: boolean;
}) {
  const pct = totalGB && usedGB != null ? Math.min(100, Math.round((usedGB / totalGB) * 100)) : null;
  return (
    <div className="mb-4 rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start gap-4 p-4">
        <span className="h-11 w-3 shrink-0 rounded" style={{ background: color ?? "#94a3b8" }} />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {nombre}
            <span className="rounded border border-border bg-background px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
              {kindLabel}
            </span>
            {montado ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                <Server className="size-3" /> montado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                <Unplug className="size-3" /> no responde
              </span>
            )}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {ubicacion ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" /> {ubicacion}
              </span>
            ) : null}
            <span className={cn(pideCheck && "font-semibold text-amber-600 dark:text-amber-400")}>
              {lastCheckDays == null
                ? "Nunca verificado"
                : lastCheckDays === 0
                  ? "Verificado hoy"
                  : `Verificado hace ${lastCheckDays < 60 ? `${lastCheckDays} días` : `${Math.floor(lastCheckDays / 30)} meses`}`}
            </span>
          </p>
        </div>

        <div className="min-w-44">
          {pct != null ? (
            <>
              <div className="mb-1 flex justify-between gap-3 text-xs">
                <span className="text-muted-foreground">
                  <b className="font-semibold text-foreground">{tb(usedGB)}</b> / {tb(totalGB)}
                </span>
                <span className={pct >= DISK_FULL_PCT ? "font-semibold text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>{pct} %</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-accent">
                <div
                  className={cn("h-full rounded-full", pct >= 95 ? "bg-red-500" : pct >= DISK_FULL_PCT ? "bg-amber-500" : "bg-primary")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {enVivo ? <p className="mt-1 text-[10px] text-muted-foreground">leído del disco en vivo</p> : null}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">{totalGB ? `${tb(totalGB)} · sin uso anotado` : "capacidad sin anotar"}</p>
          )}
        </div>
      </div>
    </div>
  );
}
