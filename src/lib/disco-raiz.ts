// ── La RAÍZ de un disco (parte PURA) ───────────────────────────────────────────
// Un disco del estudio es una de dos cosas, y la app no puede fingir que son la misma:
//
//  · MONTADO (mountKey): la app lo tiene bind-montado dentro del contenedor, así que puede
//    listar sus carpetas y leer su ocupación con statfs. Entrar al disco abre su contenido.
//  · DE CAJÓN (mountKey null): un HDD en un cajón, una cinta LTO en la bóveda, una carpeta de
//    Drive. NADIE puede leerlos desde el navegador. Su «contenido» es el catálogo: lo que el
//    equipo registró en el mapa del material, con rutas escritas a mano.
//
// Este archivo NO importa nada del sistema de archivos a propósito: lo usan también pantallas
// de CLIENTE (la lista de discos), y `nas-galeria` arrastra `sharp`, que no existe en el
// navegador. Lo que toca disco vive en `disco-raiz-server.ts`.

export const MOUNT_KEYS = ["OPS", "GALERIA"] as const;
export type MountKey = (typeof MOUNT_KEYS)[number];

export function isMountKey(v: unknown): v is MountKey {
  return typeof v === "string" && (MOUNT_KEYS as readonly string[]).includes(v);
}

export const MOUNT_LABEL: Record<MountKey, string> = {
  OPS: "Operaciones_LAB",
  GALERIA: "Entregas_LAB",
};

export const MOUNT_DESC: Record<MountKey, string> = {
  OPS: "La carpeta compartida de trabajo del equipo (la que se ve en Operaciones).",
  GALERIA: "El disco de LabTem con el material entregable (el que se ve en la Galería).",
};

// A qué sección de la app lleva «ver este disco por dentro» en su propia pantalla (el
// explorador completo, con subir y mover). La ficha del disco enseña lo suyo en solo lectura.
export function mountHref(key: MountKey, rel?: string): string {
  if (key === "OPS") return rel ? `/operaciones?path=${encodeURIComponent(rel)}` : "/operaciones";
  return rel ? `/galeria?rel=${encodeURIComponent(rel)}` : "/galeria";
}

// Un nivel del montaje, con la MISMA forma venga de Operaciones o de la Galería (el tipo vive
// aquí para que los componentes de cliente puedan nombrarlo sin arrastrar el listador).
export type NivelEntrada = { rel: string; name: string; size: number | null; mtimeMs: number };
export type NivelDisco = { carpetas: NivelEntrada[]; archivos: NivelEntrada[]; truncado: boolean };
