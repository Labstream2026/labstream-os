import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { absPath, extOf } from "@/lib/storage";

// ── Historial de versiones de un documento ──
// Cada guardado de OnlyOffice SOBRESCRIBE el archivo. Antes de hacerlo se guarda aquí una copia
// de lo que había, para poder mirarlo, descargarlo o volver a él. Sin esto, borrar media página
// y cerrar era definitivo.
//
// Se conservan las últimas MAX_VERSIONES: un documento que se edita a diario durante meses no
// puede llenar el NAS de copias. Las más viejas se borran, fila y archivo.

const MAX_VERSIONES = 30;

// Carpeta donde viven las copias de un archivo (dentro del storage, junto a lo demás).
function carpetaDe(fileId: string): string {
  return path.posix.join("versiones", fileId);
}

// Guarda el contenido ACTUAL del archivo como versión anterior. Devuelve la versión copiada, o
// null si no había nada que copiar. Nunca lanza: un fallo del historial no debe impedir que el
// documento se guarde (perder el historial es malo; perder el documento, peor).
export async function snapshotFileVersion(
  fileId: string,
  opts?: { savedByName?: string | null },
): Promise<number | null> {
  try {
    const file = await db.fileAsset.findUnique({ where: { id: fileId }, select: { name: true, path: true, version: true } });
    if (!file?.path) return null;

    let actual: Buffer;
    try {
      actual = await fs.readFile(absPath(file.path));
    } catch {
      return null; // el archivo aún no existe en disco (primer guardado)
    }
    if (actual.length === 0) return null;

    const rel = path.posix.join(carpetaDe(fileId), `v${file.version}.${extOf(file.name) || "bin"}`);
    const destino = absPath(rel);
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(destino, actual);

    await db.fileVersion.create({
      data: { fileId, version: file.version, path: rel, size: actual.length, savedByName: opts?.savedByName ?? null },
    });

    await podar(fileId);
    return file.version;
  } catch (e) {
    console.error("[historial] no se pudo guardar la versión anterior:", e instanceof Error ? e.message : e);
    return null;
  }
}

// Borra las copias más viejas por encima del tope (fila y archivo).
async function podar(fileId: string): Promise<void> {
  const sobran = await db.fileVersion.findMany({
    where: { fileId },
    orderBy: { version: "desc" },
    skip: MAX_VERSIONES,
    select: { id: true, path: true },
  });
  for (const v of sobran) {
    await fs.unlink(absPath(v.path)).catch(() => null);
    await db.fileVersion.delete({ where: { id: v.id } }).catch(() => null);
  }
}

// Restaura una versión: primero guarda la actual como una versión más (para poder deshacer el
// deshacer) y luego escribe encima el contenido antiguo, subiendo el número de versión — así
// OnlyOffice ve una clave nueva y la siguiente apertura trae el contenido restaurado.
export async function restoreFileVersion(versionId: string, byName?: string | null): Promise<{ ok: boolean; error?: string }> {
  const v = await db.fileVersion.findUnique({ where: { id: versionId }, select: { fileId: true, path: true, version: true } });
  if (!v) return { ok: false, error: "Esa versión ya no existe." };
  const file = await db.fileAsset.findUnique({ where: { id: v.fileId }, select: { path: true } });
  if (!file?.path) return { ok: false, error: "El archivo ya no está." };

  let contenido: Buffer;
  try {
    contenido = await fs.readFile(absPath(v.path));
  } catch {
    return { ok: false, error: "La copia de esa versión ya no está en el disco." };
  }

  await snapshotFileVersion(v.fileId, { savedByName: byName ?? null });
  await fs.writeFile(absPath(file.path), contenido);
  await db.fileAsset.update({ where: { id: v.fileId }, data: { size: contenido.length, version: { increment: 1 } } });
  return { ok: true };
}
