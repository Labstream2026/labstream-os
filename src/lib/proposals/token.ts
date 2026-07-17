import crypto from "node:crypto";
import { signScopedToken, verifyScopedToken } from "@/lib/signed-token";

// Token público (con caducidad) para la vista de una propuesta en /p/[token].
// Caduca a los 45 días; volver a abrir la propuesta en la app regenera el enlace.
export function signProposalToken(proposalId: string): string {
  return signScopedToken("proposal", proposalId, 45);
}

export function verifyProposalToken(token: string): string | null {
  return verifyScopedToken("proposal", token);
}

// Versión corta ligada a la contraseña VIGENTE. Se incrusta en el token de desbloqueo para que, si
// la clave cambia (o se quita y se repone otra), la versión cambie y las cookies emitidas con la
// clave anterior dejen de valer — es decir, cambiar la contraseña REVOCA los accesos previos.
function passVersion(passwordHash: string): string {
  return crypto.createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16);
}

// Token de "propuesta DESBLOQUEADA": se guarda en una cookie httpOnly tras acertar la contraseña de
// la reja, para no volver a pedirla en cada visita. Scope propio (distinto del token de acceso), 30
// días de validez y ligado a la contraseña vigente. `passwordHash` es el hash bcrypt actual.
export function signProposalUnlock(proposalId: string, passwordHash: string): string {
  return signScopedToken("proposal-unlock", `${proposalId}.${passVersion(passwordHash)}`, 30);
}

// Devuelve el proposalId SOLO si el token es válido, no caducó Y su versión coincide con la
// contraseña vigente; null en cualquier otro caso (incluido: la clave cambió desde que se emitió).
export function verifyProposalUnlock(token: string, passwordHash: string): string | null {
  const decoded = verifyScopedToken("proposal-unlock", token);
  if (!decoded) return null;
  const dot = decoded.lastIndexOf(".");
  if (dot < 0) return null;
  const pid = decoded.slice(0, dot);
  const ver = decoded.slice(dot + 1);
  if (!pid || ver !== passVersion(passwordHash)) return null;
  return pid;
}
