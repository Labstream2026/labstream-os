"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/ui";
import { CATEGORIAS_GASTO, categoriaGasto } from "@/lib/gastos";
import { crearGasto, borrarGasto } from "./finanzas-actions";

// ── La pestaña Gastos: las finanzas PROPIAS de la app ─────────────────────────
// Una mini-app de finanzas para Labstream: registrar, ver el mes, y saber en qué se fue
// la plata (desglose por categoría). NO lee ni toca a Siigo — son dos mundos separados
// por pedido del usuario: lo contable vive en las pestañas de Siigo, esto es nuestro.

export type GastoFila = {
  id: string;
  fecha: string; // YYYY-MM-DD
  concepto: string;
  categoria: string;
  monto: number;
  nota: string | null;
  creadoPor: string;
};

const FECHA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" });

function fechaCorta(iso: string): string {
  const t = Date.parse(`${iso}T12:00:00Z`);
  return Number.isFinite(t) ? FECHA.format(new Date(t)) : iso;
}

function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function PanelGastos({
  gastos,
  mesLabel,
  hrefMesAnterior,
  hrefMesSiguiente,
  esMesActual,
}: {
  gastos: GastoFila[];
  mesLabel: string; // «julio de 2026»
  hrefMesAnterior: string;
  hrefMesSiguiente: string | null; // null en el mes actual (el futuro no existe)
  esMesActual: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);
  const [fecha, setFecha] = React.useState(hoyISO());
  const [concepto, setConcepto] = React.useState("");
  const [categoria, setCategoria] = React.useState(CATEGORIAS_GASTO[0].key);
  const [monto, setMonto] = React.useState("");
  const [nota, setNota] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pendiente, start] = React.useTransition();
  const [porBorrar, setPorBorrar] = React.useState<string | null>(null); // dos pasos: clic y confirmar

  const totalMes = gastos.reduce((n, g) => n + g.monto, 0);

  // Desglose por categoría (la segmentación de una app de finanzas): cuánto se fue en
  // cada cosa este mes, de mayor a menor.
  const porCategoria = React.useMemo(() => {
    const mapa = new Map<string, { monto: number; n: number }>();
    for (const g of gastos) {
      const previo = mapa.get(g.categoria) ?? { monto: 0, n: 0 };
      mapa.set(g.categoria, { monto: previo.monto + g.monto, n: previo.n + 1 });
    }
    return Array.from(mapa.entries())
      .map(([key, v]) => ({ ...categoriaGasto(key), ...v }))
      .sort((a, b) => b.monto - a.monto);
  }, [gastos]);
  const maxCategoria = Math.max(1, ...porCategoria.map((c) => c.monto));

  const registrar = () => {
    setError(null);
    start(async () => {
      const r = await crearGasto({ fecha, concepto, categoria, monto: Number(monto), nota: nota || undefined });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setConcepto("");
      setMonto("");
      setNota("");
      setAbierto(false);
      router.refresh();
    });
  };

  const borrar = (id: string) => {
    start(async () => {
      await borrarGasto(id);
      setPorBorrar(null);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera del mes: navegar y registrar. */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={hrefMesAnterior} className="grid size-7 place-items-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Mes anterior">
          <ChevronLeft className="size-4" />
        </Link>
        <span className="min-w-32 text-center text-sm font-semibold capitalize">{mesLabel}</span>
        {hrefMesSiguiente ? (
          <Link href={hrefMesSiguiente} className="grid size-7 place-items-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Mes siguiente">
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className="grid size-7 place-items-center rounded-md border border-border text-muted-foreground/30" aria-hidden>
            <ChevronRight className="size-4" />
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          Total del mes <b className="font-semibold text-foreground">{formatMoney(totalMes, "COP")}</b>
          {gastos.length > 0 ? ` · ${gastos.length} registro${gastos.length === 1 ? "" : "s"}` : ""}
        </span>
        <button
          onClick={() => setAbierto((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-3.5" /> Registrar gasto
        </button>
      </div>

      {/* El formulario, plegado hasta que hace falta. */}
      {abierto ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              Fecha
              <input type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary" />
            </label>
            <label className="text-xs text-muted-foreground">
              Concepto
              <input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Transporte rodaje Pepsico" className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary" />
            </label>
            <label className="text-xs text-muted-foreground">
              Categoría
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary">
                {CATEGORIAS_GASTO.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Monto (COP)
              <input inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d]/g, ""))} placeholder="220000" className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary" />
            </label>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary" />
            <button onClick={registrar} disabled={pendiente || !concepto.trim() || !monto} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : null} Guardar
            </button>
            <button onClick={() => setAbierto(false)} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
              Cancelar
            </button>
          </div>
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </div>
      ) : null}

      {/* En qué se fue el mes: el desglose por categoría, la vista de app de finanzas. */}
      {porCategoria.length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2.5 text-sm font-semibold">
            Por categoría <span className="font-normal text-muted-foreground">— en qué se fue el mes</span>
          </p>
          <div className="flex flex-col gap-1.5">
            {porCategoria.map((c) => (
              <div key={c.key} className="flex items-center gap-2.5">
                <span className={cn("size-2.5 shrink-0 rounded-full", c.dot)} />
                <span className="w-40 truncate text-xs text-muted-foreground">{c.label}</span>
                <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className={cn("block h-full rounded-full", c.dot)} style={{ width: `${Math.max(4, Math.round((c.monto / maxCategoria) * 100))}%` }} />
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums">{formatMoney(c.monto, "COP")}</span>
                <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {totalMes > 0 ? `${Math.round((c.monto / totalMes) * 100)} %` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Los gastos del mes, uno a uno. */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <p className="border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold">
          Registro del mes <span className="font-normal text-muted-foreground">— de la app, sin tocar a Siigo</span>
        </p>
        {gastos.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {esMesActual ? "Nada registrado este mes. El botón «Registrar gasto» es tuyo." : "Sin gastos registrados ese mes."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {gastos.map((g) => {
              const cat = categoriaGasto(g.categoria);
              return (
                <li key={g.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={cn("size-2.5 shrink-0 rounded-full", cat.dot)} title={cat.label} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{g.concepto}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {cat.label} · {g.creadoPor}
                      {g.nota ? ` · ${g.nota}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fechaCorta(g.fecha)}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{formatMoney(g.monto, "COP")}</span>
                  {porBorrar === g.id ? (
                    <button onClick={() => borrar(g.id)} disabled={pendiente} className="shrink-0 rounded-md bg-destructive px-2 py-1 text-[11px] font-medium text-white hover:bg-destructive/90">
                      ¿Borrar?
                    </button>
                  ) : (
                    <button onClick={() => setPorBorrar(g.id)} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Borrar ${g.concepto}`} title="Borrar">
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Este registro es de la app y no lee ni afecta a Siigo. Las compras contables (facturas de proveedor) viven en Movimientos, con su chip FC.
      </p>
    </div>
  );
}
