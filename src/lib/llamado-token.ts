import { signScopedToken, verifyScopedToken } from "@/lib/signed-token";

// Enlace público de una hoja de llamado (freelancers y externos sin cuenta). Caduca a los
// 30 días — un rodaje no se planea con más antelación y el enlace muere solo después.
// La revocación fina vive en CallSheet.publicRevokedAt (la página pública la respeta).
export function signLlamadoToken(sheetId: string): string {
  return signScopedToken("llamado", sheetId, 30);
}

export function verifyLlamadoToken(token: string): string | null {
  return verifyScopedToken("llamado", token);
}
