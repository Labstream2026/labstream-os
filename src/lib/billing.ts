import { Prisma, type ProjectStatus } from "@prisma/client";
import { clientLineValue, composeQuoteTotals } from "./quote-compose";

// Un proyecto "terminado" ya se puede facturar (es cuando, según el flujo del estudio,
// toca emitir la factura). No incluye CANCELADO (ese no se factura).
export const TERMINATED_PROJECT_STATUS: ProjectStatus[] = ["ENTREGADO", "CERRADO"];

// Filtro Prisma de cotizaciones que están "por facturar": aprobadas, aún sin ninguna
// factura, y que ya toca cobrar — sin proyecto (cobro directo/recurrente) o con el
// proyecto terminado. Se compone con un `client`/scope adicional en cada página.
export function billableQuoteWhere(): Prisma.QuoteWhereInput {
  return {
    status: "APROBADA",
    // «Sin factura» ahora significa sin factura COMPLETA ni de SALDO: una cotización con
    // solo el ANTICIPO facturado vuelve a la cola cuando el proyecto termina — le falta el
    // saldo, y eso es exactamente lo que hay que cobrar.
    invoices: { none: { OR: [{ parte: null }, { parte: "SALDO" }] } },
    OR: [
      { projectId: null },
      { project: { status: { in: TERMINATED_PROJECT_STATUS } } },
    ],
  };
}

// Cotizaciones con ANTICIPO pactado cuyo proyecto está EN CURSO y aún sin ninguna factura:
// el hito de cobro que antes pasaba fuera de la app. Solo con proyecto (el cobro directo sin
// proyecto ya se factura completo de inmediato, un anticipo ahí no significa nada).
export function advanceBillableQuoteWhere(): Prisma.QuoteWhereInput {
  return {
    status: "APROBADA",
    advancePct: { gt: 0 },
    projectId: { not: null },
    project: { status: { notIn: [...TERMINATED_PROJECT_STATUS, "CANCELADO"] } },
    invoices: { none: {} },
  };
}

// Total que se facturaría de una cotización: precio al cliente (con imprevisto ya
// incluido) + IVA. Es la misma base que usa createInvoiceFromQuote al emitir.
export function quoteBillTotal(q: {
  items: { quantity: number; unitPrice: number }[];
  taxRate: number;
  contingencyPct: number;
}): number {
  return composeQuoteTotals(q.items, { taxRate: q.taxRate, contingencyPct: q.contingencyPct }).total;
}

// % de anticipo saneado: entre 1 y 90 (un anticipo del 0 % no existe y del 100 % es la
// factura completa). El default 50 es la norma del sector. MISMO clamp que usa la emisión.
export function clampAdvancePct(pct: number | null | undefined): number {
  return Math.min(90, Math.max(1, pct ?? 50));
}

type QuoteConAnticipo = {
  items: { quantity: number; unitPrice: number }[];
  taxRate: number;
  contingencyPct: number;
  advancePct: number | null;
};

// Base (sin IVA) de las dos partes, calculada EXACTAMENTE como los ítems que emite
// invoice-from-quote: anticipo redondeado, saldo = complemento al peso.
function basesPartes(q: QuoteConAnticipo): { anticipo: number; saldo: number } {
  const subtotal = q.items.reduce((n, i) => n + clientLineValue(i, q.contingencyPct), 0);
  const anticipo = Math.round((subtotal * clampAdvancePct(q.advancePct)) / 100);
  return { anticipo, saldo: subtotal - anticipo };
}

// Total CON IVA de la factura de anticipo / de saldo, tal como quedará al emitirla
// (el IVA se calcula sobre la base de cada factura, igual que en la factura misma).
export function advanceBillTotal(q: QuoteConAnticipo): number {
  const base = basesPartes(q).anticipo;
  return base + Math.round((base * Math.max(0, q.taxRate)) / 100);
}

export function saldoBillTotal(q: QuoteConAnticipo): number {
  const base = basesPartes(q).saldo;
  return base + Math.round((base * Math.max(0, q.taxRate)) / 100);
}

// Estado efectivo: una factura ENVIADA cuyo vencimiento ya pasó se considera VENCIDA
// (sin necesidad de un cron).
export function effectiveInvoiceStatus(status: string, dueDate: Date | null): string {
  if (status === "ENVIADA" && dueDate && new Date(dueDate) < new Date()) return "VENCIDA";
  return status;
}

// Días transcurridos desde una fecha (para marcar antigüedad de lo pendiente por facturar).
export function daysSince(date: Date | null | undefined): number | null {
  if (!date) return null;
  const ms = Date.now() - new Date(date).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
