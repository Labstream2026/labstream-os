"use client";

import * as React from "react";
import type { SerieApilada, SerieBarras } from "@/lib/reportes/datos";

// ── Gráficas SVG de Reportes v2 (cliente: llevan capa de hover) ──
// Se dibujan en PÍXELES REALES: el contenedor se mide con ResizeObserver y el SVG usa ese
// ancho tal cual. La primera versión estiraba un viewBox de 100 con preserveAspectRatio=none
// y el texto salía deformado (ancho, borroso) — un SVG estirado estira TODO, tipografía
// incluida. Marcas finas con punta redondeada, rejilla tenue, etiquetas directas y UN tooltip
// que sigue al cursor. Los colores viven en variables CSS del shell (--rs1..--rs3): el ámbar
// cambia de tono en oscuro porque el claro no pasa la banda de luminosidad (validado).

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

// Ancho real del contenedor (px). Arranca en 600 y se corrige al montar/redimensionar.
function useAncho(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = React.useRef<HTMLDivElement>(null);
  const [w, setW] = React.useState(600);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      const cw = es[0]?.contentRect.width;
      if (cw && Math.abs(cw - w) > 1) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return [ref, w];
}

// ¿Esta etiqueta del eje X se pinta? Con muchas cubetas se enseña una de cada dos —siempre
// la última— para que no se pisen.
const pintaLabel = (i: number, n: number) => n <= 9 || i % 2 === (n - 1) % 2;

// Mini-tendencia de un KPI (8 meses). Decorativa: sin ejes ni hover; aquí el estirado no
// molesta porque no hay texto dentro.
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

const H = 150; // alto de las gráficas grandes
const PAD_ABAJO = 20;
const PAD_ARRIBA = 16;

function Rejilla({ w }: { w: number }) {
  return (
    <>
      {[0.5, 1].map((g) => {
        const y = H - PAD_ABAJO - (H - PAD_ABAJO - PAD_ARRIBA) * g;
        return <line key={g} x1={0} x2={w} y1={y} y2={y} stroke="var(--rs-grid)" strokeWidth={1} />;
      })}
    </>
  );
}

