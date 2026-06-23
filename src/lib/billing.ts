import { Prisma, type ProjectStatus } from "@prisma/client";
import { composeQuoteTotals } from "./quote-compose";

// Un proyecto "terminado" ya se puede facturar (es cuando, según el flujo del estudio,
// toca emitir la factura). No incluye CANCELADO (ese no se factura).
export const TERMINATED_PROJECT_STATUS: ProjectStatus[] = ["ENTREGADO", "CERRADO"];

// Filtro Prisma de cotizaciones que están "por facturar": aprobadas, aún sin ninguna
// factura, y que ya toca cobrar — sin proyecto (cobro directo/recurrente) o con el
// proyecto terminado. Se compone con un `client`/scope adicional en cada página.
export function billableQuoteWhere(): Prisma.QuoteWhereInput {
  return {
    status: "APROBADA",
    invoices: { none: {} },
    OR: [
      { projectId: null },
      { project: { status: { in: TERMINATED_PROJECT_STATUS } } },
    ],
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
