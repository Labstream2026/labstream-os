import { cn } from "@/lib/utils";
import { formatBogotaDate } from "@/lib/bogota-time";
import { clientPhases, clientPhasePill, autoNextForClient, CLIENT_DELIVERABLE_STATES } from "@/lib/client-portal";

// ── Viaje del proyecto (SOLO portal del cliente) ──
// El héroe del Resumen para el cliente: en qué fase va el proyecto (Brief → Producción →
// Revisión → Entrega) + la tarjeta «¿Qué sigue?» en lenguaje humano. El texto lo escribe el
// equipo (Project.nextForClient); si no hay, se deriva uno automático de la fase.
export function ClientJourney({
  project,
}: {
  project: {
    status: string;
    finishedAt: Date | null;
    nextForClient: string | null;
    dueDate: Date | null;
    deliverables: { status: string }[];
    lead: { name: string } | null;
  };
}) {
  const clientFacing = project.deliverables.filter((d) =>
    (CLIENT_DELIVERABLE_STATES as readonly string[]).includes(d.status),
  );
  const input = { status: project.status, finishedAt: project.finishedAt, deliverables: clientFacing };
  const phases = clientPhases(input);
  const pill = clientPhasePill(input);
  const nextText = project.nextForClient?.trim() || autoNextForClient(input);

  return (
    <div className="space-y-3">
      {/* Línea de fases con la entrega al final */}
      <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", pill.className)}>{pill.label}</span>
          <span className="text-xs text-muted-foreground">
            {project.lead ? `Responde: ${project.lead.name}` : ""}
            {project.lead && project.dueDate ? " · " : ""}
            {project.dueDate ? `Entrega: ${formatBogotaDate(project.dueDate, { day: "numeric", month: "short" })}` : ""}
          </span>
        </div>
        <div className="flex items-center">
          {phases.map((ph, i) => (
            <div key={ph.key} className={cn("flex items-center", i > 0 && "min-w-4 flex-1")}>
              {i > 0 ? (
                <div className={cn("mx-1.5 h-0.5 flex-1 rounded-full", ph.state === "todo" ? "bg-border" : "bg-emerald-300 dark:bg-emerald-500/50")} />
              ) : null}
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full border-2 text-[11px] font-bold",
                    ph.state === "done" && "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300",
                    ph.state === "now" && "border-primary/40 bg-primary text-primary-foreground shadow-[0_0_0_4px] shadow-primary/15",
                    ph.state === "todo" && "border-border bg-card text-muted-foreground/50",
                  )}
                >
                  {ph.state === "done" ? "✓" : ph.state === "now" ? "●" : i + 1}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-semibold leading-none",
                    ph.state === "now" ? "text-primary" : ph.state === "done" ? "text-muted-foreground" : "text-muted-foreground/50",
                  )}
                >
                  {ph.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* «¿Qué sigue?»: la frase humana que traduce el estado */}
      <div className="flex flex-wrap items-baseline gap-2.5 rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3">
        <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-bold text-primary">¿Qué sigue?</span>
        <p className="min-w-52 flex-1 text-sm leading-relaxed">{nextText}</p>
      </div>
    </div>
  );
}
