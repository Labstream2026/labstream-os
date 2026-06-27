import crypto from "node:crypto";
import { appSecret } from "@/lib/app-secret";

// Cifrado simétrico para secretos guardados en BD (ej. columnas tipo "Contraseña"
// de las tablas). AES-256-GCM con clave derivada del secreto del servidor.
// La derivación (sha256) NO se cambia para no invalidar los secretos ya cifrados.
// La clave se calcula de forma perezosa (no al importar el módulo) para que el
// `next build` no evalúe appSecret() en tiempo de compilación.
let _key: Buffer | null = null;
function key(): Buffer {
  if (!_key) _key = crypto.createHash("sha256").update(appSecret()).digest(); // 32 bytes
  return _key;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  if (typeof payload !== "string" || !payload.startsWith("v1:")) return payload ?? ""; // compat valores antiguos en claro
  try {
    const [, ivB, tagB, dataB] = payload.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
  } catch (err) {
    // No silenciar: un fallo de descifrado normalmente significa que NEXTAUTH_SECRET/AUTH_SECRET
    // cambió y dejó ilegibles los secretos cifrados (p.ej. el token de OpenClaw → 401 en el chat).
    console.error("[crypto] decryptSecret falló (¿cambió NEXTAUTH_SECRET/AUTH_SECRET?)", err instanceof Error ? err.message : err);
    return "";
  }
}

export function isEncrypted(payload: unknown): boolean {
  return typeof payload === "string" && payload.startsWith("v1:");
}
