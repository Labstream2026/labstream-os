import { db } from "@/lib/db";
import { hasPermission } from "@/lib/auth";
import type { SessionUser } from "@/lib/session";
import { getTaskLabels } from "@/lib/workflow-labels";
import { personCompliance } from "@/lib/compliance";
import { quoteTotals } from "@/lib/ui";
import { effectiveInvoiceStatus } from "@/lib/billing";
import { emojiToText } from "@/components/icons/marks";

// ── Los DATOS de Reportes v2, armados enteros en el servidor ──
// La página elige un PERIODO (mes navegable, 90 días, año, todo) y aquí se calcula todo lo
// que pintan los cinco casos: KPIs con delta contra el periodo anterior, las series de las
// gráficas, cumplimiento, esfuerzo, el pulso de entregas por proyecto, el ranking de cuentas
// y el pulso de finanzas. El shell (cliente) SOLO pinta: nada de esto se recalcula en el
// navegador y todo llega ya formateado (dinero, horas, fechas), serializable.
//
// «Videos aprobados» sale de las DECISIONES reales (DeliverableDecision, etapa CLIENTE) y,
// como red, de la bitácora cuando alguien movió el estado a mano (setDeliverableStatus no
// escribe decisión pero sí actividad). Cuenta la PRIMERA aprobación de cada pieza.

const DIA = 86_400_000;
const INACTIVOS = ["CERRADO", "CANCELADO"];
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export type PeriodoKey = "mes" | "90" | "ano" | "todo";
export type Periodo = {
  key: PeriodoKey;
  // "YYYY-MM" cuando key = mes (para las flechas ◂ ▸ del shell).
  mes: string | null;
  mesAnterior: string | null;
  mesSiguiente: string | null; // null cuando ya es el mes en curso
  etiqueta: string; // «Ago 2026» · «90 días» · «2026» · «Todo»
  subtitulo: string; // «Agosto 2026 · comparado con julio»
};

export type Kpi = {
  l: string; // etiqueta
  v: string; // valor ya formateado
  d?: string; // texto del delta («+4», «-12%», «64%»)
  dir?: 1 | -1 | 0 | 2; // 1 sube · -1 baja · 0 sin delta · 2 chip neutro (info)
  inv?: boolean; // true = subir es MALO (correcciones)
  sp?: number[]; // mini-tendencia (8 meses)
};

export type SerieBarras = { labels: string[]; valores: number[] };
export type SerieApilada = { labels: string[]; a: number[]; b: number[] }; // a la primera / con correcciones
export type FilaBarra = { label: string; valor: number; sufijo?: string };
export type FilaCumplimiento = { id: string; ini: string | null; nombre: string; color: string | null; ok: number; tarde: number; venc: number; pct: number | null };

export type PersonaReporte = {
  id: string;
  ini: string | null;
  nombre: string;
  color: string | null;
  horas: number;
  tareasCerradas: number;
  pctATiempo: number | null;
  piezas: number; // entregables con versión subida por esta persona en el periodo
  carga: number; // tareas abiertas hoy
  porProyecto: FilaBarra[]; // sus horas por proyecto (top 4)
};

export type FilaEntrega = {
  label: string;
  piezas: number;
  aprobadas: number;
  enCurso: number;
  correcciones: number;
  versionesTxt: string;
  diasTxt: string;
  tono: "ok" | "warn";
};

export type FilaCliente = {
  id: string;
  emoji: string;
  nombre: string;
  hechos: number;
  total: number;
  correcciones: number;
  horas: number;
  dineroTxt: string | null; // «$6,2 M / $9,8 M» (null sin permiso de finanzas)
  pctCobrado: number | null;
  salud: "ok" | "warn" | "bad";
  motivo: string;
};

export type ReporteDatos = {
  periodo: Periodo;
  canFin: boolean;
  canCumpl: boolean;
  kpis: Kpi[];
  serieAprobados: SerieBarras;
  serieHoras: SerieBarras;
  esfuerzo: FilaBarra[];
  cumplimiento: FilaCumplimiento[];
  // Entregas
  kpisEntregas: Kpi[];
  apiladas: SerieApilada;
  corrPorProyecto: FilaBarra[];
  piezaTop: string | null; // la pieza con más versiones del periodo
  tablaEntregas: FilaEntrega[];
  // Equipo
  personas: PersonaReporte[];
  // Clientes
  clientes: FilaCliente[];
  // Finanzas
  kpisFinanzas: Kpi[];
};

// ── periodo ─────────────────────────────────────────────────────────────────

