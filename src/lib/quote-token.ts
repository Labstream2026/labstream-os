import { signScopedToken, verifyScopedToken } from "@/lib/signed-token";

// Token público (con caducidad) para la vista de una cotización. Caduca a los 30 días;
// volver a abrir la cotización en la app regenera el enlace.
export function signQuoteToken(quoteId: string): string {
  return signScopedToken("quote", quoteId, 30);
}

export function verifyQuoteToken(token: string): string | null {
  return verifyScopedToken("quote", token);
}
