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

export function clearOpenClawCache() {
  _cache = undefined;
}

// Devuelve la config SOLO si la integración está activada y tiene baseUrl; si no, null.
export async function getOpenClawConfig(): Promise<OpenClawConfig | null> {
  if (_cache !== undefined) return _cache;
  const row = await db.openClawSettings.findUnique({ where: { id: "default" } }).catch(() => null);
  if (!row || !row.enabled || !row.baseUrl) {
    _cache = null;
    return null;
  }
  _cache = {
    baseUrl: row.baseUrl.replace(/\/+$/, ""),
    token: row.tokenEnc ? decryptSecret(row.tokenEnc) : "",
    agentModel: row.agentModel || "openclaw",
  };
  return _cache;
}
