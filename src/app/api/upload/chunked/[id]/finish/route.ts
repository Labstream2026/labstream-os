import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { STORAGE_DIR, absPath, sanitizeName } from "@/lib/storage";
import { partPath, readChunkMeta, removeChunkUpload, withChunkLock } from "@/lib/chunked-store";
import { CRC32_INIT, crc32Update, crc32Hex } from "@/lib/crc32";
import { notify } from "@/lib/notify";
import { addDeliverableVersion } from "@/app/(app)/proyectos/[id]/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Registrar la versión (notificaciones + tareas SLA) puede tardar; margen amplio.
export const maxDuration = 300;

// ── Subida por TROZOS (finish) ──
// Verifica el archivo rearmado (tamaño + CRC32), lo mueve a su lugar definitivo como
// FileAsset y llama a la server action EXISTENTE addDeliverableVersion — así la versión
// nace con exactamente las mismas notificaciones, compuertas, SLA y tareas automáticas
// que una subida normal, sin duplicar una línea de esa lógica. Al final se le ata el
// archivo a la versión recién creada.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const meta = await readChunkMeta(id);
  if (!meta) return NextResponse.json({ error: "Subida no encontrada o vencida" }, { status: 404 });
  if (meta.userId !== session.id) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body: { deliverableId?: string; notes?: string; durationSec?: number; poster?: string; crc32?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const deliverableId = String(body.deliverableId ?? "");
  if (!deliverableId) return NextResponse.json({ error: "Falta el entregable" }, { status: 400 });

  return withChunkLock(id, async () => {
    const part = partPath(id);
    const st = await fs.stat(part).catch(() => null);
    if (!st) return NextResponse.json({ error: "Archivo parcial no encontrado" }, { status: 404 });
    // Integridad 1: el tamaño rearmado debe ser EXACTO al anunciado.
    if (st.size !== meta.size) {
      return NextResponse.json({ error: "Subida incompleta", received: st.size, size: meta.size }, { status: 409 });
    }
    // Integridad 2: CRC32 del archivo completo vs el calculado por el navegador mientras subía.
    if (body.crc32) {
      let crc = CRC32_INIT;
      for await (const chunk of createReadStream(part)) crc = crc32Update(crc, chunk as Buffer);
      if (crc32Hex(crc) !== String(body.crc32).toLowerCase()) {
        await removeChunkUpload(id);
        return NextResponse.json({ error: "El archivo llegó corrupto (CRC no coincide). Vuelve a subirlo." }, { status: 422 });
      }
    }

    // El archivo queda como FileAsset del proyecto (mismo lugar/convención que una subida normal).
    const asset = await db.fileAsset.create({
      data: { projectId: meta.projectId, name: meta.fileName, kind: "LOCAL", path: "", mime: meta.mime, size: meta.size, uploadedById: session.id },
    });
    const relDir = `project/${meta.projectId}`;
    const rel = path.posix.join(relDir, sanitizeName(`${asset.id}-${meta.fileName}`));
    const cleanupAsset = async () => {
      await db.fileAsset.delete({ where: { id: asset.id } }).catch(() => {});
      await fs.rm(absPath(rel), { force: true }).catch(() => {});
    };
    try {
      await fs.mkdir(path.join(STORAGE_DIR, relDir), { recursive: true });
      try {
        await fs.rename(part, absPath(rel)); // mismo volumen: mover es instantáneo
      } catch {
        await fs.copyFile(part, absPath(rel));
        await fs.rm(part, { force: true }).catch(() => {});
      }
      await db.fileAsset.update({ where: { id: asset.id }, data: { path: rel } });

      // La server action EXISTENTE hace todo el registro (permisos incluidos). Va sin archivo
      // (el nuestro ya está en disco); el vínculo se ata justo después.
      const fd = new FormData();
      const notes = String(body.notes ?? "").trim();
      if (notes) fd.set("notes", notes.slice(0, 2000));
      if (Number.isInteger(body.durationSec) && (body.durationSec as number) > 0) fd.set("durationSec", String(body.durationSec));
      const poster = String(body.poster ?? "");
      if (poster.startsWith("data:image/")) fd.set("poster", poster);
      await addDeliverableVersion(deliverableId, meta.projectId, fd);

      // Ata el archivo a la versión recién creada (la más nueva, sin archivo, subida por mí).
      const v = await db.deliverableVersion.findFirst({
        where: { deliverableId },
        orderBy: { number: "desc" },
        select: { id: true, number: true, fileAssetId: true, uploadedById: true },
      });
      if (!v || v.uploadedById !== session.id || v.fileAssetId) {
        // No debería pasar (la action acaba de crearla); si pasa, no dejamos basura.
        await cleanupAsset();
        return NextResponse.json({ error: "No se pudo atar el archivo a la versión." }, { status: 500 });
      }
      await db.deliverableVersion.update({ where: { id: v.id }, data: { fileAssetId: asset.id } });
      await removeChunkUpload(id);

      // Si la subida tomó su tiempo (master largo en segundo plano), aviso de «subida completa».
      const tookMs = Date.now() - new Date(meta.createdAt).getTime();
      if (tookMs > 90_000) {
        await notify(session.id, {
          type: "upload",
          event: "upload_complete",
          title: `Subida completa: ${meta.fileName}`,
          body: `La v${v.number} quedó rearmada, verificada y enviada a revisión.`,
          link: `/revisiones/${deliverableId}`,
          subjectId: session.id,
        }).catch(() => {});
      }
      return NextResponse.json({ ok: true, version: v.number });
    } catch (e) {
      await cleanupAsset();
      const msg = e instanceof Error ? e.message : "No se pudo registrar la versión.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  });
}
