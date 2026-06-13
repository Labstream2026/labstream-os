import crypto from "node:crypto";

// Token HMAC para el portal público de revisión de cliente (sin sesión).
// Embebe el deliverableId firmado; enlace estable que se puede compartir.
function secret() {
  return process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "dev-secret-cambiar";
}

export function signReviewToken(deliverableId: string): string {
  const sig = crypto.createHmac("sha256", secret()).update(`review:${deliverableId}`).digest("base64url");
  const id = Buffer.from(deliverableId).toString("base64url");
  return `${id}.${sig}`;
}

export function verifyReviewToken(token: string): string | null {
  const [idB64, sig] = (token || "").split(".");
  if (!idB64 || !sig) return null;
  let deliverableId: string;
  try {
    deliverableId = Buffer.from(idB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = crypto.createHmac("sha256", secret()).update(`review:${deliverableId}`).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return deliverableId;
}
