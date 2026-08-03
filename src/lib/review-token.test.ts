import { describe, it, expect, beforeAll } from "vitest";

// El firmado usa APP_SECRET; en pruebas basta con uno fijo.
beforeAll(() => {
  process.env.APP_SECRET = process.env.APP_SECRET || "prueba-de-tokens-de-revision-0123456789";
});

const { signReviewToken, verifyReviewToken, signDraftToken, verifyDraftToken, resolveReviewToken } = await import("./review-token");

const ID = "clx0000000000000000000000";

describe("tokens de la sala de revisión", () => {
  it("el token oficial vuelve a su entregable", () => {
    expect(verifyReviewToken(signReviewToken(ID))).toBe(ID);
  });

  it("el token de borrador vuelve a su entregable", () => {
    expect(verifyDraftToken(signDraftToken(ID))).toBe(ID);
  });

  // El corazón del diseño: los dos scopes NO se cruzan. Si un enlace oficial pudiera hacerse pasar
  // por borrador, filtraría material sin pre-aprobar; si el borrador pudiera hacerse pasar por
  // oficial, un externo podría APROBAR una pieza que aún se está editando.
  it("un enlace oficial no vale como borrador", () => {
    expect(verifyDraftToken(signReviewToken(ID))).toBeNull();
  });

  it("un enlace de borrador no vale como oficial", () => {
    expect(verifyReviewToken(signDraftToken(ID))).toBeNull();
  });

  it("resolveReviewToken distingue el modo de cada enlace", () => {
    expect(resolveReviewToken(signReviewToken(ID))).toEqual({ deliverableId: ID, mode: "final" });
    expect(resolveReviewToken(signDraftToken(ID))).toEqual({ deliverableId: ID, mode: "draft" });
  });

  it("un token manipulado o inventado no resuelve", () => {
    const bueno = signDraftToken(ID);
    const [idB64, exp] = bueno.split(".");
    expect(resolveReviewToken(`${idB64}.${exp}.firmafalsa`)).toBeNull();
    expect(resolveReviewToken("")).toBeNull();
    expect(resolveReviewToken("cualquier-cosa")).toBeNull();
  });
});
