import { describe, it, expect } from "vitest";
import { isQuoteStatus, isInvoiceStatus, isProposalStatus, isDeliverableStatus } from "./enum-guards";

describe("enum-guards (validan estados contra el enum REAL de Prisma)", () => {
  it("acepta los estados válidos de cada enum", () => {
    expect(isQuoteStatus("APROBADA")).toBe(true);
    expect(isInvoiceStatus("PAGADA")).toBe(true);
    expect(isProposalStatus("ACEPTADA")).toBe(true);
    expect(isDeliverableStatus("ENTREGADO")).toBe(true);
  });

  it("rechaza basura", () => {
    expect(isQuoteStatus("XXX")).toBe(false);
    expect(isInvoiceStatus("")).toBe(false);
    expect(isProposalStatus("nope")).toBe(false);
    expect(isDeliverableStatus("123")).toBe(false);
  });

  it("rechaza valores que pertenecen a OTRO enum (no se cruzan)", () => {
    // "PAGADA" es de factura, no de cotización.
    expect(isQuoteStatus("PAGADA")).toBe(false);
    // "APROBADO" (entregable) ≠ "ACEPTADA" (propuesta) ≠ "APROBADA" (cotización).
    expect(isProposalStatus("APROBADO")).toBe(false);
    expect(isProposalStatus("APROBADA")).toBe(false);
    expect(isDeliverableStatus("ACEPTADA")).toBe(false);
  });

  it("distingue mayúsculas (no normaliza)", () => {
    expect(isQuoteStatus("aprobada")).toBe(false);
    expect(isInvoiceStatus("Pagada")).toBe(false);
  });
});
