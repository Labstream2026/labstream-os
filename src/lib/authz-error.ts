// ── Error de autorización reconocible ──
// En producción, Next.js ENMASCARA el mensaje de los errores lanzados en Server Actions y
// en el render (el cliente solo recibe un texto genérico + `digest`). Para que la pantalla
// de error pueda distinguir "no tienes permiso" de un error real del servidor, marcamos el
// error con un digest FIJO propio: Next.js conserva `digest` si ya viene puesto.
// Úsalo en vez de lanzar Error("No autorizado") a mano — misma semántica, pero el error.tsx
// puede mostrar «Esta acción no está permitida…» en lugar de una pantalla rota.

export const NO_AUTORIZADO_DIGEST = "NO_AUTORIZADO";

export function noAutorizado(detalle?: string): never {
  const e = new Error(detalle ? `No autorizado: ${detalle}` : "No autorizado") as Error & { digest?: string };
  e.digest = NO_AUTORIZADO_DIGEST;
  throw e;
}

// ¿Este error (posiblemente enmascarado por Next) es un fallo de permisos?
export function esNoAutorizado(error: (Error & { digest?: string }) | null | undefined): boolean {
  if (!error) return false;
  return error.digest === NO_AUTORIZADO_DIGEST || /no autorizado/i.test(error.message ?? "");
}
