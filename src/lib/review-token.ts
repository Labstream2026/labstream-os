import { signScopedToken, verifyScopedToken } from "@/lib/signed-token";

// Token público (con caducidad) para el portal de revisión del cliente. Caduca a los
// 60 días; además el equipo puede revocarlo en cualquier momento (reviewRevokedAt).
export function signReviewToken(deliverableId: string): string {
  return signScopedToken("review", deliverableId, 60);
}

export function verifyReviewToken(token: string): string | null {
  return verifyScopedToken("review", token);
}
