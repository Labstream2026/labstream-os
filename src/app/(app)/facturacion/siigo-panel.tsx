import Link from "next/link";
import { AlertTriangle, ExternalLink, Lock, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/ui";
import { SubmitButton } from "@/components/submit-button";
import type { SiigoFactura, SiigoMovimiento, SiigoResultado } from "@/lib/siigo";
import { refrescarSiigo } from "./siigo-actions";
import { FacturasTabla, type FilaFactura } from "./facturas-tabla";

// ── Las pestañas de Siigo del centro Finanzas: Facturas y Movimientos ─────────
// Solo lectura de punta a punta. Las CIFRAS del mes viven en la pestaña Resumen; aquí
// mandan las listas: la tabla de facturas (con detalle al clic) y el hilo de movimientos.

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

export function BarraSiigo({ min, aviso }: { min: number; aviso?: string }) {
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

export function FalloSiigo({ error }: { error: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="size-4 text-amber-500" /> Siigo no contestó
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      <form action={refrescarSiigo} className="mt-3">
        <SubmitButton pendingText="Reintentando…" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
          <RefreshCw className="size-3.5" /> Reintentar
        </SubmitButton>
      </form>
    </div>
  );
}

export function PanelSiigo({
  resultado,
  vista,
  filtro,
  filtroCliente,
  minDesdeLectura,
}: {
  resultado: SiigoResultado;
  vista: "facturas" | "movs";
  filtro: "saldo" | "todas";
  // Filtro por cliente (viene de «Quién debe más» del Resumen): solo sus facturas.
  filtroCliente: string | null;
  // Minutos desde la última lectura, calculados por el conector (la regla de pureza no
  // deja mirar el reloj dentro de un componente).
  minDesdeLectura: number;
}) {
  if (!resultado.ok) return <FalloSiigo error={resultado.error} />;

  const { facturas, movimientos } = resultado.datos;
  const hoy = hoyBogota();

  return (
    <div>
      <BarraSiigo min={minDesdeLectura} aviso={resultado.aviso} />
      {vista === "facturas" ? (
        <TablaFacturas facturas={facturas} filtro={filtro} filtroCliente={filtroCliente} hoy={hoy} />
      ) : (
        <Movimientos movs={movimientos} />
      )}
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="size-3" /> Solo lectura: aquí no se crea ni se toca nada — la fuente de verdad contable es Siigo.
      </p>
    </div>
  );
}

const TOPE_TODAS = 200;

function TablaFacturas({
  facturas,
  filtro,
  filtroCliente,
  hoy,
}: {
  facturas: SiigoFactura[];
  filtro: "saldo" | "todas";
  filtroCliente: string | null;
  hoy: string;
}) {
  const base = filtroCliente ? facturas.filter((f) => f.cliente === filtroCliente) : facturas;
  const conSaldo = base.filter((f) => f.saldo > 0);
  const visibles = filtro === "saldo" ? conSaldo : base.slice(0, TOPE_TODAS);

  // Las filas viajan al cliente ya cocinadas: estado derivado y fechas formateadas.
  const filas: FilaFactura[] = visibles.map((f) => {
    const est = estadoDe(f, hoy);
    return {
      id: f.id,
      nombre: f.nombre,
      cliente: f.cliente,
      fecha: fecha(f.fecha),
      vence: f.vence ? fecha(f.vence) : "—",
      total: f.total,
      saldo: f.saldo,
      moneda: f.moneda,
      totalMoneda: f.totalMoneda,
      dian: f.dian,
      etiqueta: est.etiqueta,
      clase: est.clase,
    };
  });

  const conservaCliente = filtroCliente ? `&c=${encodeURIComponent(filtroCliente)}` : "";

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <h2 className="mr-2 text-sm font-semibold">Facturas de venta</h2>
        <Link
          href={`/facturacion?t=facturas&f=saldo${conservaCliente}`}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
            filtro === "saldo" ? "bg-primary/10 text-primary" : "border border-border text-muted-foreground hover:bg-accent",
          )}
        >
          Con saldo · {conSaldo.length}
        </Link>
        <Link
          href={`/facturacion?t=facturas&f=todas${conservaCliente}`}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
            filtro === "todas" ? "bg-primary/10 text-primary" : "border border-border text-muted-foreground hover:bg-accent",
          )}
        >
          Todas · {base.length}
        </Link>
        {filtroCliente ? (
          <Link
            href={`/facturacion?t=facturas&f=${filtro}`}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
            title="Quitar el filtro por cliente"
          >
            {filtroCliente} <X className="size-3" />
          </Link>
        ) : null}
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          {filtroCliente
            ? filtro === "saldo"
              ? `${filtroCliente} no debe nada.`
              : `Sin facturas de ${filtroCliente} en la ventana leída.`
            : filtro === "saldo"
              ? "Nada pendiente de cobro: todo lo facturado está pagado."
              : "Siigo no devolvió facturas."}
        </p>
      ) : (
        <>
          <FacturasTabla filas={filas} />
          {filtro === "todas" && base.length > TOPE_TODAS ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Se muestran las {TOPE_TODAS} más recientes de {base.length} leídas; el histórico completo vive en Siigo.
            </p>
          ) : null}
        </>
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
    return <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Sin movimientos que mostrar.</p>;
  }
  return (
    <section>
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