const mesLargo = (d: Date) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", month: "long" }).format(d);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const mesISO = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export function parsePeriodo(sp: { p?: string; m?: string }, ahora = new Date()): Periodo & {
  desde: Date | null;
  hasta: Date;
  prevDesde: Date | null;
  prevHasta: Date | null;
} {
  const key: PeriodoKey = sp.p === "90" || sp.p === "ano" || sp.p === "todo" ? sp.p : "mes";
  const hoyMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));

  if (key === "mes") {
    // m=YYYY-MM (acotado: nunca en el futuro, ni antes de 2024).
    let ini = hoyMes;
    const m = /^([0-9]{4})-([0-9]{2})$/.exec(sp.m ?? "");
    if (m) {
      const cand = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
      if (cand.getTime() <= hoyMes.getTime() && cand.getUTCFullYear() >= 2024) ini = cand;
    }
    const fin = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth() + 1, 1));
    const prevIni = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth() - 1, 1));
    return {
      key, desde: ini, hasta: fin, prevDesde: prevIni, prevHasta: ini,
      mes: mesISO(ini), mesAnterior: mesISO(prevIni),
      mesSiguiente: ini.getTime() < hoyMes.getTime() ? mesISO(fin) : null,
      etiqueta: `${cap(MES_CORTO[ini.getUTCMonth()])} ${ini.getUTCFullYear()}`,
      subtitulo: `${cap(mesLargo(ini))} ${ini.getUTCFullYear()} · comparado con ${mesLargo(prevIni)}`,
    };
  }
  if (key === "90") {
    const hasta = ahora;
    const desde = new Date(ahora.getTime() - 90 * DIA);
    return {
      key, desde, hasta, prevDesde: new Date(desde.getTime() - 90 * DIA), prevHasta: desde,
      mes: null, mesAnterior: null, mesSiguiente: null,
      etiqueta: "90 días", subtitulo: "Últimos 90 días · comparados con los 90 anteriores",
    };
  }
  if (key === "ano") {
    const y = ahora.getUTCFullYear();
    return {
      key, desde: new Date(Date.UTC(y, 0, 1)), hasta: ahora,
      prevDesde: new Date(Date.UTC(y - 1, 0, 1)), prevHasta: new Date(Date.UTC(y, 0, 1)),
      mes: null, mesAnterior: null, mesSiguiente: null,
      etiqueta: String(y), subtitulo: `Año ${y} · comparado con ${y - 1}`,
    };
  }
  return {
    key, desde: null, hasta: ahora, prevDesde: null, prevHasta: null,
    mes: null, mesAnterior: null, mesSiguiente: null,
    etiqueta: "Todo", subtitulo: "Histórico completo",
  };
}

// ── formatos ────────────────────────────────────────────────────────────────

const horasTxt = (min: number) => `${Math.round(min / 60)} h`;
// Dinero corto para KPIs: $18,4 M / $980 mil / $900. El detalle exacto vive en Facturación.
export function dineroCorto(n: number, currency = "COP"): string {
  const pre = currency === "COP" ? "$" : `${currency} `;
  if (Math.abs(n) >= 1_000_000) return `${pre}${(n / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} M`;
  if (Math.abs(n) >= 1_000) return `${pre}${Math.round(n / 1_000)} mil`;
  return `${pre}${Math.round(n)}`;
}
const deltaPct = (act: number, prev: number): { d?: string; dir: 1 | -1 | 0 } => {
  if (prev <= 0) return { dir: 0 };
  const p = Math.round(((act - prev) / prev) * 100);
  if (p === 0) return { d: "0%", dir: 0 };
  return { d: `${p > 0 ? "+" : ""}${p}%`, dir: p > 0 ? 1 : -1 };
};
const deltaN = (act: number, prev: number): { d?: string; dir: 1 | -1 | 0 } => {
  const df = act - prev;
  if (df === 0) return { d: "0", dir: 0 };
  return { d: `${df > 0 ? "+" : ""}${df}`, dir: df > 0 ? 1 : -1 };
};
const mediana = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const num1 = (n: number) => n.toFixed(1).replace(".", ",");

// Serie mensual de 8 puntos (para sparklines y la apilada): cubeta = meses hacia atrás.
function idxMes8(ms: number, ahora: Date): number {
  const d = new Date(ms);
  const dif = (ahora.getUTCFullYear() - d.getUTCFullYear()) * 12 + (ahora.getUTCMonth() - d.getUTCMonth());
  return dif >= 0 && dif < 8 ? 7 - dif : -1;
}
const etiquetas8 = (ahora: Date) =>
  Array.from({ length: 8 }, (_, i) => MES_CORTO[new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - (7 - i), 1)).getUTCMonth()]);

