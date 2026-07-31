"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Lock, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/ui";
import { CATEGORIAS_GASTO, categoriaGasto } from "@/lib/gastos";
import { crearGasto, borrarGasto } from "./finanzas-actions";

// ── La pestaña Gastos ─────────────────────────────────────────────────────────
// Dos fuentes, bien separadas: los gastos PROPIOS (se registran aquí, viven en nuestra
// base) y las COMPRAS de Siigo (solo lectura, las anota la contadora). Mes por mes.

export type GastoFila = {
  id: string;
  fecha: string; // YYYY-MM-DD
  concepto: string;
  categoria: string;
  monto: number;
  nota: string | null;
  creadoPor: string;
};

export type CompraFila = { nombre: string; fecha: string; proveedor: string; total: number };

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
  compras,
  mesLabel,
  hrefMesAnterior,
  hrefMesSiguiente,
  esMesActual,
}: {
  gastos: GastoFila[];
  compras: CompraFila[];
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

  const totalManual = gastos.reduce((n, g) => n + g.monto, 0);
  const totalCompras = compras.reduce((n, c) => n + c.total, 0);

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
          Propios <b className="font-semibold text-foreground">{formatMoney(totalManual, "COP")}</b> · Compras Siigo{" "}
          <b className="font-semibold text-foreground">{formatMoney(totalCompras, "COP")}</b>
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

      {/* Gastos propios del mes. */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <p className="border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold">
          Gastos propios <span className="font-normal text-muted-foreground">— registrados en la app</span>
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

      {/* Compras de Siigo del mes: lo contable, en solo lectura. */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <p className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold">
          Compras en Siigo <span className="font-normal text-muted-foreground">— facturas de proveedor, las anota contabilidad</span>
          <Lock className="ml-auto size-3 text-muted-foreground" />
        </p>
        {compras.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin compras contabilizadas ese mes.</p>
        ) : (
          <ul className="divide-y divide-border">
            {compras.map((c, i) => (
              <li key={`${c.nombre}-${i}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{c.nombre}</span>
                <span className="min-w-0 flex-1 truncate">{c.proveedor}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{fechaCorta(c.fecha)}</span>
                <span className="shrink-0 font-semibold tabular-nums">{formatMoney(c.total, "COP")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
