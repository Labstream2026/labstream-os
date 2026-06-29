import { cn } from "@/lib/utils";

// Componentes de gráfica LIGEROS en SVG, server-renderizables (sin JS de cliente ni librería) y
// temáticos por las variables CSS de la app (heredan el color de marca configurable). Pensados
// para reemplazar las barras planas de div: dona/anillo (parte-de-un-todo), medidor (ratio),
// área (tendencia), KPIs y barras con etiqueta.

// Paleta de SERIES (categórica): color = categoría, nunca arcoíris. Funciona en claro y oscuro.
export const SERIES = ["#2a78d6", "#1d9e75", "#eda100", "#7f77dd", "#d85a30", "#e24b4a", "#0891b2", "#888780"];
export const POS = "#1d9e75"; // verde (cobrado/a tiempo)
export const WARN = "#eda100"; // ámbar (pendiente/tarde)
export const NEG = "#e24b4a"; // rojo (vencido/sobrecarga)

// ── Dona / anillo ── parte-de-un-todo con total al centro. La leyenda va aparte (<Legend>).
export function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 108,
  thickness = 16,
}: {
  segments: { label: string; value: number; color: string }[];
  centerValue?: string | number;
  centerLabel?: string;
  size?: number;
  thickness?: number;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  let off = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`Distribución: ${segments.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
      <circle cx={cx} cy={cx} r={r} fill="none" strokeWidth={thickness} style={{ stroke: "hsl(var(--muted))" }} />
      <g transform={`rotate(-90 ${cx} ${cx})`} fill="none" strokeWidth={thickness}>
        {segments.filter((s) => s.value > 0).map((s, i) => {
          const len = (s.value / total) * c;
          const node = <circle key={i} cx={cx} cy={cx} r={r} stroke={s.color} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} />;
          off += len;
          return node;
        })}
      </g>
      {centerValue != null ? (
        <text x={cx} y={centerLabel ? cx - 2 : cx} textAnchor="middle" dominantBaseline="central" fontSize={size * 0.24} fontWeight={500} style={{ fill: "hsl(var(--foreground))" }}>{centerValue}</text>
      ) : null}
      {centerLabel ? (
        <text x={cx} y={cx + size * 0.14} textAnchor="middle" fontSize={size * 0.1} style={{ fill: "hsl(var(--muted-foreground))" }}>{centerLabel}</text>
      ) : null}
    </svg>
  );
}

// ── Medidor (semicírculo) ── un ratio contra su tope (p. ej. % cobrado).
export function Gauge({ pct, label, color = POS, size = 148 }: { pct: number; label?: string; color?: string; size?: number }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const sw = 14;
  const r = (size - sw - 8) / 2;
  const cx = size / 2;
  const cy = size * 0.6 + sw / 2;
  const arc = Math.PI * r;
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <svg viewBox={`0 0 ${size} ${cy + sw}`} width={size} height={cy + sw} role="img" aria-label={`${label ?? "Progreso"}: ${p}%`}>
      <path d={d} fill="none" strokeWidth={sw} strokeLinecap="round" style={{ stroke: "hsl(var(--muted))" }} />
      <path d={d} fill="none" strokeWidth={sw} strokeLinecap="round" stroke={color} strokeDasharray={`${(p / 100) * arc} ${arc}`} />
      <text x={cx} y={cy - r * 0.34} textAnchor="middle" fontSize={size * 0.2} fontWeight={500} style={{ fill: "hsl(var(--foreground))" }}>{p}%</text>
      {label ? <text x={cx} y={cy - 2} textAnchor="middle" fontSize={size * 0.09} style={{ fill: "hsl(var(--muted-foreground))" }}>{label}</text> : null}
    </svg>
  );
}

// ── Sparkline / área ── tendencia de una serie. points = valores en orden temporal.
export function AreaTrend({ points, color = "hsl(var(--primary))", width = 132, height = 44, fluid }: { points: number[]; color?: string; width?: number; height?: number; fluid?: boolean }) {
  const dims = fluid
    ? ({ width: "100%" as const, preserveAspectRatio: "none" as const, style: { display: "block", height } })
    : ({ width, height });
  if (points.length < 2) return <svg viewBox={`0 0 ${width} ${height}`} {...dims} aria-hidden="true" />;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 4;
  const stepX = (width - pad * 2) / (points.length - 1);
  const xy = points.map((v, i) => [pad + i * stepX, height - pad - ((v - min) / span) * (height - pad * 2)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${height} L${xy[0][0].toFixed(1)},${height} Z`;
  const last = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} {...dims} role="img" aria-label={`Tendencia (${points.length} puntos)`}>
      <path d={area} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </svg>
  );
}

// ── Leyenda compacta ── cuadro de color + etiqueta (+ valor opcional).
export function Legend({ items, className, vertical }: { items: { label: string; value?: string | number; color: string }[]; className?: string; vertical?: boolean }) {
  return (
    <div className={cn("flex flex-wrap text-[11px] text-muted-foreground", vertical ? "flex-col gap-1.5" : "gap-x-3 gap-y-1", className)}>
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: it.color }} />
          <span className="truncate">{it.label}{it.value != null ? <span className="text-foreground/80"> · {it.value}</span> : null}</span>
        </span>
      ))}
    </div>
  );
}

// ── Barra horizontal con etiqueta y valor ── magnitud, con etiqueta directa.
export function BarRow({ label, value, pct, color = "hsl(var(--primary))", icon }: { label: React.ReactNode; value: React.ReactNode; pct: number; color?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex w-28 shrink-0 items-center gap-2 sm:w-44">{icon}<span className="truncate text-sm">{label}</span></span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "hsl(var(--muted))" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, pct))}%`, background: color }} />
      </div>
      <span className="w-14 shrink-0 text-right text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

// ── Tarjeta KPI ── icono en chip de color + valor grande + etiqueta (+ sub / tendencia opcional).
const TINT: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
};
export function StatTile({ icon, value, label, sub, accent = "primary", spark, sparkColor, compact }: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  sub?: string;
  accent?: keyof typeof TINT;
  spark?: number[];
  sparkColor?: string;
  compact?: boolean;
}) {
  // Variante compacta: icono a la izquierda, número y etiqueta a la derecha (sin línea «sub»
  // ni tendencia). Pensada para la fila de indicadores de Inicio.
  if (compact) {
    const danger = accent === "red";
    return (
      <div className={cn("flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm", danger ? "border-red-500/30" : "border-border")}>
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg text-lg", TINT[accent])}>{icon}</span>
        <div className="min-w-0">
          <p className={cn("text-xl font-bold leading-none tabular-nums", danger && "text-red-600 dark:text-red-400")}>{value}</p>
          <p className={cn("mt-1 truncate text-xs", danger ? "text-red-600/90 dark:text-red-400/90" : "text-muted-foreground")}>{label}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className={cn("flex size-9 items-center justify-center rounded-lg text-lg", TINT[accent])}>{icon}</span>
        {spark && spark.length > 1 ? <AreaTrend points={spark} color={sparkColor ?? "hsl(var(--primary))"} width={84} height={32} /> : null}
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-sm font-medium">{label}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
