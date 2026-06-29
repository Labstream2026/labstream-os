import { QuoteStatus, InvoiceStatus, ProposalStatus, DeliverableStatus, ColumnType, DeliverableType, ProjectRole } from "@prisma/client";

// Type-guards para estados que llegan como string (de un form/acción pública) y se escriben
// en un enum de Prisma. Validan contra los valores REALES del enum y, de paso, ESTRECHAN el
// tipo: así el `db.update({ status })` no necesita `as never` (la validación y el tipo van
// juntos; si el enum cambia en el schema, el guard se actualiza solo).
function makeStatusGuard<T extends Record<string, string>>(e: T) {
  const values = new Set<string>(Object.values(e));
  return (s: string): s is T[keyof T] => values.has(s);
}

export const isQuoteStatus = makeStatusGuard(QuoteStatus);
export const isInvoiceStatus = makeStatusGuard(InvoiceStatus);
export const isProposalStatus = makeStatusGuard(ProposalStatus);
export const isDeliverableStatus = makeStatusGuard(DeliverableStatus);
export const isColumnType = makeStatusGuard(ColumnType);
export const isDeliverableType = makeStatusGuard(DeliverableType);
export const isProjectRole = makeStatusGuard(ProjectRole);
