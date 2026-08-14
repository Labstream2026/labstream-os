import crypto from "node:crypto";

// ── Cabeceras de caché de las imágenes derivadas (miniaturas y previsualizaciones) ──
// Vive aparte de la ruta para poder probarlo: la ruta arrastra base de datos y sesión, y lo
// que de verdad importa aquí —que el ETag sea de CONTENIDO y que la miniatura y la
// previsualización se traten distinto— es una decisión pura que conviene dejar clavada.
//
// El ETag es un hash de los BYTES, no la fecha del archivo, y es a propósito: el `path` de un
// FileAsset se reescribe al mover el archivo a su carpeta final después de subirlo, así que
// una marca de tiempo podría cambiar sin que cambie la imagen (revalidación inútil) o al
// revés. Con el hash, dos imágenes iguales dan el mismo ETag siempre.

/** Un día sin preguntar; una semana más sirviendo la vieja mientras refresca por detrás. */
export const CACHE_MINIATURA = "private, max-age=86400, stale-while-revalidate=604800";
/** Se guarda pero SIEMPRE se pregunta: nunca enseña algo viejo, y la respuesta repetida es
 *  un 304 vacío en vez de la imagen entera. */
export const CACHE_PREVISUALIZACION = "private, no-cache";

export function etagDe(bytes: Buffer | Uint8Array): string {
  return `"${crypto.createHash("sha1").update(bytes).digest("base64url")}"`;
}

export function cabecerasWebp(bytes: Buffer | Uint8Array, nombre: string, esMiniatura: boolean): Record<string, string> {
  return {
    "Content-Type": "image/webp",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": esMiniatura ? CACHE_MINIATURA : CACHE_PREVISUALIZACION,
    ETag: etagDe(bytes),
  };
}

/** ¿El navegador ya tiene exactamente esta imagen? Entonces no viaja ni un byte de imagen. */
export function yaLaTiene(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  // Un intermediario puede devolver varios ETags separados por coma, y marcarlos como débiles.
  return ifNoneMatch
    .split(",")
    .map((s) => s.trim().replace(/^W\//, ""))
    .includes(etag);
}
