import crypto from "node:crypto";
import { appSecret } from "@/lib/app-secret";

// Cifrado simétrico para secretos guardados en BD (ej. columnas tipo "Contraseña" de las
// tablas, tokens de integraciones, credenciales CalDAV…). AES-256-GCM. La derivación (sha256)
// NO se cambia para no invalidar los secretos ya cifrados. Las claves se calculan de forma
// perezosa (no al importar el módulo) para que el `next build` no las evalúe en compilación.

// Clave derivada del secreto de SESIÓN (NEXTAUTH_SECRET/AUTH_SECRET). Se conserva para poder
// DESCIFRAR los secretos cifrados antes de separar la clave de datos.
let _sessionKey: Buffer | null = null;
function sessionKey(): Buffer {
  if (!_sessionKey) _sessionKey = crypto.createHash("sha256").update(appSecret()).digest(); // 32 bytes
  return _sessionKey;
}

// Clave de cifrado de DATOS dedicada (OPCIONAL). Si DATA_ENCRYPTION_KEY está definida (≥16
// chars), se usa para CIFRAR y como primera opción al DESCIFRAR, separando el cifrado de datos
// del secreto de sesión (así rotar NEXTAUTH_SECRET no rompe los secretos). Si no está, todo
// funciona EXACTAMENTE igual que antes (compatibilidad total, sin migración obligatoria).
let _dataKey: Buffer | null | undefined;
function dataKey(): Buffer | null {
  if (_dataKey === undefined) {
    const k = process.env.DATA_ENCRYPTION_KEY;
    _dataKey = k && k.length >= 16 ? crypto.createHash("sha256").update(k).digest() : null;
  }
  return _dataKey;
}

// Claves candidatas para DESCIFRAR, en orden: primero la de datos (si existe), luego la de
// sesión. Los secretos viejos (cifrados con la de sesión) se siguen leyendo; al re-guardarlos
// migran solos a la clave de datos.
function decryptKeys(): Buffer[] {
  const dk = dataKey();
  return dk ? [dk, sessionKey()] : [sessionKey()];
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dataKey() ?? sessionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  if (typeof payload !== "string" || !payload.startsWith("v1:")) return payload ?? ""; // compat valores antiguos en claro
  const [, ivB, tagB, dataB] = payload.split(":");
  let lastErr: unknown = null;
  for (const k of decryptKeys()) {
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(ivB, "base64"));
      decipher.setAuthTag(Buffer.from(tagB, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
    } catch (err) {
      lastErr = err; // probar la siguiente clave (p. ej. secreto cifrado con la clave antigua)
    }
  }
  // No silenciar: si NINGUNA clave funciona, normalmente NEXTAUTH_SECRET/AUTH_SECRET (o
  // DATA_ENCRYPTION_KEY) cambió y dejó ilegibles los secretos (p.ej. token de OpenClaw → 401).
  console.error("[crypto] decryptSecret falló con todas las claves (¿cambió NEXTAUTH_SECRET/AUTH_SECRET o DATA_ENCRYPTION_KEY?)", lastErr instanceof Error ? lastErr.message : lastErr);
  return "";
}

export function isEncrypted(payload: unknown): boolean {
  return typeof payload === "string" && payload.startsWith("v1:");
}
