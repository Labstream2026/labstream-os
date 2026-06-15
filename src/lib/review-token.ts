import crypto from "node:crypto";
import { appSecret } from "@/lib/app-secret";

// Token HMAC para el portal público de revisión de cliente (sin sesión).
// Embebe el deliverableId firmado; enlace estable que se puede compartir.
function secret() {
  return appSecret();
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