// Partición del PERIODO elegido en cubetas: semanas del mes, meses del trimestre/año, o
// años del histórico. Devuelve las etiquetas y la función que ubica un instante en su cubeta
// (-1 = fuera). La comparten el conteo (aprobados) y la suma (horas).
function particion(periodo: ReturnType<typeof parsePeriodo>, minAnio: number): { labels: string[]; idx: (ms: number) => number } {
  if (periodo.key === "mes" && periodo.desde) {
    const dias = Math.round((new Date(Date.UTC(periodo.desde.getUTCFullYear(), periodo.desde.getUTCMonth() + 1, 1)).getTime() - periodo.desde.getTime()) / DIA);
    const n = Math.ceil(dias / 7);
    const d0 = periodo.desde.getTime();
    const fin = periodo.hasta.getTime();
    return {
      labels: Array.from({ length: n }, (_, i) => `S${i + 1}`),
      idx: (ms) => (ms >= d0 && ms < fin ? Math.min(n - 1, Math.floor((ms - d0) / (7 * DIA))) : -1),
    };
  }
  if (periodo.key === "90" && periodo.desde) {
    // Tres meses calendario hacia atrás desde hoy.
    const labels: string[] = [];
    const claves: string[] = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(Date.UTC(periodo.hasta.getUTCFullYear(), periodo.hasta.getUTCMonth() - i, 1));
      labels.push(cap(MES_CORTO[d.getUTCMonth()]));
      claves.push(mesISO(d));
    }
    return { labels, idx: (ms) => claves.indexOf(mesISO(new Date(ms))) };
  }
  if (periodo.key === "ano" && periodo.desde) {
    const y = periodo.desde.getUTCFullYear();
    const hastaMes = periodo.hasta.getUTCMonth();
    return {
      labels: Array.from({ length: hastaMes + 1 }, (_, i) => cap(MES_CORTO[i])),
      idx: (ms) => {
        const d = new Date(ms);
        return d.getUTCFullYear() === y ? d.getUTCMonth() : -1;
      },
    };
  }
  const yFin = periodo.hasta.getUTCFullYear();
  const y0 = Math.max(minAnio, yFin - 5);
  return {
    labels: Array.from({ length: yFin - y0 + 1 }, (_, i) => String(y0 + i)),
    idx: (ms) => new Date(ms).getUTCFullYear() - y0,
  };
}

function cubetasDe(periodo: ReturnType<typeof parsePeriodo>, eventosMs: number[], minAnio: number): SerieBarras {
  const { labels, idx } = particion(periodo, minAnio);
  const valores = labels.map(() => 0);
  for (const ms of eventosMs) {
    const i = idx(ms);
    if (i >= 0 && i < labels.length) valores[i]++;
  }
  return { labels, valores };
}

// Igual que cubetasDe pero SUMANDO un valor (minutos) en vez de contar.
function cubetasSuma(periodo: ReturnType<typeof parsePeriodo>, eventos: { ms: number; v: number }[], minAnio: number): SerieBarras {
  const { labels, idx } = particion(periodo, minAnio);
  const valores = labels.map(() => 0);
  for (const e of eventos) {
    const i = idx(e.ms);
    if (i >= 0 && i < labels.length) valores[i] += e.v;
  }
  return { labels, valores };
}

// ── el constructor ──────────────────────────────────────────────────────────

