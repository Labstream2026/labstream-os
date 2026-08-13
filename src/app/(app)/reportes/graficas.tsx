"use client";

import * as React from "react";
import type { SerieApilada, SerieBarras } from "@/lib/reportes/datos";

// ── Gráficas SVG de Reportes v2 (cliente: llevan capa de hover) ──
// Marcas finas con punta redondeada, rejilla tenue, etiquetas directas selectivas y UN
// tooltip compartido que sigue al cursor. Los colores viven en variables CSS locales del
// shell (--rs1..--rs3): el ámbar cambia de tono en oscuro porque el claro no pasa la banda
// de luminosidad sobre superficie oscura (validado con el verificador de paletas).

type TipState = { x: number; y: number; v: string; l: string } | null;

export function useTooltip() {
  const [tip, setTip] = React.useState<TipState>(null);
  const mover = (e: React.MouseEvent, v: string, l: string) => setTip({ x: e.clientX, y: e.clientY, v, l });
  const fuera = () => setTip(null);
  const nodo = tip ? (
    <div
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[130%] whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10.5px] font-semibold text-background"
      style={{ left: tip.x, top: tip.y }}
      role="status"
    >
      {tip.v}
      <span className="block font-normal opacity-75">{tip.l}</span>
    </div>
  ) : null;
  return { mover, fuera, nodo };
}

// Mini-tendencia de un KPI (8 meses). Decorativa: sin ejes ni hover.
export function Spark({ v, tono = "var(--rs-dim)" }: { v: number[]; tono?: string }) {
  if (!v.length || v.every((x) => x === 0)) return null;
  const w = 100, h = 16, mx = Math.max(...v), mn = Math.min(...v);
  const pts = v.map((x, i) => `${(i / (v.length - 1)) * w},${h - 2 - ((x - mn) / Math.max(1, mx - mn)) * (h - 5)}`);
  const [lx, ly] = pts[pts.length - 1].split(",");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden className="mt-1 block h-4 w-full">
      <polyline points={pts.join(" ")} fill="none" stroke={tono} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={2} fill={tono} />
    </svg>
  );
}

// Barras verticales con etiqueta directa arriba y hover.
export function Barras({ serie, color, unidad }: { serie: SerieBarras; color: string; unidad: string }) {
  const { mover, fuera, nodo } = useTooltip();
  const h = 120, pad = 18, n = Math.max(1, serie.labels.length), max = Math.max(1, ...serie.valores);
  const bw = Math.min(30, (100 - 8) / n - 4);
  return (
    <div className="relative">
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="block w-full" style={{ height: h }} role="img" aria-label={serie.labels.map((l, i) => `${l}: ${serie.valores[i]} ${unidad}`).join(", ")}>
        {[0.5, 1].map((g) => (
          <line key={g} x1={0} x2={100} y1={h - pad - (h - pad - 10) * g} y2={h - pad - (h - pad - 10) * g} stroke="var(--rs-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {serie.labels.map((l, i) => {
          const v = serie.valores[i];
          const x = (i + 0.5) * (100 / n) - bw / 2;
          const bh = Math.max(v > 0 ? 2 : 0.5, (v / max) * (h - pad - 10));
          return (
            <g key={l + i} onMouseMove={(e) => mover(e, `${v} ${unidad}`, l)} onMouseLeave={fuera}>
              <rect x={x} y={h - pad - bh} width={bw} height={bh} rx={2.5} fill={color} />
              <rect x={x - 2} y={0} width={bw + 4} height={h - pad} fill="transparent" />
              <text x={x + bw / 2} y={h - 5} textAnchor="middle" fontSize={7.5} fill="var(--rs-faint)">{l}</text>
              {v > 0 ? <text x={x + bw / 2} y={h - pad - bh - 4} textAnchor="middle" fontSize={8} fontWeight={700} fill="var(--rs-dim)">{v}</text> : null}
            </g>
          );
        })}
      </svg>
      {nodo}
    </div>
  );
}

