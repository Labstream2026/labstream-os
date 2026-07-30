import "server-only";

import { OPS_DIR, opsReady, opsDiskUsage, listOps, opsHasThumb } from "@/lib/nas-ops";
import { GALERIA_DIR, galeriaReady, galeriaDiskUsage, listGaleriaNivel } from "@/lib/nas-galeria";
import type { MountKey, NivelDisco, NivelEntrada } from "@/lib/disco-raiz";

// ── La raíz de un disco: la parte que TOCA EL DISCO ────────────────────────────
// Separado de `disco-raiz.ts` porque aquello lo importan pantallas de cliente y esto arrastra
// el sistema de archivos (y `sharp` por la cadena de la galería), que no existe en el
// navegador. `server-only` hace que ese error se vea al compilar y no en producción.
//
// Traduce mountKey → montaje real, para que la Biblioteca no tenga que saber de bind mounts
// ni de variables de entorno.

// Dónde vive cada montaje según el .env del NAS. "" = no configurado en este despliegue.
export function mountDir(key: MountKey): string {
  return key === "OPS" ? OPS_DIR : GALERIA_DIR;
}

// ¿Está montado Y accesible AHORA? La variable puede existir con el NAS apagado.
export async function mountReady(key: MountKey): Promise<boolean> {
  return key === "OPS" ? opsReady() : galeriaReady();
}

// Ocupación en vivo (statfs) del volumen del montaje. null = sin montaje o sin permiso.
export async function mountUsage(key: MountKey): Promise<{ usedGB: number; totalGB: number } | null> {
  return key === "OPS" ? opsDiskUsage() : galeriaDiskUsage();
}

// Un nivel del montaje, normalizado: Operaciones y la Galería tienen cada una su listador
// (distinto historial, distintas reglas de qué es basura) y la ficha del disco no debería
// enterarse — con una sola forma se navega cualquier disco montado con el mismo explorador.
export async function listarNivelMontaje(key: MountKey, rel: string): Promise<NivelDisco> {
  if (key === "OPS") {
    const r = await listOps(rel);
    // Quién tiene fotograma lo decide `listOps`, que ya miró el disco: las imágenes siempre, y
    // los vídeos que la app pueda abrir con ffmpeg (los formatos de cámara propietarios, no).
    // Antes se recalculaba aquí a mano y solo para imágenes, así que un vídeo de este disco se
    // quedaba con su icono aunque su fotograma existiera.
    const map = (
      e: { rel: string; name: string; size: number | null; mtimeMs: number; miniatura?: boolean },
      dir: boolean,
    ): NivelEntrada => ({
      rel: e.rel,
      name: e.name,
      size: e.size,
      mtimeMs: e.mtimeMs,
      miniatura: !dir && (e.miniatura ?? opsHasThumb(e.name)),
    });
    return {
      carpetas: r.dirs.map((d) => map(d, true)),
      archivos: r.files.map((f) => map(f, false)),
      truncado: r.truncated,
    };
  }
  // La galería lista con `docs: true` para que los papeles (guiones, PDFs) también se vean:
  // en la ficha del disco se está mirando el disco entero, no la línea de tiempo del cliente.
  const r = await listGaleriaNivel(rel, { docs: true });
  return {
    // Una carpeta no tiene fotograma propio: `miniatura: false` es el hecho, no una carencia.
    carpetas: r.carpetas.map((c) => ({ rel: c.rel, name: c.name, size: null, mtimeMs: c.mtimeMs, miniatura: false })),
    archivos: r.archivos.map((a) => ({ rel: a.rel, name: a.name, size: a.size, mtimeMs: a.mtimeMs, miniatura: a.miniatura })),
    truncado: false,
  };
}
