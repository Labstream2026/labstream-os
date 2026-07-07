import { signScopedToken, verifyScopedToken } from "@/lib/signed-token";

// Token del enlace público de SUBIDA de un proyecto (portal /subir/[token]). El id firmado es
// "projectId::nonce": el nonce (Project.uploadNonce) ata el token al enlace VIGENTE. Revocar rota
// el nonce → una URL filtrada deja de validar aunque su firma siga vigente. La validez real
// (revocación/caducidad) se comprueba al resolver. Prefijo propio "upload".
export function signUploadToken(projectId: string, nonce: string): string {
  return signScopedToken("upload", `${projectId}::${nonce}`, 3650);
}

export function parseUploadToken(token: string): { projectId: string; nonce: string } | null {
  const raw = verifyScopedToken("upload", token);
  if (!raw) return null;
  const i = raw.indexOf("::");
  if (i < 0) return null;
  const projectId = raw.slice(0, i);
  const nonce = raw.slice(i + 2);
  if (!projectId || !nonce) return null;
  return { projectId, nonce };
}
