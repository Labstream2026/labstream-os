import { createHash, randomBytes } from "node:crypto";

// Credenciales del RASTREADOR de trabajo (modelo TrackerDevice). Mismo diseño que las llaves
// lsk_ de la API (ver api-key.ts) pero en un ESPACIO APARTE a propósito: un token ltk_ robado
// no abre la API — solo sirve para subir bloques de uso del equipo al que pertenece, y se
// revoca desde Ajustes. El secreto se entrega UNA vez (viaja directo al sensor por evento
// Tauri, sin pasar por manos humanas) y en BD solo vive su sha256.

export const TRACKER_PREFIX = "ltk_"; // "labstream tracker key"

export function hashTrackerToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function generateTrackerToken(): { raw: string; tokenHash: string } {
  const raw = TRACKER_PREFIX + randomBytes(24).toString("base64url");
  return { raw, tokenHash: hashTrackerToken(raw) };
}

// ── Validación del lote que sube el sensor ──
// El payload viene de código nuestro, pero el endpoint es internet: se valida TODO con topes
// duros y lo inválido se descarta sin tumbar el lote entero (el sensor reintenta con lo mismo).
export type BloqueEntrante = {
  s: number; // startedAt en ms unix
  d: number; // segundos del bloque
  a: number; // segundos con actividad de entrada
  app: string;
  t?: string; // título de ventana (opcional)
};

export type BloqueLimpio = {
  startedAt: Date;
  seconds: number;
  activeSecs: number;
  app: string;
  title: string;
};

const MAX_BLOQUES = 720; // ~1 día de bloques minuto a minuto; un lote normal trae <40
const MAX_APP = 80;
const MAX_TITULO = 140;
const MAX_SEG = 3600;
const DIA = 86_400_000;

export function limpiarBloques(entrada: unknown, ahoraMs: number): BloqueLimpio[] {
  if (!Array.isArray(entrada)) return [];
  const fuera: BloqueLimpio[] = [];
  for (const b of entrada.slice(0, MAX_BLOQUES)) {
    if (!b || typeof b !== "object") continue;
    const { s, d, a, app, t } = b as Partial<BloqueEntrante>;
    if (typeof s !== "number" || !Number.isFinite(s)) continue;
    if (typeof d !== "number" || !Number.isInteger(d) || d < 1 || d > MAX_SEG) continue;
    if (typeof app !== "string" || !app.trim()) continue;
    // Ni del futuro (reloj loco) ni de hace más de 30 días (cola offline con tope real).
    if (s > ahoraMs + 5 * 60_000 || s < ahoraMs - 30 * DIA) continue;
    const activos = typeof a === "number" && Number.isInteger(a) && a >= 0 ? Math.min(a, d) : 0;
    fuera.push({
      startedAt: new Date(s),
      seconds: d,
      activeSecs: activos,
      app: app.trim().slice(0, MAX_APP),
      title: typeof t === "string" ? t.trim().slice(0, MAX_TITULO) : "",
    });
  }
  return fuera;
}
