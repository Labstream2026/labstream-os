import { signScopedToken, verifyScopedToken } from "@/lib/signed-token";

// Token público (con caducidad) para la vista de una propuesta en /p/[token].
// Caduca a los 45 días; volver a abrir la propuesta en la app regenera el enlace.
export function signProposalToken(proposalId: string): string {
  return signScopedToken("proposal", proposalId, 45);
}

export function verifyProposalToken(token: string): string | null {
  return verifyScopedToken("proposal", token);
}
