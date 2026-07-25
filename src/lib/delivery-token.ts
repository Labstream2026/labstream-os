import { signScopedToken, verifyScopedToken } from "@/lib/signed-token";

// Token del enlace público de ENTREGA de un proyecto (sala /entrega/[token]): el material final
// descargable. Mismo patrón que el de subida: el id firmado es "projectId::nonce" — el nonce
// (Project.deliveryNonce) ata el token al enlace VIGENTE y revocar lo ROTA, así una URL filtrada
// muere aunque su firma siga válida. La caducidad REAL es Project.deliveryExpiresAt (editable
// sin reemitir el enlace); el token se firma a vida larga. Prefijo propio "delivery".
export function signDeliveryToken(projectId: string, nonce: string): string {
  return signScopedToken("delivery", `${projectId}::${nonce}`, 3650);
}

export function parseDeliveryToken(token: string): { projectId: string; nonce: string } | null {
  const raw = verifyScopedToken("delivery", token);
  if (!raw) return null;
  const i = raw.indexOf("::");
  if (i < 0) return null;
  const projectId = raw.slice(0, i);
  const nonce = raw.slice(i + 2);
  if (!projectId || !nonce) return null;
  return { projectId, nonce };
}
