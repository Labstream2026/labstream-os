import crypto from "node:crypto";
import { appSecret } from "@/lib/app-secret";

// Token público firmado (HMAC) CON CADUCIDAD, para enlaces sin sesión (cotizaciones,
// propuestas, revisión de entregables). Formato: base64url(id).exp.firma, donde la
// firma cubre `${prefix}:${id}:${exp}`. El enlace deja de servir tras `exp`.
// La caducidad se fija al generar el enlace; basta volver a abrir/compartir para renovarlo.

export function signScopedToken(prefix: string, id: string, days = 30, opts?: { quantized?: boolean }): string {
  // `quantized`: el exp se redondea a la ventana de `days` (+2 ventanas → vive entre days y
  // 2·days) para que el token sea DETERMINISTA dentro de cada ventana — el mismo string en
  // todos los renders. Lo usa el media de revisión (rmedia): con un exp fresco por render, el
  // `?t=` del <video> cambiaba con cada acción del servidor y el reproductor se reiniciaba.
  // Los demás tokens (cotización, propuesta, invitación…) conservan la vigencia exacta.
  const ttl = Math.max(1, Math.round(days * 86400));
  const exp = opts?.quantized
    ? (Math.floor(Date.now() / 1000 / ttl) + 2) * ttl
    : Math.floor(Date.now() / 1000) + ttl;
  const sig = crypto.createHmac("sha256", appSecret()).update(`${prefix}:${id}:${exp}`).digest("base64url");
  return `${Buffer.from(id).toString("base64url")}.${exp}.${sig}`;
}

export function verifyScopedToken(prefix: string, token: string): string | null {
  const [idB64, expStr, sig] = (token || "").split(".");
  if (!idB64 || !expStr || !sig) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return null; // caducado o inválido
  let id: string;
  try {
    id = Buffer.from(idB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = crypto.createHmac("sha256", appSecret()).update(`${prefix}:${id}:${exp}`).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return id;
}
