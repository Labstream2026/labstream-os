import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/ui";
import type { SiigoDatos } from "@/lib/siigo";
import { MetaEditor } from "./meta-editor";

// ── El Resumen CONTABLE (Siigo, solo lectura) ─────────────────────────────────
// La pantalla para «tener la facturación al día» de un vistazo: cifras del mes, la meta,
// la cartera por EDADES (el gráfico que manda), el ritmo facturado vs recaudado y quién
// debe más. Los gráficos son divs y nada más: planos, del idioma de la app, sin librerías.
// AQUÍ SOLO HAY SIIGO: los gastos propios de la app son otro mundo (pestaña Gastos) y no
// se mezclan con lo contable — pedido expreso del usuario.

const MES_CORTO = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", month: "short" });

function mesCorto(yyyymm: string): string {
  const t = Date.parse(`${yyyymm}-15T12:00:00Z`);
  return Number.isFinite(t) ? MES_CORTO.format(new Date(t)).replace(".", "") : yyyymm;
}

// Compacta un monto para leyendas apretadas: $12,4 M · $980 mil · $500.
function compacto(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  if (abs >= 10_000) return `$${Math.round(v / 1000).toLocaleString("es-CO")} mil`;
  return formatMoney(v, "COP");
}

const TRAMOS: { key: keyof SiigoDatos["edades"]; label: string; barra: string }[] = [
  { key: "alDia", label: "Al día", barra: "bg-emerald-400" },
  { key: "d1a30", label: "1–30 d", barra: "bg-amber-300" },
  { key: "d31a60", label: "31–60 d", barra: "bg-amber-500" },
  { key: "d61a90", label: "61–90 d", barra: "bg-orange-500" },
  { key: "mas90", label: "+90 d", barra: "bg-red-500" },
];

function Cifra({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-bold", tone)}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function PanelResumen({ datos, meta }: { datos: SiigoDatos; meta: number | null }) {
  const { resumen, edades, serieMeses, topSaldos } = datos;
  const totalEdades = TRAMOS.reduce((n, t) => n + edades[t.key], 0);
  const maxMes = Math.max(1, ...serieMeses.flatMap((m) => [m.facturado, m.recaudado]));
  const maxSaldo = Math.max(1, ...topSaldos.map((t) => t.saldo));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Cifra
          label="Pendiente de cobro"
          value={formatMoney(resumen.pendiente, "COP")}
          hint={`${resumen.nPendientes} factura${resumen.nPendientes === 1 ? "" : "s"}${resumen.nPorVencer7 > 0 ? ` · ${resumen.nPorVencer7} vence${resumen.nPorVencer7 === 1 ? "" : "n"} esta semana` : ""}`}
          tone="text-amber-600 dark:text-amber-400"
        />
        <Cifra
          label="Vencido"
          value={formatMoney(resumen.vencido, "COP")}
          hint={resumen.nVencidas > 0 ? `${resumen.nVencidas} factura${resumen.nVencidas === 1 ? "" : "s"}${resumen.masViejaDias != null ? ` · la más vieja ${resumen.masViejaDias} d` : ""}` : "nada vencido"}
          tone={resumen.vencido > 0 ? "text-destructive" : undefined}
        />
        <Cifra label="Recaudado este mes" value={formatMoney(resumen.recaudadoMes, "COP")} hint={`${resumen.nRecibosMes} recibo${resumen.nRecibosMes === 1 ? "" : "s"} de caja`} tone="text-emerald-600 dark:text-emerald-400" />
        <Cifra
          label="Facturado este mes"
          value={formatMoney(resumen.facturadoMes, "COP")}
          hint={`${resumen.nFacturadoMes} emitida${resumen.nFacturadoMes === 1 ? "" : "s"}${resumen.nComprasMes > 0 ? ` · compras ${compacto(resumen.comprasMes)}` : ""}`}
        />
      </div>

      <MetaEditor meta={meta} facturadoMes={resumen.facturadoMes} />

      {/* Cartera por edades: cuánto hay en cada tramo de vejez. El gráfico que manda. */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-2.5 text-sm font-semibold">
          Cartera por edades <span className="font-normal text-muted-foreground">— dónde está la plata pendiente</span>
        </p>
        {totalEdades <= 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Sin cartera pendiente: todo cobrado.</p>
        ) : (
          <>
            <div className="flex h-5 overflow-hidden rounded-md">
              {TRAMOS.filter((t) => edades[t.key] > 0).map((t) => (
                <div
                  key={t.key}
                  className={t.barra}
                  style={{ width: `${Math.max(2, (edades[t.key] / totalEdades) * 100)}%` }}
                  title={`${t.label}: ${formatMoney(edades[t.key], "COP")}`}
                />
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
              {TRAMOS.map((t) => (
                <span key={t.key} className={cn("inline-flex items-center gap-1.5 text-[11px]", edades[t.key] > 0 ? "text-muted-foreground" : "text-muted-foreground/50")}>
                  <span className={cn("size-2 rounded-[3px]", t.barra)} />
                  {t.label} <b className="font-semibold text-foreground">{compacto(edades[t.key])}</b>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Facturado vs recaudado, últimos 6 meses. */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-sm font-semibold">
            Facturado vs recaudado <span className="font-normal text-muted-foreground">— últimos 6 meses</span>
          </p>
          <div className="flex items-end gap-3" style={{ height: 110 }}>
            {serieMeses.map((m) => (
              <div key={m.mes} className="flex min-w-0 flex-1 flex-col justify-end">
                <div className="flex items-end justify-center gap-[3px]" style={{ height: 92 }}>
                  <div
                    className="w-1/2 max-w-4 rounded-t-[3px] bg-sky-400/90"
                    style={{ height: m.facturado > 0 ? Math.max(3, Math.round((m.facturado / maxMes) * 92)) : 2 }}
                    title={`Facturado ${mesCorto(m.mes)}: ${formatMoney(m.facturado, "COP")}`}
                  />
                  <div
                    className="w-1/2 max-w-4 rounded-t-[3px] bg-emerald-400/90"
                    style={{ height: m.recaudado > 0 ? Math.max(3, Math.round((m.recaudado / maxMes) * 92)) : 2 }}
                    title={`Recaudado ${mesCorto(m.mes)}: ${formatMoney(m.recaudado, "COP")}`}
                  />
                </div>
                <p className="mt-1.5 truncate text-center text-[10px] text-muted-foreground">{mesCorto(m.mes)}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[3px] bg-sky-400/90" /> Facturado</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[3px] bg-emerald-400/90" /> Recaudado</span>
          </div>
        </div>

        {/* Quién debe más: clic → la tabla filtrada por ese cliente. */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-sm font-semibold">
            Quién debe más <span className="font-normal text-muted-foreground">— saldo por cliente</span>
          </p>
          {topSaldos.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nadie debe nada.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {topSaldos.map((t) => (
                <Link
                  key={t.cliente}
                  href={`/facturacion?t=facturas&c=${encodeURIComponent(t.cliente)}`}
                  className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent"
                  title={`${t.n} factura${t.n === 1 ? "" : "s"} con saldo — ver sus facturas`}
                >
                  <span className="w-32 truncate text-xs text-muted-foreground group-hover:text-foreground">{t.cliente}</span>
                  <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn("block h-full rounded-full", t.saldo >= maxSaldo * 0.66 ? "bg-red-400" : t.saldo >= maxSaldo * 0.33 ? "bg-amber-400" : "bg-amber-300")}
                      style={{ width: `${Math.max(4, Math.round((t.saldo / maxSaldo) * 100))}%` }}
                    />
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums">{compacto(t.saldo)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