// Barras verticales con etiqueta directa arriba y hover.
export function Barras({ serie, color, unidad }: { serie: SerieBarras; color: string; unidad: string }) {
  const { mover, fuera, nodo } = useTooltip();
  const [ref, w] = useAncho();
  const n = Math.max(1, serie.labels.length);
  const max = Math.max(1, ...serie.valores);
  const paso = (w - 12) / n;
  const bw = Math.min(44, paso * 0.62);
  return (
    <div ref={ref} className="relative">
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className="block" role="img" aria-label={serie.labels.map((l, i) => `${l}: ${serie.valores[i]} ${unidad}`).join(", ")}>
        <Rejilla w={w} />
        {serie.labels.map((l, i) => {
          const v = serie.valores[i];
          const cx = 6 + (i + 0.5) * paso;
          const bh = Math.max(v > 0 ? 3 : 1, (v / max) * (H - PAD_ABAJO - PAD_ARRIBA));
          const yTop = H - PAD_ABAJO - bh;
          return (
            <g key={l + i} onMouseMove={(e) => mover(e, `${v} ${unidad}`, l)} onMouseLeave={fuera}>
              <rect x={cx - bw / 2} y={yTop} width={bw} height={bh} rx={3} fill={color} />
              <rect x={cx - paso / 2} y={0} width={paso} height={H - PAD_ABAJO} fill="transparent" />
              {pintaLabel(i, n) ? (
                <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--rs-faint)">{l}</text>
              ) : null}
              {v > 0 ? (
                <text x={cx} y={Math.max(10, yTop - 4)} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--rs-dim)">{v}</text>
              ) : null}
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
  const [ref, w] = useAncho();
  const n = Math.max(2, serie.labels.length);
  const max = Math.max(1, ...serie.valores);
  const X = (i: number) => 10 + (i * (w - 20)) / (n - 1);
  const Y = (v: number) => H - PAD_ABAJO - (v / max) * (H - PAD_ABAJO - PAD_ARRIBA - 4);
  const pts = serie.valores.map((v, i) => `${X(i)},${Y(v)}`).join(" ");
  const ult = serie.valores.length - 1;
  return (
    <div ref={ref} className="relative">
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className="block" role="img" aria-label={serie.labels.map((l, i) => `${l}: ${serie.valores[i]} ${unidad}`).join(", ")}>
        <Rejilla w={w} />
        {serie.valores.length > 1 ? (
          <>
            <polygon points={`${X(0)},${H - PAD_ABAJO} ${pts} ${X(ult)},${H - PAD_ABAJO}`} fill={color} opacity={0.13} />
            <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </>
        ) : null}
        {serie.valores.map((v, i) => (
          <g key={i} onMouseMove={(e) => mover(e, `${v} ${unidad}`, serie.labels[i])} onMouseLeave={fuera}>
            <circle cx={X(i)} cy={Y(v)} r={i === ult ? 3.5 : 2.5} fill={color} stroke={i === ult ? "var(--rs-card)" : "none"} strokeWidth={i === ult ? 1.5 : 0} />
            <rect x={X(i) - Math.min(12, (w - 20) / n / 2)} y={0} width={Math.min(24, (w - 20) / n)} height={H - PAD_ABAJO} fill="transparent" />
            {pintaLabel(i, n) ? (
              <text x={X(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--rs-faint)">{serie.labels[i]}</text>
            ) : null}
          </g>
        ))}
        {serie.valores.length ? (
          <text x={Math.min(X(ult), w - 12)} y={Math.max(10, Y(serie.valores[ult]) - 8)} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--rs-tx)">{serie.valores[ult]}</text>
        ) : null}
      </svg>
      {nodo}
    </div>
  );
}

// Apiladas de dos series (a la primera / con correcciones), hueco entre segmentos y total
// como etiqueta directa. La identidad no depende solo del color: leyenda + tooltip.
export function Apiladas({ serie }: { serie: SerieApilada }) {
  const { mover, fuera, nodo } = useTooltip();
  const [ref, w] = useAncho();
  const n = Math.max(1, serie.labels.length);
  const max = Math.max(1, ...serie.labels.map((_, i) => serie.a[i] + serie.b[i]));
  const paso = (w - 12) / n;
  const bw = Math.min(36, paso * 0.6);
  const u = (H - PAD_ABAJO - PAD_ARRIBA) / max;
  return (
    <div ref={ref} className="relative">
      <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} className="block" role="img" aria-label={serie.labels.map((l, i) => `${l}: ${serie.a[i]} a la primera, ${serie.b[i]} con correcciones`).join(", ")}>
        <Rejilla w={w} />
        {serie.labels.map((l, i) => {
          const a = serie.a[i], b = serie.b[i], t = a + b;
          const cx = 6 + (i + 0.5) * paso;
          const hb = b * u, ha = a * u;
          const yb = H - PAD_ABAJO - hb;
          const ya = yb - (b > 0 && a > 0 ? 2 : 0) - ha;
          return (
            <g key={l + i} onMouseMove={(e) => mover(e, `${t} aprobadas`, `${l} · ${a} a la primera · ${b} con correcciones`)} onMouseLeave={fuera}>
              {b > 0 ? <rect x={cx - bw / 2} y={yb} width={bw} height={hb} rx={2.5} fill="var(--rs3)" /> : null}
              {a > 0 ? <rect x={cx - bw / 2} y={ya} width={bw} height={ha} rx={2.5} fill="var(--rs2)" /> : null}
              <rect x={cx - paso / 2} y={0} width={paso} height={H - PAD_ABAJO} fill="transparent" />
              {pintaLabel(i, n) ? (
                <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--rs-faint)">{l}</text>
              ) : null}
              {t > 0 ? (
                <text x={cx} y={Math.max(10, ya - 4)} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--rs-dim)">{t}</text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {nodo}
    </div>
  );
}
