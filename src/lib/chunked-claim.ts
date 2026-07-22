import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { STORAGE_DIR, absPath, sanitizeName } from "@/lib/storage";
import { partPath, readChunkMeta, removeChunkUpload, withChunkLock } from "@/lib/chunked-store";
import { CRC32_INIT, crc32Update, crc32Hex } from "@/lib/crc32";

// ── Reclamo de una subida por TROZOS desde una server action ──
// Convierte una subida por trozos TERMINADA en un FileAsset del proyecto: verifica la
// integridad (tamaño exacto + CRC32), mueve el archivo a su lugar definitivo y limpia el
// área de trozos. Es el equivalente para SERVER ACTIONS de lo que hace la ruta
// /api/upload/chunked/[id]/finish para la bandeja de revisiones: aquí la action que recibe
// `chunkUploadId` en su FormData registra la versión con su propia lógica (portada, plazos,
// notificaciones) y solo necesita el asset ya verificado.
// Lanza Error con mensaje apto para el usuario; el llamador decide cómo mostrarlo.
export async function claimChunkUpload(opts: {
  uploadId: string;
  crc32?: string | null;
  // projectId de la action (ya autorizado): debe coincidir con el declarado al iniciar la subida.
  projectId: string;
  userId: string;
}): Promise<string> {
  const meta = await readChunkMeta(opts.uploadId);
  if (!meta) throw new Error("La subida por trozos no existe o venció. Vuelve a subir el archivo.");
  if (meta.userId !== opts.userId || meta.projectId !== opts.projectId) {
    throw new Error("Sin permiso sobre esa subida.");
  }
  return withChunkLock(opts.uploadId, async () => {
    const part = partPath(opts.uploadId);
    const st = await fs.stat(part).catch(() => null);
    if (!st) throw new Error("La subida por trozos no existe o venció. Vuelve a subir el archivo.");
    if (st.size !== meta.size) throw new Error("La subida quedó incompleta. Vuelve a subir el archivo.");
    if (opts.crc32) {
      let crc = CRC32_INIT;
      for await (const chunk of createReadStream(part)) crc = crc32Update(crc, chunk as Buffer);
      if (crc32Hex(crc) !== String(opts.crc32).toLowerCase()) {
        await removeChunkUpload(opts.uploadId);
        throw new Error("El archivo llegó corrupto (CRC no coincide). Vuelve a subirlo.");
      }
    }

    const asset = await db.fileAsset.create({
      data: { projectId: meta.projectId, name: meta.fileName, kind: "LOCAL", path: "", mime: meta.mime, size: meta.size, uploadedById: meta.userId },
    });
    const relDir = `project/${meta.projectId}`;
    const rel = path.posix.join(relDir, sanitizeName(`${asset.id}-${meta.fileName}`));
    try {
      await fs.mkdir(path.join(STORAGE_DIR, relDir), { recursive: true });
      try {
        await fs.rename(part, absPath(rel)); // mismo volumen: mover es instantáneo
      } catch {
        await fs.copyFile(part, absPath(rel));
        await fs.rm(part, { force: true }).catch(() => {});
      }
      await db.fileAsset.update({ where: { id: asset.id }, data: { path: rel } });
    } catch (e) {
      await db.fileAsset.delete({ where: { id: asset.id } }).catch(() => {});
      await fs.rm(absPath(rel), { force: true }).catch(() => {});
      throw e instanceof Error ? e : new Error("No se pudo guardar el archivo subido.");
    }
    await removeChunkUpload(opts.uploadId);
    return asset.id;
  });
}
