"use server";

import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { isMountKey, type NivelEntrada } from "@/lib/disco-raiz";
import { listarNivelMontaje, mountReady } from "@/lib/disco-raiz-server";

// ── Navegar por dentro de un disco MONTADO, desde su ficha ─────────────────────
// Solo lectura: la ficha del disco enseña qué hay, y para trabajar (subir, mover, borrar)
// manda a Operaciones o a la Galería, que ya tienen sus propias guardas de escritura. Así
// esta pantalla nueva no abre ninguna superficie de escritura más.
//
// El `rel` viene del navegador: lo valida el listador del montaje (normalize + realpath
// contra la raíz), que es el mismo camino por el que pasan Operaciones y la Galería.

export type NivelResultado =
  | { ok: true; rel: string; carpetas: NivelEntrada[]; archivos: NivelEntrada[]; truncado: boolean }
  | { error: string };

export async function nivelDelDisco(diskId: string, rel: string): Promise<NivelResultado> {
  const session = await getSession();
  // Misma llave que la Biblioteca entera; el cliente (rol `cliente`) nunca la tiene.
  if (!hasPermission(session, "ver_biblioteca")) return { error: "Sin permiso" };

  // El montaje se toma del DISCO en la base, nunca del navegador: así una petición no puede
  // pedir «lístame Operaciones_LAB» pasando otra clave por parámetro.
  const disk = await db.storageDisk.findUnique({ where: { id: diskId }, select: { mountKey: true } });
  if (!disk?.mountKey || !isMountKey(disk.mountKey)) return { error: "Este disco no está montado en la app." };
  if (!(await mountReady(disk.mountKey))) return { error: "El montaje no responde ahora mismo (¿NAS apagado?)." };

  try {
    const nivel = await listarNivelMontaje(disk.mountKey, rel || "");
    return { ok: true, rel: rel || "", carpetas: nivel.carpetas, archivos: nivel.archivos, truncado: nivel.truncado };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer la carpeta." };
  }
}
