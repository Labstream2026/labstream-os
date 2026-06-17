import { signScopedToken, verifyScopedToken } from "@/lib/signed-token";

// Token público (con caducidad) para el portal de revisión del cliente. Caduca a los
// 60 días; además el equipo puede revocarlo en cualquier momento (reviewRevokedAt).
export function signReviewToken(deliverableId: string): string {
  return signScopedToken("review", deliverableId, 60);
}

export function verifyReviewToken(token: string): string | null {
  return verifyScopedToken("review", token);
}

// Token (con caducidad) para servir el video de una VERSIÓN proxiado desde Google Drive
// por el mismo origen, de modo que el player pueda capturar el fotograma (CORS). Sirve
// tanto en la bandeja interna como en el portal del cliente (sin sesión).
export function signReviewMediaToken(versionId: string): string {
  return signScopedToken("rmedia", versionId, 60);
}

export function verifyReviewMediaToken(token: string): string | null {
  return verifyScopedToken("rmedia", token);
}
