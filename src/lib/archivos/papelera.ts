import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { absPath } from "@/lib/storage";
import { previewRel } from "@/lib/image";

// ── Papelera de archivos ───────────────────────────────────────────────────────
// Borrar un archivo pone `deletedAt` y nada más. Importa porque el borrado de VERDAD arrastra en
// cascada las fotos del entregable, las portadas del banco, el historial de versiones y los
// comentarios del documento: con la fecha puesta no se pierde nada y restaurar devuelve el
// archivo entero, con sus vínculos intactos.
//
// A los 30 días el barredor purga: ahí sí cae la cascada y se borran los bytes.

export const DIAS_PAPELERA = 30;

// Cláusula que hay que meter en TODA consulta que liste archivos. Está aquí y no escrita a mano
// en cada sitio para que se vea de un vistazo quién la usa y quién se la saltó.
export const soloVivos = { deletedAt: null } as const;

export function diasQueQuedan(deletedAt: Date): number {
  const pasados = (Date.now() - deletedAt.getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(DIAS_PAPELERA - pasados));
}

// Borra los BYTES de un archivo local (y su miniatura). Los de Operaciones_LAB (kind OPS) NO se
// tocan: viven en la share del NAS y el archivo de allá es del equipo, no de la app — quitarlo
// del proyecto nunca significó borrarlo del disco.
export async function borrarBytesDeArchivo(kind: string, path: string | null): Promise<void> {
  if (!path || kind !== "LOCAL") return;
  await fs.rm(absPath(path), { force: true }).catch(() => {});
  await fs.rm(absPath(previewRel(path)), { force: true }).catch(() => {});
}

// Purga los archivos que llevan más de DIAS_PAPELERA en la papelera. Devuelve el recuento para
// que el cron lo registre. Va de uno en uno a propósito: si uno falla al borrar sus bytes, los
// demás siguen — y la fila solo se borra si sus bytes se fueron o no había.
export async function purgarPapelera(): Promise<{ purgados: number; fallos: number }> {
  const limite = new Date(Date.now() - DIAS_PAPELERA * 86_400_000);
  const viejos = await db.fileAsset.findMany({
    where: { deletedAt: { lt: limite } },
    select: { id: true, name: true, kind: true, path: true, projectId: true },
    take: 500, // tope por pasada: el cron corre a diario, no hace falta vaciarlo todo de golpe
  });
  let purgados = 0;
  let fallos = 0;
  for (const f of viejos) {
    try {
      await borrarBytesDeArchivo(f.kind, f.path);
      // Aquí sí cae la cascada (fotos, portadas, versiones, comentarios). Es el punto de no
      // retorno, y por eso está detrás de 30 días y de un barredor, no de un clic.
      await db.fileAsset.delete({ where: { id: f.id } });
      purgados++;
    } catch {
      fallos++;
    }
  }
  return { purgados, fallos };
}
