import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MonitorSmartphone } from "lucide-react";
import { getCurrentUser } from "@/lib/current-user";
import { datosCierre, type FilaEvidencia } from "@/lib/cierre/datos";
import { PageHeader } from "@/components/ui/page-header";
import { IconMiDia } from "@/components/icons";
import { CierreForm } from "./cierre-form";
import { cerrarDia } from "./actions";

export const dynamic = "force-dynamic";

// ── Cerrar el día ────────────────────────────────────────────────────────────
// El puente entre el sensor y el parte de horas: arriba lo que se midió hoy (con la
// evidencia que refresca la memoria), abajo el reparto entre las tareas del día — con
// sugerencias explicadas que la persona corrige y anota de un golpe.

export default async function CierrePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const d = await datosCierre(user.id);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <Link href="/mis-tareas" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Mis tareas
      </Link>

      <PageHeader
        icon={<IconMiDia />}
        title="Cerrar el día"
        description={`${d.fechaTxt} — convierte lo que midió el sensor en horas anotadas en tus tareas.`}
      />

      {/* Las tres cifras del día: medido, anotado y lo que falta. */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Cifra
          label="El sensor midió"
          value={d.conSensor ? d.sensorTxt : "—"}
          hint={d.conSensor ? (d.pctActivo != null ? `${d.pctActivo}% con actividad real` : undefined) : "hoy no reportó tu equipo"}
        />
        <Cifra label="Ya anotado" value={d.anotadoTxt} hint="cronómetro y registros de hoy" tone="text-emerald-600 dark:text-emerald-400" />
        <Cifra
          label="Falta por anotar"
          value={d.restanteTxt}
          hint={d.restanteMin > 0 ? "esto es lo que vas a repartir" : "día cuadrado"}
          tone={d.restanteMin > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Evidencia del día: para acordarse de en qué se fue el tiempo antes de repartir. */}
        <aside className="space-y-4">
          {d.conSensor ? (
            <>
              <Evidencia titulo="Por cuenta" filas={d.cuentas} />
              <Evidencia titulo="En el editor" filas={d.edicion} vacio="hoy no abriste Resolve/Premiere" />
              <Evidencia titulo="Apps del día" filas={d.apps} />
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              <MonitorSmartphone className="mb-2 size-5" />
              El sensor no midió nada hoy: o el equipo no está vinculado, o fue un día fuera del PC
              (rodaje, reuniones). Igual puedes anotar tus horas a mano aquí abajo.
            </div>
          )}
          <p className="px-1 text-xs text-muted-foreground">
            El sensor solo mide en tu equipo vinculado. Un día de rodaje vale aunque el sensor diga
            cero: anota lo que trabajaste de verdad.
          </p>
        </aside>

        {/* El reparto: las tareas del día con su sugerencia, editable, y el botón que anota. */}
        <CierreForm tareas={d.tareas} restanteMin={d.restanteMin} conSensor={d.conSensor} accion={cerrarDia} />
      </div>
    </div>
  );
}

function Cifra({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone ?? ""}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Evidencia({ titulo, filas, vacio }: { titulo: string; filas: FilaEvidencia[]; vacio?: string }) {
  if (filas.length === 0 && !vacio) return null;
  const max = Math.max(1, ...filas.map((f) => f.seg));
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      {filas.length === 0 ? (
        <p className="text-xs text-muted-foreground">{vacio}</p>
      ) : (
        <div className="space-y-2">
          {filas.map((f) => (
            <div key={f.label}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate">{f.label}</span>
                <span className="whitespace-nowrap font-medium tabular-nums text-muted-foreground">{f.texto}</span>
              </div>
              <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.round((f.seg / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
