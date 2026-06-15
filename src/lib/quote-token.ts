import crypto from "node:crypto";
import { appSecret } from "@/lib/app-secret";

// Token HMAC para la vista PÚBLICA de una cotización (sin sesión). Embebe el
// quoteId firmado; enlace estable que se comparte con el cliente para aprobar.
function secret() {
  return appSecret();
}

export function signQuoteToken(quoteId: string): string {
  const sig = crypto.createHmac("sha256", secret()).update(`quote:${quoteId}`).digest("base64url");
  const id = Buffer.from(quoteId).toString("base64url");
  return `${id}.${sig}`;
}

export function verifyQuoteToken(token: string): string | null {
  const [idB64, sig] = (token || "").split(".");
  if (!idB64 || !sig) return null;
  let quoteId: string;
  try {
    quoteId = Buffer.from(idB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = crypto.createHmac("sha256", secret()).update(`quote:${quoteId}`).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return quoteId;
}
