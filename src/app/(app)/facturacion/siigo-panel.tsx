import Link from "next/link";
import { AlertTriangle, ExternalLink, Lock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/ui";
import { SubmitButton } from "@/components/submit-button";
import type { SiigoFactura, SiigoMovimiento, SiigoResultado } from "@/lib/siigo";
import { refrescarSiigo } from "./siigo-actions";

// ── El panel contable: lo que Siigo dice, en SOLO lectura ─────────────────────
// Dos pestañas de la página de Facturación: las facturas de venta (con saldo y estado)
// y el hilo de movimientos (FV emitidas, RC recibos de caja, NC notas crédito). Aquí no
// hay ni un botón que escriba: la contabilidad se toca en Siigo, no en la app.

const FECHA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" });

function fecha(iso: string): string {
  const t = Date.parse(`${iso}T12:00:00Z`);
  return Number.isFinite(t) ? FECHA.format(new Date(t)) : iso;
}

function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// El estado de cobro se DERIVA de los números, no de un campo: saldo 0 = pagada; con
// saldo y plazo vencido = vencida; saldo menor que el total = ya abonaron algo.
function estadoDe(f: SiigoFactura, hoy: string): { etiqueta: string; clase: string } {
  if (f.saldo <= 0) return { etiqueta: "Pagada", clase: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" };
  if (f.vence !== null && f.vence < hoy) return { etiqueta: "Vencida", clase: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" };
  if (f.saldo < f.total) return { etiqueta: "Pago parcial", clase: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" };
  return { etiqueta: "Pendiente", clase: "bg-muted text-muted-foreground" };
}

function Cifra({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-bold", tone)}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function BarraSiigo({ min, aviso }: { min: number; aviso?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        Siigo · solo lectura
      </span>
      <span>{min === 0 ? "actualizado hace un momento" : `actualizado hace ${min} min`}</span>
      {aviso ? (
        <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3.5" /> {aviso} — se muestra lo último que sí se leyó.
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-2">
        <a
          href="https://siigonube.siigo.com"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium hover:bg-accent"
        >
          <ExternalLink className="size-3.5" /> Abrir Siigo
        </a>
        <form action={refrescarSiigo}>
          <SubmitButton pendingText="Leyendo…" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-medium hover:bg-accent">
            <RefreshCw className="size-3.5" /> Actualizar
          </SubmitButton>
        </form>
      </span>
    </div>
  );
}

export function PanelSiigo({
  resultado,
  vista,
  filtro,
  // Minutos desde la última lectura de Siigo, calculados por la PÁGINA (la regla de pureza
  // no deja mirar el reloj dentro de un componente; la página, como punto de entrada, sí).
  minDesdeLectura,
}: {
  resultado: SiigoResultado;
  vista: "facturas" | "movs";
  filtro: "saldo" | "todas";
  minDesdeLectura: number;
}) {
  if (!resultado.ok) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="size-4 text-amber-500" /> Siigo no contestó
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{resultado.error}</p>
        <form action={refrescarSiigo} className="mt-3">
          <SubmitButton pendingText="Reintentando…" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
            <RefreshCw className="size-3.5" /> Reintentar
          </SubmitButton>
        </form>
      </div>
    );
  }

  const { resumen, facturas, movimientos } = resultado.datos;
  const hoy = hoyBogota();

  return (
    <div>
      <BarraSiigo min={minDesdeLectura} aviso={resultado.aviso} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Cifra
          label="Pendiente de cobro"
          value={formatMoney(resumen.pendiente, "COP")}
          hint={`${resumen.nPendientes} factura${resumen.nPendientes === 1 ? "" : "s"} con saldo`}
          tone="text-amber-600 dark:text-amber-400"
        />
        <Cifra
          label="Vencido"
          value={formatMoney(resumen.vencido, "COP")}
          hint={
            resumen.nVencidas > 0
              ? `${resumen.nVencidas} factura${resumen.nVencidas === 1 ? "" : "s"}${resumen.masViejaDias != null ? ` · la más vieja ${resumen.masViejaDias} d` : ""}`
              : "nada vencido"
          }
          tone={resumen.vencido > 0 ? "text-destructive" : undefined}
        />
        <Cifra label="Facturado este mes" value={formatMoney(resumen.facturadoMes, "COP")} hint={`${resumen.nFacturadoMes} emitida${resumen.nFacturadoMes === 1 ? "" : "s"}`} />
        <Cifra
          label="Recaudado este mes"
          value={formatMoney(resumen.recaudadoMes, "COP")}
          hint={`${resumen.nRecibosMes} recibo${resumen.nRecibosMes === 1 ? "" : "s"} de caja`}
          tone="text-emerald-600 dark:text-emerald-400"
        />
      </div>

      {vista === "facturas" ? <TablaFacturas facturas={facturas} filtro={filtro} hoy={hoy} /> : <Movimientos movs={movimientos} />}

      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="size-3" /> Solo lectura: aquí no se crea ni se toca nada — la fuente de verdad contable es Siigo.
      </p>
    </div>
  );
}

const TOPE_TODAS = 200;

function TablaFacturas({ facturas, filtro, hoy }: { facturas: SiigoFactura[]; filtro: "saldo" | "todas"; hoy: string }) {
  const conSaldo = facturas.filter((f) => f.saldo > 0);
  const visibles = filtro === "saldo" ? conSaldo : facturas.slice(0, TOPE_TODAS);
  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <h2 className="mr-2 text-sm font-semibold">Facturas de venta</h2>
        <Link
          href="/facturacion?t=siigo&f=saldo"
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
            filtro === "saldo" ? "bg-primary/10 text-primary" : "border border-border text-muted-foreground hover:bg-accent",
          )}
        >
          Con saldo · {conSaldo.length}
        </Link>
        <Link
          href="/facturacion?t=siigo&f=todas"
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
            filtro === "todas" ? "bg-primary/10 text-primary" : "border border-border text-muted-foreground hover:bg-accent",
          )}
        >
          Todas · {facturas.length}
        </Link>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {filtro === "saldo" ? "Nada pendiente de cobro: todo lo facturado está pagado." : "Siigo no devolvió facturas."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Factura</th>
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Emitida</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Vence</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const est = estadoDe(f, hoy);
                return (
                  <tr key={f.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-xs font-medium">{f.nombre}</span>
                      {/* El timbre electrónico solo habla cuando algo NO está aceptado. */}
                      {f.dian && f.dian.toLowerCase() !== "accepted" ? (
                        <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" title="Estado del documento electrónico ante la DIAN, según Siigo">
                          DIAN: {f.dian}
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2.5">{f.cliente}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", est.clase)}>{est.etiqueta}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">{formatMoney(f.total, "COP")}</td>
                    <td className={cn("px-4 py-2.5 text-right", f.saldo > 0 ? "font-medium" : "text-muted-foreground")}>{formatMoney(f.saldo, "COP")}</td>
                    <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">{fecha(f.fecha)}</td>
                    <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">{f.vence ? fecha(f.vence) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtro === "todas" && facturas.length > TOPE_TODAS ? (
            <p className="border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
              Se muestran las {TOPE_TODAS} más recientes de {facturas.length} leídas; el histórico completo vive en Siigo.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

const MOV_META: Record<SiigoMovimiento["tipo"], { chip: string; texto: (m: SiigoMovimiento) => string }> = {
  FV: { chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", texto: (m) => `Factura emitida a ${m.cliente}` },
  RC: { chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", texto: (m) => `Pago recibido de ${m.cliente}` },
  NC: { chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", texto: (m) => `Nota crédito a ${m.cliente}` },
};

function Movimientos({ movs }: { movs: SiigoMovimiento[] }) {
  if (movs.length === 0) {
    return <p className="mt-6 rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Sin movimientos que mostrar.</p>;
  }
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold">
        Movimientos recientes <span className="font-normal text-muted-foreground">— facturas, pagos y notas crédito, en orden</span>
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {movs.map((m, i) => {
          const meta = MOV_META[m.tipo];
          return (
            <li key={`${m.tipo}-${m.nombre}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <span className={cn("w-9 shrink-0 rounded-full py-0.5 text-center text-[10px] font-bold", meta.chip)}>{m.tipo}</span>
              <span className="min-w-0 flex-1 truncate">
                {meta.texto(m)} <span className="font-mono text-xs text-muted-foreground">· {m.nombre}</span>
              </span>
              <span className={cn("shrink-0 font-medium tabular-nums", m.tipo === "RC" && "text-emerald-600 dark:text-emerald-400", m.tipo === "NC" && "text-amber-600 dark:text-amber-400")}>
                {m.tipo === "RC" ? "+" : ""}
                {formatMoney(m.valor, "COP")}
              </span>
              <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">{fecha(m.fecha)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
