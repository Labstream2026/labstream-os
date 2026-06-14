import crypto from "node:crypto";

// Cifrado simétrico para secretos guardados en BD (ej. columnas tipo "Contraseña"
// de las tablas). AES-256-GCM con clave derivada del secreto del servidor.
const keyMaterial = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "dev-secret-cambiar";
const KEY = crypto.createHash("sha256").update(keyMaterial).digest(); // 32 bytes

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  if (typeof payload !== "string" || !payload.startsWith("v1:")) return payload ?? ""; // compat valores antiguos en claro
  try {
    const [, ivB, tagB, dataB] = payload.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function isEncrypted(payload: unknown): boolean {
  return typeof payload === "string" && payload.startsWith("v1:");
}
