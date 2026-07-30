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

// De qué CLIENTE es una carpeta, cuando lo es. En el disco de entregas las carpetas de la
// raíz SON los clientes, y verlas como carpetas anónimas obliga a reconocerlas por el nombre
// —que casi nunca coincide con cómo se llama el cliente en la app.
export type DuenoCarpeta = { id: string; nombre: string; color: string | null };

export type NivelResultado =
  | {
      ok: true;
      rel: string;
      carpetas: NivelEntrada[];
      archivos: NivelEntrada[];
      truncado: boolean;
      duenos: Record<string, DuenoCarpeta>;
    }
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
    // Solo el disco de entregas tiene carpetas de cliente; en Operaciones la raíz es material
    // de trabajo del estudio y preguntarle a la base por cada carpeta no devolvería nada.
    const duenos: Record<string, DuenoCarpeta> = {};
    if (disk.mountKey === "GALERIA" && nivel.carpetas.length > 0) {
      const clientes = await db.client
        .findMany({
          where: { galeriaFolder: { in: nivel.carpetas.map((c) => c.rel) } },
          select: { id: true, name: true, accentColor: true, galeriaFolder: true },
        })
        .catch(() => []);
      for (const c of clientes) {
        if (c.galeriaFolder) duenos[c.galeriaFolder] = { id: c.id, nombre: c.name, color: c.accentColor };
      }
    }
    return { ok: true, rel: rel || "", carpetas: nivel.carpetas, archivos: nivel.archivos, truncado: nivel.truncado, duenos };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer la carpeta." };
  }
}
