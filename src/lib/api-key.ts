import { randomBytes, createHash } from "node:crypto";

// Generación y hashing de credenciales de la API intermedia (modelo AppKey).
//
// El secreto se entrega en CLARO UNA sola vez al admin (estilo GitHub/Stripe) y nunca más se
// puede recuperar: en BD solo vive su hash SHA-256. Esto es estrictamente más seguro que cifrado
// reversible (encryptSecret), porque una key solo necesita verificarse, jamás recuperarse —
// una fuga de la BD no entrega credenciales utilizables.

export const API_KEY_PREFIX = "lsk_"; // "labstream key"
// Longitud del prefijo visible (identifica la key en UI/logs sin revelar el secreto).
export const PREFIX_VISIBLE_LEN = 12;

export type GeneratedApiKey = {
  raw: string; // secreto completo — se muestra una vez y NO se persiste
  prefixVisible: string; // primeros chars, sí se persisten y se muestran
  secretHash: string; // sha256(raw) en hex — esto es lo que se guarda
};

// SHA-256 en hex del secreto completo. Determinista: el mismo secreto siempre da el mismo hash,
// lo que permite buscar/verificar sin guardar el secreto.
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

// Crea una credencial nueva: 24 bytes aleatorios en base64url con el prefijo "lsk_".
export function generateApiKey(): GeneratedApiKey {
  const raw = API_KEY_PREFIX + randomBytes(24).toString("base64url");
  return {
    raw,
    prefixVisible: raw.slice(0, PREFIX_VISIBLE_LEN),
    secretHash: hashApiKey(raw),
  };
}
