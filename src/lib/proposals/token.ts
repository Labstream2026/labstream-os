import crypto from "node:crypto";
import { appSecret } from "@/lib/app-secret";

// Token HMAC para la vista PÚBLICA de una propuesta (sin sesión). Embebe el
// proposalId firmado; enlace estable que se comparte con el cliente.
export function signProposalToken(proposalId: string): string {
  const sig = crypto.createHmac("sha256", appSecret()).update(`proposal:${proposalId}`).digest("base64url");
  const id = Buffer.from(proposalId).toString("base64url");
  return `${id}.${sig}`;
}

export function verifyProposalToken(token: string): string | null {
  const [idB64, sig] = (token || "").split(".");
  if (!idB64 || !sig) return null;
  let proposalId: string;
  try {
    proposalId = Buffer.from(idB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = crypto.createHmac("sha256", appSecret()).update(`proposal:${proposalId}`).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return proposalId;
}
