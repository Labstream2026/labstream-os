// Rate-limit en memoria (ventana deslizante) compartido. Espejo del limitador inline de
// src/app/api/ai/route.ts. Mantiene un Map<clave, timestamps[]> a nivel de módulo.
//
// IMPORTANTE: es POR PROCESO — se reinicia en cada redeploy y NO se comparte entre varias
// instancias. Suficiente para una sola instancia; si se escala horizontalmente, mover a
// Redis (o similar) para un contador compartido.
const hits = new Map<string, number[]>();

/**
 * Devuelve `true` si la petición está PERMITIDA, `false` si supera el límite.
 * @param key     identificador de quien hace la petición (token, IP, userId…).
 * @param max     número máximo de peticiones permitidas dentro de la ventana.
 * @param windowMs tamaño de la ventana en milisegundos.
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false; // sobre el límite
  }
  recent.push(now);
  hits.set(key, recent);
  return true; // permitido
}
