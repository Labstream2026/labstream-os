import { cn } from "@/lib/utils";

// ── Salud del proyecto (Resumen) ──
// R1 · Semáforo CALCULADO (nunca manual): verde/ámbar/rojo derivado de señales reales, y
// siempre con el porqué en una línea. R2 · Línea de vida: inicio → hoy → entrega con los
// entregables como puntos. Componente de SERVIDOR: recibe datos que la página ya carga.

type TaskLite = { dueDate: Date | null; completedAt: Date | null; assigneeName: string | null };
type DelivLite = { name: string; status: string; dueDate: Date | null; updatedAt: Date };

const DAY = 86_400_000;
const CLIENT_STATES = new Set(["ENVIADO_CLIENTE", "CORRECCIONES", "APROBADO", "ENTREGADO"]);
const DONE_STATES = new Set(["APROBADO", "ENTREGADO"]);

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

export function ProjectHealth({
  tasks,
  deliverables,
  startDate,
  dueDate,
  lastActivityAt,
  progress,
  clientView = false,
}: {
  tasks: TaskLite[];
  deliverables: DelivLite[];
  startDate: Date | null;
  dueDate: Date | null;
  lastActivityAt: Date | null;
  progress: number;
  // Portal del cliente: solo la línea de vida (las señales internas —atrasos, quién debe qué—
  // son cocina del equipo, no comunicación al cliente).
  clientView?: boolean;
}) {
  const now = new Date();

  // ── Señales ──
  const open = tasks.filter((t) => !t.completedAt);
  const late = open.filter((t) => t.dueDate && t.dueDate.getTime() < now.getTime() - DAY / 2);
  const lateByWho = new Map<string, number>();
  for (const t of late) {
    const k = t.assigneeName ?? "sin responsable";
    lateByWho.set(k, (lateByWho.get(k) ?? 0) + 1);
  }
  const lateDetail = [...lateByWho.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([who, n]) => `${who} ${n}`)
    .join(", ");

  const stuckFixes = deliverables.filter((d) => d.status === "CORRECCIONES" && daysBetween(d.updatedAt, now) >= 3);
  const daysLeft = dueDate ? daysBetween(now, dueDate) : null;
  const quietDays = lastActivityAt ? daysBetween(lastActivityAt, now) : null;

  const señales: string[] = [];
  let nivel: "ok" | "atencion" | "riesgo" = "ok";
  const sube = (a: "atencion" | "riesgo") => {
    if (a === "riesgo" || nivel === "riesgo") nivel = "riesgo";
    else nivel = "atencion";
  };

  if (late.length > 0) {
    señales.push(`${late.length} tarea${late.length === 1 ? "" : "s"} atrasada${late.length === 1 ? "" : "s"}${lateDetail ? ` (${lateDetail})` : ""}`);
    sube(late.length >= 5 ? "riesgo" : "atencion");
  }
  for (const d of stuckFixes.slice(0, 2)) {
    señales.push(`«${d.name}» lleva ${daysBetween(d.updatedAt, now)} días en correcciones`);
    sube("atencion");
  }
  if (daysLeft !== null && daysLeft < 0) {
    señales.push(`la entrega venció hace ${-daysLeft} día${daysLeft === -1 ? "" : "s"}`);
    sube("riesgo");
  } else if (daysLeft !== null && daysLeft <= 7 && progress < 70) {
    señales.push(`quedan ${daysLeft} días y el avance va en ${progress}%`);
    sube("atencion");
  }
  if (quietDays !== null && quietDays >= 5) {
    señales.push(`sin actividad hace ${quietDays} días`);
    sube("atencion");
  }

  const META = {
    ok: { label: "En buen ritmo", dot: "bg-emerald-500", ring: "ring-emerald-500/25", border: "border-l-emerald-500" },
    atencion: { label: "Atención", dot: "bg-amber-500", ring: "ring-amber-500/25", border: "border-l-amber-500" },
    riesgo: { label: "En riesgo", dot: "bg-red-500", ring: "ring-red-500/25", border: "border-l-red-500" },
  }[nivel];

  // ── KPIs ──
  const doneTasks = tasks.length - open.length;
  const delivDone = deliverables.filter((d) => DONE_STATES.has(d.status)).length;
  const activityLabel =
    quietDays === null ? "—" : quietDays <= 0 ? "hoy" : quietDays === 1 ? "ayer" : `hace ${quietDays} días`;

  // ── Línea de vida ── posición 0-100% entre inicio y entrega (con márgenes de respiro).
  // Sin fechas del proyecto no hay línea que dibujar (se omite en silencio).
  const start = startDate ?? (deliverables.length || tasks.length ? null : null);
  const lifeline = start && dueDate && dueDate.getTime() > start.getTime();
  const pos = (d: Date) => {
    const p = ((d.getTime() - start!.getTime()) / (dueDate!.getTime() - start!.getTime())) * 100;
    return Math.min(98, Math.max(2, p));
  };
  const dotColor = (s: string) =>
    DONE_STATES.has(s) ? "bg-emerald-500" : CLIENT_STATES.has(s) ? "bg-[#F47A20]" : "bg-primary/70";

  return (
    <div className="space-y-3">
      {/* Semáforo (solo equipo) */}
      {!clientView ? (
        <div className={cn("flex items-start gap-3 rounded-xl border border-border border-l-4 bg-card px-4 py-3 shadow-sm", META.border)}>
          <span className={cn("mt-1 size-3.5 shrink-0 rounded-full ring-4", META.dot, META.ring)} />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {META.label}
              {señales.length ? <span className="font-normal text-muted-foreground"> · {señales.length} señal{señales.length === 1 ? "" : "es"}</span> : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {señales.length ? señales.join(" · ") : "Sin tareas atrasadas, correcciones estancadas ni silencios largos."}
            </p>
          </div>
          <div className="ml-auto hidden shrink-0 items-center gap-4 sm:flex">
            <span className="text-right text-xs text-muted-foreground"><b className="block text-sm text-foreground">{tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0}%</b>tareas</span>
            <span className="text-right text-xs text-muted-foreground"><b className="block text-sm text-foreground">{daysLeft === null ? "—" : daysLeft < 0 ? `${-daysLeft}d tarde` : `${daysLeft}d`}</b>entrega</span>
            <span className="text-right text-xs text-muted-foreground"><b className="block text-sm text-foreground">{delivDone}/{deliverables.length}</b>aprobados</span>
            <span className="text-right text-xs text-muted-foreground"><b className="block text-sm text-foreground">{activityLabel}</b>actividad</span>
          </div>
        </div>
      ) : null}

      {/* Línea de vida (equipo y cliente) */}
      {lifeline ? (
        <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="relative h-9">
            {/* pista + tiempo transcurrido */}
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary/25"
              style={{ left: 0, width: `${pos(now)}%` }}
            />
            {/* HOY */}
            {now.getTime() >= start!.getTime() && now.getTime() <= dueDate!.getTime() ? (
              <div className="absolute top-0 bottom-0 w-0.5 bg-[#F47A20]" style={{ left: `${pos(now)}%` }} title="Hoy">
                <span className="absolute -top-0.5 left-1 text-[9px] font-bold text-[#F47A20]">HOY</span>
              </div>
            ) : null}
            {/* entregables como puntos */}
            {deliverables
              .filter((d) => d.dueDate)
              .map((d, i) => (
                <span
                  key={i}
                  title={`${d.name} · ${DONE_STATES.has(d.status) ? "aprobado" : CLIENT_STATES.has(d.status) ? "donde el cliente" : "en producción"}`}
                  className={cn("absolute top-1/2 size-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full ring-2 ring-card", dotColor(d.status))}
                  style={{ left: `${pos(d.dueDate!)}%` }}
                />
              ))}
          </div>
          <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
            <span>{start!.toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span>
            <span className="hidden gap-3 sm:flex">
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-primary/70" /> en producción</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#F47A20]" /> donde el cliente</span>
              <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" /> aprobado</span>
            </span>
            <span>{clientView ? "entrega" : "entrega"} · {dueDate!.toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
