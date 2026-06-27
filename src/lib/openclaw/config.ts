import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

// Configuración resuelta de la integración con OpenClaw (gateway compatible con OpenAI).
export type OpenClawConfig = {
  baseUrl: string; // sin barra final
  token: string; // descifrado (puede ser "")
  agentModel: string; // valor "model" que enruta al agente
};

// Caché en proceso (se limpia al guardar desde Configuración). Igual que el correo, evita
// leer la BD en cada mensaje del chat. `undefined` = no leído todavía; `null` = leído pero
// sin configurar/desactivado.
let _cache: OpenClawConfig | null | undefined;
let _cacheAt = 0;
const CACHE_TTL_MS = 60_000; // revalida cada 60s: si el gateway cambia de IP/puerto en BD, se toma sin reiniciar

export function clearOpenClawCache() {
  _cache = undefined;
  _cacheAt = 0;
}

// Devuelve la config SOLO si la integración está activada y tiene baseUrl; si no, null.
export async function getOpenClawConfig(): Promise<OpenClawConfig | null> {
  if (_cache !== undefined && Date.now() - _cacheAt < CACHE_TTL_MS) return _cache;
  const row = await db.openClawSettings.findUnique({ where: { id: "default" } }).catch(() => null);
  if (!row || !row.enabled || !row.baseUrl) {
    _cache = null;
    _cacheAt = Date.now();
    return null;
  }
  _cache = {
    baseUrl: row.baseUrl.replace(/\/+$/, ""),
    token: row.tokenEnc ? decryptSecret(row.tokenEnc) : "",
    agentModel: row.agentModel || "openclaw",
  };
  _cacheAt = Date.now();
  return _cache;
}
