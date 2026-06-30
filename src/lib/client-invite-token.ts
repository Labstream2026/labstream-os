import { signScopedToken, verifyScopedToken } from "@/lib/signed-token";

// Token firmado para INVITAR a un usuario cliente a fijar su contraseña (portal del cliente).
// Caduca a los 7 días. Referencia el userId. Es de un solo uso EFECTIVO: la acción de alta solo
// procede mientras el usuario aún no tiene contraseña; tras fijarla, el enlace deja de servir
// (evita robo de cuenta si el enlace se filtra después). Reutiliza la librería de tokens existente.
export function signClientInviteToken(userId: string): string {
  return signScopedToken("client-invite", userId, 7);
}

export function verifyClientInviteToken(token: string): string | null {
  return verifyScopedToken("client-invite", token);
}