export async function construirReporte(session: SessionUser | null, sp: { p?: string; m?: string }): Promise<ReporteDatos> {
  const ahora = new Date();
  const periodo = parsePeriodo(sp, ahora);
  const canFin = hasPermission(session, "ver_finanzas");
  const canCumpl = hasPermission(session, "ver_cumplimiento");
  const enRango = (ms: number) => (periodo.desde === null || ms >= periodo.desde.getTime()) && ms < periodo.hasta.getTime();
  const enPrev = (ms: number) =>
    periodo.prevDesde !== null && periodo.prevHasta !== null && ms >= periodo.prevDesde.getTime() && ms < periodo.prevHasta.getTime();

  const { statuses } = await getTaskLabels();
  const openKeys = statuses.filter((s) => !s.isDone).map((s) => s.key);

  // Ventana de HORAS: cubre el periodo, el anterior y los 8 meses de las sparklines.
  const hace8m = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 7, 1));
  const desdeHoras =
    periodo.key === "todo" ? null : new Date(Math.min(periodo.prevDesde?.getTime() ?? Infinity, periodo.desde?.getTime() ?? Infinity, hace8m.getTime()));

  const [
    entregables, decisiones, actividadAprobados, versionesAgg, versionesPeriodo,
    entradas, cargaAgg, usuarios, clientesDb, facturas,
    cumplRows, cumplPrevRows,
  ] = await Promise.all([
    // Todas las piezas vivas, con su proyecto y cliente (pocos cientos de filas).
    db.deliverable.findMany({
      where: { archivedAt: null, project: { archivedAt: null } },
      select: {
        id: true, name: true, number: true, status: true, createdAt: true, updatedAt: true,
        project: { select: { id: true, name: true, emoji: true, status: true, clientId: true, client: { select: { name: true } } } },
      },
    }),
    // Decisiones del cliente: la verdad de aprobaciones y correcciones.
    db.deliverableDecision.findMany({
      where: { stage: "CLIENTE" },
      select: { deliverableId: true, result: true, createdAt: true },
    }),
    // Red de seguridad: estados movidos A MANO a Aprobado/Entregado (no escriben decisión).
    db.activityLog.findMany({
      where: {
        action: "deliverable.status",
        OR: [{ summary: { endsWith: "a Aprobado" } }, { summary: { endsWith: "a Entregado" } }],
      },
      select: { entityId: true, createdAt: true },
    }),
    // Versiones por pieza (conteo total) — para «versiones/pieza».
    db.deliverableVersion.groupBy({ by: ["deliverableId"], _count: { _all: true } }),
    // Versiones SUBIDAS en la ventana (quién trabajó qué pieza).
    desdeHoras
      ? db.deliverableVersion.findMany({ where: { createdAt: { gte: desdeHoras } }, select: { deliverableId: true, uploadedById: true, createdAt: true } })
      : db.deliverableVersion.findMany({ select: { deliverableId: true, uploadedById: true, createdAt: true } }),
    // Horas imputadas en la ventana, con su tarea → proyecto.
    db.timeEntry.findMany({
      where: desdeHoras ? { spentOn: { gte: desdeHoras } } : {},
      select: { minutes: true, spentOn: true, userId: true, task: { select: { projectId: true } } },
    }),
    // Carga actual: tareas abiertas por persona (foto de hoy, no depende del periodo).
    db.task.groupBy({ by: ["assigneeId"], where: { status: { in: openKeys }, assigneeId: { not: null } }, _count: { _all: true } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true, initials: true, avatarColor: true } }),
    db.client.findMany({
      where: { isActive: true, archivedAt: null },
      select: { id: true, name: true, emoji: true, projects: { where: { archivedAt: null }, select: { id: true } } },
    }),
    canFin
      ? db.invoice.findMany({
          select: { clientId: true, status: true, dueDate: true, issueDate: true, paidAt: true, taxRate: true, currency: true, items: { select: { quantity: true, unitPrice: true } } },
        })
      : Promise.resolve([]),
    personCompliance({ from: periodo.desde ?? undefined, to: periodo.hasta }),
    periodo.prevDesde && periodo.prevHasta
      ? personCompliance({ from: periodo.prevDesde, to: periodo.prevHasta })
      : Promise.resolve([]),
  ]);

  const piezaDe = new Map(entregables.map((d) => [d.id, d]));

  // ── Aprobaciones: la PRIMERA por pieza (decisión o bitácora, lo que llegue primero) ──
  const primeraAprob = new Map<string, number>();
  const anota = (id: string, ms: number) => {
    if (!piezaDe.has(id)) return;
    const cur = primeraAprob.get(id);
    if (cur === undefined || ms < cur) primeraAprob.set(id, ms);
  };
  for (const d of decisiones) if (d.result === "APROBADO") anota(d.deliverableId, d.createdAt.getTime());
  for (const a of actividadAprobados) if (a.entityId) anota(a.entityId, a.createdAt.getTime());

  // Correcciones del cliente (decisiones CAMBIOS) por pieza, con fechas.
  const cambiosPorPieza = new Map<string, number[]>();
  for (const d of decisiones) {
    if (d.result !== "CAMBIOS") continue;
    if (!piezaDe.has(d.deliverableId)) continue;
    const arr = cambiosPorPieza.get(d.deliverableId) ?? [];
    arr.push(d.createdAt.getTime());
    cambiosPorPieza.set(d.deliverableId, arr);
  }
  const cambiosMs = [...cambiosPorPieza.values()].flat();

  const aprobEventos = [...primeraAprob.entries()]; // [deliverableId, ms]
  const aprobEnRango = aprobEventos.filter(([, ms]) => enRango(ms));
  const aprobPrev = aprobEventos.filter(([, ms]) => enPrev(ms)).length;
  const cambiosEnRango = cambiosMs.filter(enRango).length;
  const cambiosPrev = cambiosMs.filter(enPrev).length;

  // «A la primera»: aprobada sin NINGÚN cambio pedido antes de su primera aprobación.
  const aLaPrimera = aprobEnRango.filter(([id, ms]) => !(cambiosPorPieza.get(id) ?? []).some((c) => c < ms)).length;

  const versionesDe = new Map(versionesAgg.map((v) => [v.deliverableId, v._count._all]));
  const diasAprob = aprobEnRango
    .map(([id, ms]) => {
      const p = piezaDe.get(id);
      return p ? (ms - p.createdAt.getTime()) / DIA : null;
    })
    .filter((x): x is number => x !== null && x >= 0);
  const medDias = mediana(diasAprob);
  const versProm = aprobEnRango.length
    ? aprobEnRango.reduce((s, [id]) => s + (versionesDe.get(id) ?? 1), 0) / aprobEnRango.length
    : null;

  // ── Horas ──
  const minEnRango = entradas.filter((e) => enRango(e.spentOn.getTime()));
  const horasAct = minEnRango.reduce((s, e) => s + e.minutes, 0);
  const horasPrev = entradas.filter((e) => enPrev(e.spentOn.getTime())).reduce((s, e) => s + e.minutes, 0);

  // ── Proyectos activos (foto de hoy; incluye los que aún no tienen entregables) ──
  const totalProyectosActivos = await db.project.count({ where: { archivedAt: null, status: { notIn: INACTIVOS as never } } });

  // ── Cumplimiento agregado ──
  const juzgadas = cumplRows.reduce((s, r) => s + r.judged, 0);
  const aTiempo = cumplRows.reduce((s, r) => s + r.onTime, 0);
  const pctCumpl = juzgadas ? Math.round((aTiempo / juzgadas) * 100) : null;
  const juzgadasPrev = cumplPrevRows.reduce((s, r) => s + r.judged, 0);
  const pctCumplPrev = juzgadasPrev ? Math.round((cumplPrevRows.reduce((s, r) => s + r.onTime, 0) / juzgadasPrev) * 100) : null;

  // ── Finanzas del periodo ──
  const moneda = facturas[0]?.currency ?? "COP";
  const totalDe = (f: (typeof facturas)[number]) => quoteTotals(f.items, f.taxRate).total;
  const emitidas = facturas.filter((f) => f.status !== "BORRADOR" && f.status !== "ANULADA");
  const factPeriodo = emitidas.filter((f) => enRango(f.issueDate.getTime())).reduce((s, f) => s + totalDe(f), 0);
  const factPrev = emitidas.filter((f) => enPrev(f.issueDate.getTime())).reduce((s, f) => s + totalDe(f), 0);
  const cobradoPeriodo = emitidas.filter((f) => f.paidAt && enRango(f.paidAt.getTime())).reduce((s, f) => s + totalDe(f), 0);
  const vencidas = emitidas.filter((f) => effectiveInvoiceStatus(f.status, f.dueDate) === "VENCIDA");
  const vencidoTotal = vencidas.reduce((s, f) => s + totalDe(f), 0);
  const pctCobradoPeriodo = factPeriodo > 0 ? Math.round((cobradoPeriodo / factPeriodo) * 100) : null;

  // ── Sparklines (8 meses) ──
  const sp8 = (ms: number[]): number[] => {
    const v = new Array(8).fill(0);
    for (const m of ms) {
      const i = idxMes8(m, ahora);
      if (i >= 0) v[i]++;
    }
    return v;
  };
  const spHoras = (() => {
    const v = new Array(8).fill(0);
    for (const e of entradas) {
      const i = idxMes8(e.spentOn.getTime(), ahora);
      if (i >= 0) v[i] += e.minutes;
    }
    return v.map((m) => Math.round(m / 60));
  })();
  const spCobrado = (() => {
    const v = new Array(8).fill(0);
    for (const f of emitidas) {
      if (!f.paidAt) continue;
      const i = idxMes8(f.paidAt.getTime(), ahora);
      if (i >= 0) v[i] += totalDe(f);
    }
    return v.map((n) => Math.round(n / 1_000_000));
  })();

  // ── KPIs Estudio ──
  const kpis: Kpi[] = [
    { l: "Videos aprobados", v: String(aprobEnRango.length), ...(periodo.key === "todo" ? { dir: 0 as const } : deltaN(aprobEnRango.length, aprobPrev)), sp: sp8(aprobEventos.map(([, ms]) => ms)) },
    { l: "Proyectos activos", v: String(totalProyectosActivos), dir: 0 },
    { l: "Horas registradas", v: horasTxt(horasAct), ...(periodo.key === "todo" ? { dir: 0 as const } : deltaPct(horasAct, horasPrev)), sp: spHoras },
    {
      l: "Cumplimiento", v: pctCumpl === null ? "—" : `${pctCumpl}%`,
      ...(pctCumpl !== null && pctCumplPrev !== null ? deltaN(pctCumpl, pctCumplPrev) : { dir: 0 as const }),
    },
    { l: "Correcciones", v: String(cambiosEnRango), ...(periodo.key === "todo" ? { dir: 0 as const } : deltaN(cambiosEnRango, cambiosPrev)), inv: true, sp: sp8(cambiosMs) },
    ...(canFin
      ? [{
          l: "Cobrado", v: dineroCorto(cobradoPeriodo, moneda),
          ...(pctCobradoPeriodo !== null ? { d: `${pctCobradoPeriodo}%`, dir: 2 as const } : { dir: 0 as const }),
          sp: spCobrado,
        }]
      : []),
  ];

  // ── Series del periodo ──
  const minAnio = Math.min(
    ahora.getUTCFullYear(),
    ...aprobEventos.map(([, ms]) => new Date(ms).getUTCFullYear()),
    ...entradas.map((e) => e.spentOn.getUTCFullYear()),
  );
  const serieAprobados = cubetasDe(periodo, aprobEnRango.map(([, ms]) => ms), minAnio);
  const serieHorasRaw = cubetasSuma(periodo, minEnRango.map((e) => ({ ms: e.spentOn.getTime(), v: e.minutes })), minAnio);
  const serieHoras = { labels: serieHorasRaw.labels, valores: serieHorasRaw.valores.map((m) => Math.round(m / 60)) };

  // ── Esfuerzo por proyecto (top 5) ──
  const etiquetaProyecto = (p: { name: string; emoji: string | null; client: { name: string } | null }) =>
    `${emojiToText(p.emoji, "🎬")} ${p.client ? `${p.client.name} · ` : ""}${p.name}`;
  const proyInfo = new Map<string, { label: string; clientId: string | null }>();
  for (const d of entregables) {
    if (!proyInfo.has(d.project.id)) proyInfo.set(d.project.id, { label: etiquetaProyecto(d.project), clientId: d.project.clientId });
  }
  const minPorProyecto = new Map<string, number>();
  for (const e of minEnRango) {
    const pid = e.task.projectId;
    if (!pid) continue;
    minPorProyecto.set(pid, (minPorProyecto.get(pid) ?? 0) + e.minutes);
  }
  // Proyectos con horas pero sin entregables (no están en proyInfo): se piden sus nombres.
  const faltantes = [...minPorProyecto.keys()].filter((id) => !proyInfo.has(id));
  if (faltantes.length) {
    const extra = await db.project.findMany({
      where: { id: { in: faltantes } },
      select: { id: true, name: true, emoji: true, clientId: true, client: { select: { name: true } } },
    });
    for (const p of extra) proyInfo.set(p.id, { label: etiquetaProyecto(p), clientId: p.clientId });
  }
  const esfuerzo: FilaBarra[] = [...minPorProyecto.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pid, min]) => ({ label: proyInfo.get(pid)?.label ?? "Proyecto", valor: Math.round(min / 60), sufijo: " h" }));

  // ── Cumplimiento por persona ──
  const cumplimiento: FilaCumplimiento[] = cumplRows
    .filter((r) => r.judged > 0)
    .map((r) => ({
      id: r.user.id, ini: r.user.initials, nombre: r.user.name ?? "—", color: r.user.avatarColor,
      ok: r.onTime, tarde: r.late, venc: r.overdueOpen, pct: r.pct,
    }));

  // ── Caso ENTREGAS ──
  const kpisEntregas: Kpi[] = [
    { l: "Aprobadas", v: String(aprobEnRango.length), ...(periodo.key === "todo" ? { dir: 0 as const } : deltaN(aprobEnRango.length, aprobPrev)) },
    {
      l: "A la primera",
      v: aprobEnRango.length ? `${Math.round((aLaPrimera / aprobEnRango.length) * 100)}%` : "—",
      d: aprobEnRango.length ? `${aLaPrimera} de ${aprobEnRango.length}` : undefined, dir: 2,
    },
    { l: "Versiones/pieza", v: versProm === null ? "—" : num1(versProm), dir: 0 },
    { l: "Días a aprobar", v: medDias === null ? "—" : num1(medDias), d: medDias === null ? undefined : "mediana", dir: 2 },
    { l: "Correcciones", v: String(cambiosEnRango), ...(periodo.key === "todo" ? { dir: 0 as const } : deltaN(cambiosEnRango, cambiosPrev)), inv: true },
  ];

  // Apilada de 8 meses: primeras aprobaciones partidas en «a la primera» vs «con correcciones».
  const apiladas: SerieApilada = (() => {
    const a = new Array(8).fill(0);
    const b = new Array(8).fill(0);
    for (const [id, ms] of aprobEventos) {
      const i = idxMes8(ms, ahora);
      if (i < 0) continue;
      const limpio = !(cambiosPorPieza.get(id) ?? []).some((c) => c < ms);
      if (limpio) a[i]++;
      else b[i]++;
    }
    return { labels: etiquetas8(ahora).map(cap), a, b };
  })();

  // Correcciones por proyecto (top 5, del periodo) + la pieza con más versiones.
  const corrPorProyectoMap = new Map<string, number>();
  for (const [id, fechas] of cambiosPorPieza) {
    const n = fechas.filter(enRango).length;
    if (!n) continue;
    const p = piezaDe.get(id);
    if (!p) continue;
    corrPorProyectoMap.set(p.project.id, (corrPorProyectoMap.get(p.project.id) ?? 0) + n);
  }
  const corrPorProyecto: FilaBarra[] = [...corrPorProyectoMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pid, n]) => ({ label: proyInfo.get(pid)?.label ?? "Proyecto", valor: n }));

  const piezaTop = (() => {
    let mejor: { txt: string; v: number } | null = null;
    for (const [id] of aprobEnRango) {
      const v = versionesDe.get(id) ?? 1;
      if (v > 1 && (!mejor || v > mejor.v)) {
        const p = piezaDe.get(id)!;
        mejor = { txt: `«${p.name}» (${p.project.client?.name ?? p.project.name}) — ${v} versiones`, v };
      }
    }
    return mejor?.txt ?? null;
  })();

  // Tabla por proyecto (proyectos activos con piezas).
  const DONE = ["APROBADO", "ENTREGADO"];
  const porProyecto = new Map<string, (typeof entregables)[number][]>();
  for (const d of entregables) {
    if (INACTIVOS.includes(d.project.status)) continue;
    const arr = porProyecto.get(d.project.id) ?? [];
    arr.push(d);
    porProyecto.set(d.project.id, arr);
  }
  const tablaEntregas: FilaEntrega[] = [...porProyecto.entries()]
    .map(([pid, piezas]) => {
      const aprobadas = piezas.filter((d) => primeraAprob.has(d.id) && enRango(primeraAprob.get(d.id)!)).length;
      const enCurso = piezas.filter((d) => !DONE.includes(d.status)).length;
      const corr = corrPorProyectoMap.get(pid) ?? 0;
      const vers = piezas.map((d) => versionesDe.get(d.id) ?? 0).filter((v) => v > 0);
      const dias = piezas
        .map((d) => (primeraAprob.has(d.id) && enRango(primeraAprob.get(d.id)!) ? (primeraAprob.get(d.id)! - d.createdAt.getTime()) / DIA : null))
        .filter((x): x is number => x !== null && x >= 0);
      const md = mediana(dias);
      const atascada = piezas.some((d) => d.status === "CORRECCIONES" && ahora.getTime() - d.updatedAt.getTime() > 5 * DIA);
      return {
        label: proyInfo.get(pid)?.label ?? "Proyecto",
        piezas: piezas.length,
        aprobadas,
        enCurso,
        correcciones: corr,
        versionesTxt: vers.length ? num1(vers.reduce((s, v) => s + v, 0) / vers.length) : "—",
        diasTxt: md === null ? "—" : num1(md),
        tono: (atascada || corr >= 4 ? "warn" : "ok") as "ok" | "warn",
      };
    })
    .sort((a, b) => b.piezas - a.piezas);

  // ── Caso EQUIPO ──
  const cargaDe = new Map(cargaAgg.map((r) => [r.assigneeId as string, r._count._all]));
  const cumplDe = new Map(cumplRows.map((r) => [r.user.id, r]));
  const cerradasAgg = await db.task.groupBy({
    by: ["assigneeId"],
    where: {
      assigneeId: { not: null },
      completedAt: periodo.desde ? { gte: periodo.desde, lt: periodo.hasta } : { not: null, lt: periodo.hasta },
    },
    _count: { _all: true },
  });
  const cerradasDe = new Map(cerradasAgg.map((r) => [r.assigneeId as string, r._count._all]));
  const piezasDePersona = new Map<string, Set<string>>();
  for (const v of versionesPeriodo) {
    if (!v.uploadedById || !enRango(v.createdAt.getTime())) continue;
    const set = piezasDePersona.get(v.uploadedById) ?? new Set();
    set.add(v.deliverableId);
    piezasDePersona.set(v.uploadedById, set);
  }
  const minPersonaProyecto = new Map<string, Map<string, number>>();
  const minPersona = new Map<string, number>();
  for (const e of minEnRango) {
    if (!e.userId) continue;
    minPersona.set(e.userId, (minPersona.get(e.userId) ?? 0) + e.minutes);
    if (e.task.projectId) {
      const m = minPersonaProyecto.get(e.userId) ?? new Map<string, number>();
      m.set(e.task.projectId, (m.get(e.task.projectId) ?? 0) + e.minutes);
      minPersonaProyecto.set(e.userId, m);
    }
  }
  const personas: PersonaReporte[] = usuarios
    .map((u) => {
      const c = cumplDe.get(u.id);
      return {
        id: u.id, ini: u.initials, nombre: u.name, color: u.avatarColor,
        horas: Math.round((minPersona.get(u.id) ?? 0) / 60),
        tareasCerradas: cerradasDe.get(u.id) ?? 0,
        pctATiempo: c?.pct ?? null,
        piezas: piezasDePersona.get(u.id)?.size ?? 0,
        carga: cargaDe.get(u.id) ?? 0,
        porProyecto: [...(minPersonaProyecto.get(u.id) ?? new Map<string, number>()).entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([pid, min]) => ({ label: proyInfo.get(pid)?.label ?? "Proyecto", valor: Math.round(min / 60), sufijo: " h" })),
      };
    })
    // Solo quien tuvo ALGO en el periodo (horas, tareas, piezas o carga): los demás no ocupan fila.
    .filter((p) => p.horas > 0 || p.tareasCerradas > 0 || p.piezas > 0 || p.carga > 0)
    .sort((a, b) => b.horas - a.horas);

  // ── Caso CLIENTES ──
  const factPorCliente = new Map<string, { fact: number; cobr: number; vencMs: number | null }>();
  for (const f of emitidas) {
    const cur = factPorCliente.get(f.clientId) ?? { fact: 0, cobr: 0, vencMs: null };
    const t = totalDe(f);
    cur.fact += t;
    if (f.status === "PAGADA") cur.cobr += t;
    if (effectiveInvoiceStatus(f.status, f.dueDate) === "VENCIDA" && f.dueDate) {
      cur.vencMs = Math.min(cur.vencMs ?? Infinity, f.dueDate.getTime());
    }
    factPorCliente.set(f.clientId, cur);
  }
  const piezasPorCliente = new Map<string, (typeof entregables)[number][]>();
  for (const d of entregables) {
    const cid = d.project.clientId;
    if (!cid) continue;
    const arr = piezasPorCliente.get(cid) ?? [];
    arr.push(d);
    piezasPorCliente.set(cid, arr);
  }
  const minPorCliente = new Map<string, number>();
  for (const [pid, min] of minPorProyecto) {
    const cid = proyInfo.get(pid)?.clientId;
    if (!cid) continue;
    minPorCliente.set(cid, (minPorCliente.get(cid) ?? 0) + min);
  }
  const clientes: FilaCliente[] = clientesDb
    .map((c) => {
      const piezas = piezasPorCliente.get(c.id) ?? [];
      const hechos = piezas.filter((d) => DONE.includes(d.status)).length;
      const enCorreccion = piezas.filter((d) => d.status === "CORRECCIONES");
      const atascadas = enCorreccion.filter((d) => ahora.getTime() - d.updatedAt.getTime() > 5 * DIA).length;
      const fin = factPorCliente.get(c.id);
      const motivos: string[] = [];
      let salud: FilaCliente["salud"] = "ok";
      if (fin?.vencMs) {
        salud = "bad";
        motivos.push(`Factura vencida hace ${Math.max(1, Math.floor((ahora.getTime() - fin.vencMs) / DIA))} días`);
      }
      if (atascadas) {
        salud = "bad";
        motivos.push(`${atascadas} ${atascadas === 1 ? "corrección estancada" : "correcciones estancadas"} (+5 días sin versión nueva)`);
      }
      if (salud === "ok" && enCorreccion.length) {
        salud = "warn";
        motivos.push(`${enCorreccion.length} ${enCorreccion.length === 1 ? "pieza" : "piezas"} en correcciones`);
      }
      if (salud === "ok" && canFin && (!fin || fin.fact === 0) && piezas.length > 0) {
        salud = "warn";
        motivos.push("Con trabajo en curso y aún sin facturar");
      }
      if (!motivos.length) motivos.push("Al día");
      return {
        id: c.id,
        emoji: emojiToText(c.emoji, "📁"),
        nombre: c.name,
        hechos, total: piezas.length,
        correcciones: enCorreccion.length,
        horas: Math.round((minPorCliente.get(c.id) ?? 0) / 60),
        dineroTxt: canFin ? `${dineroCorto(fin?.cobr ?? 0, moneda)} / ${dineroCorto(fin?.fact ?? 0, moneda)}` : null,
        pctCobrado: canFin ? (fin && fin.fact > 0 ? Math.round((fin.cobr / fin.fact) * 100) : null) : null,
        salud, motivo: motivos.join(" · "),
      };
    })
    // Cuentas sin piezas, sin horas y sin plata no aportan fila.
    .filter((c) => c.total > 0 || c.horas > 0 || (c.dineroTxt !== null && c.pctCobrado !== null))
    .sort((a, b) => (a.salud === b.salud ? b.horas - a.horas : a.salud === "bad" ? -1 : b.salud === "bad" ? 1 : a.salud === "warn" ? -1 : 1));

  // ── Caso FINANZAS ──
  const kpisFinanzas: Kpi[] = canFin
    ? [
        { l: "Facturado", v: dineroCorto(factPeriodo, moneda), ...(periodo.key === "todo" ? { dir: 0 as const } : deltaPct(factPeriodo, factPrev)) },
        { l: "Cobrado", v: dineroCorto(cobradoPeriodo, moneda), ...(pctCobradoPeriodo !== null ? { d: `${pctCobradoPeriodo}%`, dir: 2 as const } : { dir: 0 as const }), sp: spCobrado },
        { l: "Vencido hoy", v: dineroCorto(vencidoTotal, moneda), d: vencidas.length ? `${vencidas.length} ${vencidas.length === 1 ? "factura" : "facturas"}` : "sin vencidas", dir: 2 },
      ]
    : [];

  return {
    periodo: {
      key: periodo.key, mes: periodo.mes, mesAnterior: periodo.mesAnterior, mesSiguiente: periodo.mesSiguiente,
      etiqueta: periodo.etiqueta, subtitulo: periodo.subtitulo,
    },
    canFin, canCumpl,
    kpis, serieAprobados, serieHoras, esfuerzo, cumplimiento,
    kpisEntregas, apiladas, corrPorProyecto, piezaTop, tablaEntregas,
    personas, clientes, kpisFinanzas,
  };
}
