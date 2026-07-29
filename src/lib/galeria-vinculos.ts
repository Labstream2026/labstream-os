import { db } from "@/lib/db";
import {
  normalizeGaleriaRel,
  sanitizeGaleriaName,
  statGaleria,
  ensureGaleriaDir,
  galeriaEnabled,
} from "@/lib/nas-galeria";

// ── Qué carpeta de la galería le corresponde a un proyecto ──
// Regla: la del proyecto si tiene vínculo propio; si no, la subcarpeta
// <carpetaCliente>/<nombreProyecto> bajo la carpeta del CLIENTE. La subcarpeta se PERSISTE en
// Project.galeriaFolder la primera vez que se usa para escribir: si después renombran el
// proyecto, su carpeta no «se muda» en silencio.

export type CarpetaProyecto = { rel: string; existe: boolean };

// Solo LECTURA: devuelve la carpeta efectiva sin crear nada (para pintar el picker o el chip).
// null = ni el proyecto ni su cliente tienen vínculo.
export async function carpetaGaleriaProyecto(projectId: string): Promise<CarpetaProyecto | null> {
  if (!galeriaEnabled()) return null;
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: { name: true, galeriaFolder: true, client: { select: { galeriaFolder: true } } },
  });
  if (!p) return null;
  if (p.galeriaFolder) {
    const st = await statGaleria(p.galeriaFolder).catch(() => null);
    return { rel: p.galeriaFolder, existe: !!st?.dir };
  }
  if (!p.client?.galeriaFolder) return null;
  try {
    const rel = normalizeGaleriaRel(`${p.client.galeriaFolder}/${sanitizeGaleriaName(p.name)}`);
    const st = await statGaleria(rel).catch(() => null);
    return { rel, existe: !!st?.dir };
  } catch {
    return null;
  }
}

// ESCRITURA: garantiza que la carpeta del proyecto existe (creándola bajo la del cliente si
// hace falta) y la persiste en Project.galeriaFolder. Lanza con mensaje legible si no hay
// vínculo ninguno — el que llama decide cómo contarlo.
export async function ensureCarpetaGaleriaProyecto(projectId: string): Promise<string> {
  const actual = await carpetaGaleriaProyecto(projectId);
  if (!actual) throw new Error("Ni el proyecto ni su cliente tienen carpeta vinculada en la galería.");
  const rel = await ensureGaleriaDir(actual.rel);
  await db.project.updateMany({ where: { id: projectId, galeriaFolder: null }, data: { galeriaFolder: rel } });
  return rel;
}

// ¿Una ruta cae DENTRO de la carpeta del proyecto? La guarda que impide que el navegador
// elija material de otro cliente: toda pieza que se ate a un entregable debe pasar por aquí.
export async function relPerteneceAlProyecto(projectId: string, rel: string): Promise<boolean> {
  const carpeta = await carpetaGaleriaProyecto(projectId);
  if (!carpeta) return false;
  let norm: string;
  try {
    norm = normalizeGaleriaRel(rel);
  } catch {
    return false;
  }
  return norm === carpeta.rel || norm.startsWith(carpeta.rel + "/");
}
