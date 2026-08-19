// ── Clasificar el fallo de una server action, EN EL CLIENTE ─────────────────
// Tras cada deploy, las pestañas que quedaron abiertas apuntan a acciones del build
// anterior y el siguiente clic falla con «Failed to find Server Action». No es un bug del
// clic: es la app diciéndole a una pestaña vieja que recargue. Aquí se reconoce ese caso
// (para avisar «recarga» en vez de un error críptico) y se dispara el banner global.

export function esAccionDeOtraVersion(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? "");
  return /Failed to find Server Action|older or newer deployment/i.test(m);
}

/** Enciende el banner global «la app se actualizó — recarga» (AvisoVersion lo escucha). */
export function avisarAppVieja(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("ls:app-vieja"));
}

/** Mensaje humano para el fallo de una acción (y de paso enciende el banner si aplica). */
export function mensajeDeAccionFallida(e: unknown, generico: string): string {
  if (esAccionDeOtraVersion(e)) {
    avisarAppVieja();
    return "La app se actualizó mientras esta pestaña estaba abierta: recárgala (F5) y vuelve a intentarlo.";
  }
  return generico;
}
