"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/ui";
import type { SiigoMovimiento } from "@/lib/siigo";

// ── Movimientos de Siigo, con segmentación al instante ───────────────────────
// Todo lo que se mueve en la contabilidad, entretejido: facturas (FV), pagos recibidos
// (RC), notas crédito (NC) y compras (FC — plata que sale, que ahora vive AQUÍ y no en la
// pestaña de gastos propios: son dos mundos distintos). Los chips acotan por tipo y el
// buscador por quién, sin recargar nada.

const FECHA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" });

function fecha(iso: string): string {
  const t = Date.parse(`${iso}T12:00:00Z`);
  return Number.isFinite(t) ? FECHA.format(new Date(t)) : iso;
}

const META: Record<SiigoMovimiento["tipo"], { etiqueta: string; chip: string; texto: (m: SiigoMovimiento) => string }> = {
  FV: { etiqueta: "Facturas", chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", texto: (m) => `Factura emitida a ${m.cliente}` },
  RC: { etiqueta: "Pagos", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", texto: (m) => `Pago recibido de ${m.cliente}` },
  NC: { etiqueta: "Notas crédito", chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", texto: (m) => `Nota crédito a ${m.cliente}` },
  FC: { etiqueta: "Compras", chip: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", texto: (m) => `Compra a ${m.cliente}` },
};

const TIPOS: SiigoMovimiento["tipo"][] = ["FV", "RC", "NC", "FC"];

export function MovimientosLista({ movs }: { movs: SiigoMovimiento[] }) {
  const [tipo, setTipo] = React.useState<SiigoMovimiento["tipo"] | null>(null);
  const [busca, setBusca] = React.useState("");

  const plano = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = plano(busca.trim());
  const visibles = movs.filter((m) => {
    if (tipo && m.tipo !== tipo) return false;
    if (q && !plano(`${m.cliente} ${m.nombre}`).includes(q)) return false;
    return true;
  });
  const conteo = (t: SiigoMovimiento["tipo"]) => movs.filter((m) => m.tipo === t).length;

  if (movs.length === 0) {
    return <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Sin movimientos que mostrar.</p>;
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <h2 className="mr-2 text-sm font-semibold">Movimientos</h2>
        <label className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente o proveedor…"
            className="w-52 rounded-md border border-border bg-background py-1 pl-8 pr-2 text-xs outline-none focus:border-primary"
          />
        </label>
        {TIPOS.filter((t) => conteo(t) > 0).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(tipo === t ? null : t)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
              tipo === t ? "bg-primary/10 text-primary" : "border border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {META[t].etiqueta} · {conteo(t)}
          </button>
        ))}
        {(tipo || q) && visibles.length !== movs.length ? (
          <span className="text-[11px] text-muted-foreground">{visibles.length} de {movs.length}</span>
        ) : null}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Nada coincide con ese filtro.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {visibles.map((m, i) => {
            const meta = META[m.tipo];
            return (
              <li key={`${m.tipo}-${m.nombre}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className={cn("w-9 shrink-0 rounded-full py-0.5 text-center text-[10px] font-bold", meta.chip)}>{m.tipo}</span>
                <span className="min-w-0 flex-1 truncate">
                  {meta.texto(m)} <span className="font-mono text-xs text-muted-foreground">· {m.nombre}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 font-medium tabular-nums",
                    m.tipo === "RC" && "text-emerald-600 dark:text-emerald-400",
                    (m.tipo === "NC" || m.tipo === "FC") && "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {m.tipo === "RC" ? "+" : ""}
                  {formatMoney(m.valor, "COP")}
                </span>
                <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">{fecha(m.fecha)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
