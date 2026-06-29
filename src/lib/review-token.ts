import { signScopedToken, verifyScopedToken } from "@/lib/signed-token";

// Token público para el portal de revisión del cliente. La caducidad REAL la controla el
// entregable (`reviewExpiresAt`, opcional → puede NO caducar); el token se firma con vida
// larga para no expirar por su cuenta. El equipo puede revocarlo cuando quiera
// (reviewRevokedAt). La validación de caducidad se hace al resolver el enlace.
export function signReviewToken(deliverableId: string): string {
  return signScopedToken("review", deliverableId, 3650);
}

export function verifyReviewToken(token: string): string | null {
  return verifyScopedToken("review", token);
}

// Token (con caducidad) para servir el video de una VERSIÓN proxiado desde Google Drive
// por el mismo origen, de modo que el player pueda capturar el fotograma (CORS). Sirve
// tanto en la bandeja interna como en el portal del cliente (sin sesión).
export function signReviewMediaToken(versionId: string): string {
  // TTL corto: la página se re-renderiza (force-dynamic) y re-firma el token en cada carga,
  // así que no hace falta vida larga; acota la ventana si el enlace se filtra.
  return signScopedToken("rmedia", versionId, 1);
}

export function verifyReviewMediaToken(token: string): string | null {
  return verifyScopedToken("rmedia", token);
}
