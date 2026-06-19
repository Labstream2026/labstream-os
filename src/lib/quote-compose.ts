// Totales de cotización con IMPREVISTO oculto al cliente.
//
// Convención: las líneas se guardan a COSTO (unitPrice = precio interno del catálogo o el
// que el equipo ajuste). El cliente NO ve la línea del imprevisto: ve cada valor ya
// ajustado (×(1+imprevisto%)), de modo que los valores discriminados suman al subtotal y,
// con el IVA aparte, dan el total. El equipo sí ve el desglose (costo + imprevisto).

export type QuoteLine = { quantity: number; unitPrice: number };

// Valor que VE EL CLIENTE por una línea: costo de la línea ajustado por el imprevisto.
export function clientLineValue(item: QuoteLine, contingencyPct = 0): number {
  const f = 1 + Math.max(0, contingencyPct) / 100;
  return Math.round(item.quantity * item.unitPrice * f);
}

export type QuoteTotals = {
  costSubtotal: number;   // suma de líneas a costo (interno)
  contingency: number;    // imprevisto interno (no visible al cliente)
  clientSubtotal: number; // subtotal que ve el cliente (costo + imprevisto)
  tax: number;            // IVA sobre el subtotal del cliente
  total: number;          // subtotal del cliente + IVA
};

export function composeQuoteTotals(
  items: QuoteLine[],
  opts: { taxRate?: number; contingencyPct?: number } = {},
): QuoteTotals {
  const taxRate = Math.max(0, opts.taxRate ?? 0);
  const contingencyPct = Math.max(0, opts.contingencyPct ?? 0);
  const costSubtotal = items.reduce((n, i) => n + i.quantity * i.unitPrice, 0);
  const clientSubtotal = items.reduce((n, i) => n + clientLineValue(i, contingencyPct), 0);
  const contingency = clientSubtotal - costSubtotal;
  const tax = Math.round((clientSubtotal * taxRate) / 100);
  return { costSubtotal, contingency, clientSubtotal, tax, total: clientSubtotal + tax };
}

// Etiqueta legible para la unidad de cobro (singular/plural simple según cantidad).
export function unitLabel(unit: string | null | undefined, qty = 1): string {
  if (!unit) return "";
  const u = unit.trim().toLowerCase();
  const plural = qty !== 1;
  const map: Record<string, [string, string]> = {
    "día": ["día", "días"], dia: ["día", "días"],
    hora: ["hora", "horas"], minuto: ["minuto", "minutos"],
    unidad: ["unidad", "unidades"], evento: ["evento", "eventos"],
    mes: ["mes", "meses"], noche: ["noche", "noches"], servicio: ["servicio", "servicios"],
  };
  const hit = map[u];
  if (hit) return plural ? hit[1] : hit[0];
  return unit; // unidades compuestas como "unidad/día" se muestran tal cual
}