// Área con línea de 2px, punto final enfatizado y hover por punto.
export function Area({ serie, color, unidad }: { serie: SerieBarras; color: string; unidad: string }) {
  const { mover, fuera, nodo } = useTooltip();
  const h = 120, pad = 18, n = Math.max(2, serie.labels.length), max = Math.max(1, ...serie.valores);
  const X = (i: number) => 8 + (i / (n - 1)) * 84;
  const Y = (v: number) => h - pad - (v / max) * (h - pad - 16);
  const pts = serie.valores.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
  const ult = serie.valores.length - 1;
  return (
    <div className="relative">
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="block w-full" style={{ height: h }} role="img" aria-label={serie.labels.map((l, i) => `${l}: ${serie.valores[i]} ${unidad}`).join(", ")}>
        {[0.5, 1].map((g) => (
          <line key={g} x1={0} x2={100} y1={h - pad - (h - pad - 16) * g} y2={h - pad - (h - pad - 16) * g} stroke="var(--rs-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {serie.valores.length > 1 ? (
          <>
            <polygon points={`8,${h - pad} ${pts} 92,${h - pad}`} fill={color} opacity={0.13} />
            <polyline points={pts} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </>
        ) : null}
        {serie.valores.map((v, i) => (
          <g key={i} onMouseMove={(e) => mover(e, `${v} ${unidad}`, serie.labels[i])} onMouseLeave={fuera}>
            <circle cx={X(i)} cy={Y(v)} r={i === ult ? 3 : 2} fill={color} stroke={i === ult ? "var(--rs-card)" : "none"} strokeWidth={i === ult ? 1.5 : 0} />
            <rect x={X(i) - 6} y={0} width={12} height={h - pad} fill="transparent" />
            <text x={X(i)} y={h - 5} textAnchor="middle" fontSize={7.5} fill="var(--rs-faint)">{serie.labels[i]}</text>
          </g>
        ))}
        {serie.valores.length ? (
          <text x={X(ult)} y={Y(serie.valores[ult]) - 7} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="var(--rs-tx)">{serie.valores[ult]}</text>
        ) : null}
      </svg>
      {nodo}
    </div>
  );
}

// Apiladas de dos series (a la primera / con correcciones), hueco de 1.5 entre segmentos y
// total como etiqueta directa. La identidad no depende solo del color: leyenda + tooltip.
export function Apiladas({ serie }: { serie: SerieApilada }) {
  const { mover, fuera, nodo } = useTooltip();
  const h = 132, pad = 18, n = Math.max(1, serie.labels.length);
  const max = Math.max(1, ...serie.labels.map((_, i) => serie.a[i] + serie.b[i]));
  const bw = Math.min(24, (100 - 10) / n - 4);
  const u = (h - pad - 12) / max;
  return (
    <div className="relative">
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" className="block w-full" style={{ height: h }} role="img" aria-label={serie.labels.map((l, i) => `${l}: ${serie.a[i]} a la primera, ${serie.b[i]} con correcciones`).join(", ")}>
        {[0.5, 1].map((g) => (
          <line key={g} x1={0} x2={100} y1={h - pad - (h - pad - 12) * g} y2={h - pad - (h - pad - 12) * g} stroke="var(--rs-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {serie.labels.map((l, i) => {
          const a = serie.a[i], b = serie.b[i], t = a + b;
          const x = (i + 0.5) * (100 / n) - bw / 2;
          const hb = b * u, ha = a * u;
          const yb = h - pad - hb;
          const ya = yb - (b > 0 && a > 0 ? 1.5 : 0) - ha;
          return (
            <g key={l + i} onMouseMove={(e) => mover(e, `${t} aprobadas`, `${l} · ${a} a la primera · ${b} con correcciones`)} onMouseLeave={fuera}>
              {b > 0 ? <rect x={x} y={yb} width={bw} height={hb} rx={2} fill="var(--rs3)" /> : null}
              {a > 0 ? <rect x={x} y={ya} width={bw} height={ha} rx={2} fill="var(--rs2)" /> : null}
              <rect x={x - 2} y={0} width={bw + 4} height={h - pad} fill="transparent" />
              <text x={x + bw / 2} y={h - 5} textAnchor="middle" fontSize={7.5} fill="var(--rs-faint)">{l}</text>
              {t > 0 ? <text x={x + bw / 2} y={ya - 3.5} textAnchor="middle" fontSize={8} fontWeight={700} fill="var(--rs-dim)">{t}</text> : null}
            </g>
          );
        })}
      </svg>
      {nodo}
    </div>
  );
}
