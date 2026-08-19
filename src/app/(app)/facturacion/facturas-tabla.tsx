"use client";

import * as React from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/ui";
import type { SiigoFacturaDetalle } from "@/lib/siigo";

// ── La tabla de facturas, con detalle al clic ─────────────────────────────────
// Cada fila abre un panel con los ítems y los pagos de ESA factura (lectura puntual a
// Siigo vía /api/siigo/factura). Las filas llegan del servidor ya cocinadas: estado
// derivado, moneda convertida — aquí solo se pintan y se abre el detalle.

export type FilaFactura = {
  id: string;
  nombre: string;
  cliente: string;
  fecha: string; // ya formateada («27 de jul»)
  vence: string; // ya formateada o «—»
  total: number;
  saldo: number;
  moneda: string | null;
  totalMoneda: number | null;
  dian: string | null;
  etiqueta: string; // Pagada · Pago parcial · Vencida · Pendiente
  clase: string; // clases del pill de estado
};

const FECHA_LARGA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" });

function fechaLarga(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(`${iso}T12:00:00Z`);
  return Number.isFinite(t) ? FECHA_LARGA.format(new Date(t)) : iso;
}

export function FacturasTabla({ filas }: { filas: FilaFactura[] }) {
  const [abierta, setAbierta] = React.useState<FilaFactura | null>(null);
  // Lo cargado se guarda CON el id al que pertenece y el estado se DERIVA (mismo truco que
  // el selector de carpetas): sin setState de reseteo dentro del efecto, y dos clics
  // rápidos no pueden pintar los ítems de una factura bajo el encabezado de otra.
  const [cargado, setCargado] = React.useState<{ id: string; detalle: SiigoFacturaDetalle | null } | null>(null);
  const detalle = abierta && cargado && cargado.id === abierta.id ? cargado.detalle : null;
  const fallo = Boolean(abierta && cargado && cargado.id === abierta.id && cargado.detalle === null);
  const cargando = Boolean(abierta && (!cargado || cargado.id !== abierta.id));

  React.useEffect(() => {
    if (!abierta) return;
    let vivo = true;
    const id = abierta.id;
    fetch(`/api/siigo/factura?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("sin detalle"))))
      .then((d: SiigoFacturaDetalle) => {
        if (vivo) setCargado({ id, detalle: d });
      })
      .catch(() => {
        if (vivo) setCargado({ id, detalle: null }); // null cargado = Siigo no lo entregó
      });
    return () => {
      vivo = false;
    };
  }, [abierta]);

  // ── Segmentación al instante (en el navegador, sin recargar) ──
  // Buscar por cliente o número y acotar por estado: con 200 filas servidas, filtrar aquí
  // es inmediato y no le cuesta una petición ni a la app ni a Siigo.
  const [busca, setBusca] = React.useState("");
  const [estado, setEstado] = React.useState<string | null>(null);

  const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = plano(busca.trim());
  const visibles = filas.filter((f) => {
    if (estado && f.etiqueta !== estado) return false;
    if (q && !plano(`${f.cliente} ${f.nombre}`).includes(q)) return false;
    return true;
  });

  const ESTADOS = ["Pendiente", "Pago parcial", "Vencida", "Pagada"] as const;
  const conteo = (e: string) => filas.filter((f) => f.etiqueta === e).length;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente o número…"
            className="w-52 rounded-md border border-border bg-background py-1 pl-8 pr-2 text-xs outline-none focus:border-primary"
          />
        </label>
        {ESTADOS.filter((e) => conteo(e) > 0).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEstado(estado === e ? null : e)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
              estado === e ? "bg-primary/10 text-primary" : "border border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {e} · {conteo(e)}
          </button>
        ))}
        {(estado || q) && visibles.length !== filas.length ? (
          <span className="text-[11px] text-muted-foreground">
            {visibles.length} de {filas.length}
          </span>
        ) : null}
      </div>

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
            {visibles.map((f) => (
              <tr
                key={f.id}
                onClick={() => setAbierta(f)}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/20"
                title="Ver el detalle (ítems y pagos)"
              >
                <td className="px-4 py-2.5">
                  <span className="font-mono text-xs font-medium">{f.nombre}</span>
                  {f.moneda ? (
                    <span
                      className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground"
                      title={`Emitida en ${f.moneda}${f.totalMoneda != null ? ` (${f.totalMoneda.toLocaleString("es-CO")} ${f.moneda})` : ""} · el total se muestra en pesos con la tasa del documento`}
                    >
                      {f.moneda}
                    </span>
                  ) : null}
                  {f.dian && f.dian.toLowerCase() !== "accepted" ? (
                    <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" title="Estado del documento electrónico ante la DIAN, según Siigo">
                      DIAN: {f.dian}
                    </span>
                  ) : null}
                </td>
                <td className="max-w-[220px] truncate px-4 py-2.5">{f.cliente}</td>
                <td className="px-4 py-2.5">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", f.clase)}>{f.etiqueta}</span>
                </td>
                {/* tabular-nums: sin ellas los puntos de miles no caen en la misma columna y
                    hay que leer cada cifra entera para compararla con la de arriba. El resto de
                    la app ya lo hace; esta tabla, la principal del dinero, se había quedado fuera. */}
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatMoney(f.total, "COP")}</td>
                <td className={cn("px-4 py-2.5 text-right tabular-nums", f.saldo > 0 ? "font-medium" : "text-muted-foreground")}>{formatMoney(f.saldo, "COP")}</td>
                <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">{f.fecha}</td>
                <td className="hidden px-4 py-2.5 text-xs text-muted-foreground sm:table-cell">{f.vence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {abierta ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAbierta(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-semibold">
                  <span className="font-mono">{abierta.nombre}</span>
                  <span className={cn("ml-2 rounded-full px-2 py-0.5 align-middle text-[10px] font-medium", abierta.clase)}>{abierta.etiqueta}</span>
                </h2>
                <p className="truncate text-sm text-muted-foreground">{abierta.cliente}</p>
              </div>
              <button onClick={() => setAbierta(null)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Cerrar">
                <X className="size-4" />
              </button>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p><p className="font-semibold">{formatMoney(abierta.total, "COP")}</p></div>
              <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo</p><p className={cn("font-semibold", abierta.saldo > 0 && "text-amber-600 dark:text-amber-400")}>{formatMoney(abierta.saldo, "COP")}</p></div>
              <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Emitida</p><p>{abierta.fecha}</p></div>
              <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Vence</p><p>{abierta.vence}</p></div>
            </div>

            {cargando ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Leyendo el detalle en Siigo…
              </p>
            ) : fallo ? (
              <p className="py-6 text-sm text-muted-foreground">Siigo no entregó el detalle de esta factura. Inténtalo de nuevo en un momento.</p>
            ) : detalle ? (
              <>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ítems</p>
                <div className="overflow-hidden rounded-lg border border-border">
                  {detalle.items.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">Sin ítems legibles.</p>
                  ) : (
                    detalle.items.map((i, idx) => (
                      <div key={idx} className="flex items-start gap-3 border-b border-border px-3 py-2 text-sm last:border-0">
                        <span className="min-w-0 flex-1">{i.descripcion}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">× {i.cantidad.toLocaleString("es-CO")}</span>
                        <span className="shrink-0 font-medium">{formatMoney(i.total, "COP")}</span>
                      </div>
                    ))
                  )}
                </div>

                <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Forma de pago</p>
                <div className="overflow-hidden rounded-lg border border-border">
                  {detalle.pagos.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">Sin pagos anotados.</p>
                  ) : (
                    detalle.pagos.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-3 border-b border-border px-3 py-2 text-sm last:border-0">
                        <span className="min-w-0 flex-1">{p.nombre}</span>
                        {p.vence ? <span className="shrink-0 text-xs text-muted-foreground">vence {fechaLarga(p.vence)}</span> : null}
                        <span className="shrink-0 font-medium">{formatMoney(p.valor, "COP")}</span>
                      </div>
                    ))
                  )}
                </div>

                {detalle.observaciones ? (
                  <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{detalle.observaciones}</p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
