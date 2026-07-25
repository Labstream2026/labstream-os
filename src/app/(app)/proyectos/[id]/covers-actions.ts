"use server";

import { noAutorizado } from "@/lib/authz-error";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canManageProject, canWriteProject } from "@/lib/project-access";
import { mimeFor } from "@/lib/storage";
import { saveBufferWithPreview, isOptimizableImage } from "@/lib/image";
import { logActivity } from "@/lib/activity";
import { listDriveFolderImages } from "@/lib/drive";
import type { SessionUser } from "@/lib/session";

// ── Acciones del BANCO DE PORTADAS (pestaña «Portadas») y de los SETS DE FOTOS ──
// Separadas de actions.ts a propósito: ese archivo es enorme y lo tocan otras sesiones;
// aquí vive todo lo nuevo de portadas/fotos sin pisar el flujo de versiones.

const BLOCKED_EXT = /\.(exe|bat|cmd|com|msi|scr|pif|cpl|jar|js|vbs|ps1|sh|app|dmg|deb|rpm)$/i;
const MAX_UPLOAD = 100 * 1024 * 1024; // 100 MB por archivo (coincide con bodySizeLimit)
const MAX_FOLDER_IMPORT = 200; // tope de imágenes por importación de carpeta de Drive

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
  archivedAt: true,
  finishedAt: true,
} as const;

// Escritura en el proyecto (mismo contrato que ensureProjectAccess de actions.ts): proyecto
// vivo + canWriteProject + permiso opcional. Devuelve la sesión.
async function ensureWrite(projectId: string, perm?: string): Promise<SessionUser> {
  const session = await getSession();
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  if (!project) noAutorizado();
  if (project.archivedAt || project.finishedAt) noAutorizado();
  if (!canWriteProject(project, session)) noAutorizado();
  if (perm && !hasPermission(session, perm)) noAutorizado();
  return session!;
}

function refresh(projectId: string) {
  revalidatePath(`/proyectos/${projectId}`);
}

export type CoverUploadResult = { ok: boolean; added?: number; skipped?: number; error?: string };

// Sube VARIAS portadas al banco del proyecto (imágenes → WebP + miniatura en el NAS).
// Devuelve el recuento: antes descartaba en SILENCIO lo que no pasaba el filtro (archivo
// enorme, no-imagen, extensión bloqueada) y el equipo no se enteraba.
export async function uploadProjectCovers(projectId: string, formData: FormData): Promise<CoverUploadResult> {
  const session = await ensureWrite(projectId, "subir_archivos");

  const last = await db.projectCover.findFirst({ where: { projectId }, orderBy: { position: "desc" }, select: { position: true } });
  let pos = (last?.position ?? -1) + 1;
  let added = 0;

  const all = formData.getAll("covers").filter((f): f is File => f instanceof File && f.size > 0);
  const files = all.filter((f) => f.size <= MAX_UPLOAD && !BLOCKED_EXT.test(f.name) && isOptimizableImage(f.name, f.type));
  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    const asset = await db.fileAsset.create({ data: { projectId, name: f.name, kind: "LOCAL", path: "", mime: mimeFor(f.name, f.type), size: buf.length, uploadedById: session.id } });
    const rel = await saveBufferWithPreview(`project/${projectId}/portadas-banco`, `${asset.id}-${f.name}`, buf, f.type);
    await db.fileAsset.update({ where: { id: asset.id }, data: { path: rel } });
    await db.projectCover.create({ data: { projectId, fileAssetId: asset.id, name: f.name, position: pos++, uploadedById: session.id } });
    added++;
  }

  if (added > 0) {
    await logActivity({ action: "cover.upload", summary: `subió ${added} portada(s) al banco del proyecto`, projectId, entityType: "project", entityId: projectId });
  }
  refresh(projectId);
  const skipped = all.length - files.length;
  if (added === 0 && skipped > 0) return { ok: false, error: `No se subió nada: ${skipped} archivo(s) no son imágenes válidas o superan 100 MB.` };
  return { ok: true, added, skipped };
}

// Renombra una portada (antes el nombre era el del archivo y no se podía tocar).
export async function renameProjectCover(coverId: string, projectId: string, name: string): Promise<{ ok: boolean; error?: string }> {
  await ensureWrite(projectId);
  const clean = name.trim().slice(0, 120);
  if (!clean) return { ok: false, error: "El nombre no puede quedar vacío." };
  const cover = await db.projectCover.findUnique({ where: { id: coverId }, select: { projectId: true } });
  if (!cover || cover.projectId !== projectId) return { ok: false, error: "Esa portada no es de este proyecto." };
  await db.projectCover.update({ where: { id: coverId }, data: { name: clean } });
  refresh(projectId);
  return { ok: true };
}

// Reordena: intercambia la posición con la portada vecina. El orden del banco ES el orden en
// que las ve el cliente, así que poner la opción A primero deja de ser cosa del azar.
export async function moveProjectCover(coverId: string, projectId: string, dir: -1 | 1): Promise<{ ok: boolean; error?: string }> {
  await ensureWrite(projectId);
  const covers = await db.projectCover.findMany({
    where: { projectId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const i = covers.findIndex((c) => c.id === coverId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= covers.length) return { ok: false, error: "No se puede mover más." };
  // Reescribe TODAS las posiciones tras el intercambio: así se normaliza el orden aunque
  // vengan posiciones repetidas de subidas antiguas.
  const order = [...covers];
  [order[i], order[j]] = [order[j], order[i]];
  await db.$transaction(order.map((c, k) => db.projectCover.update({ where: { id: c.id }, data: { position: k } })));
  refresh(projectId);
  return { ok: true };
}

// El equipo marca una anotación del cliente como atendida (mismo gesto que resolver una
// corrección de video).
export async function resolveCoverNote(noteId: string, projectId: string, resolved: boolean): Promise<{ ok: boolean; error?: string }> {
  const session = await ensureWrite(projectId);
  const note = await db.coverNote.findUnique({ where: { id: noteId }, select: { cover: { select: { projectId: true } } } });
  if (!note || note.cover.projectId !== projectId) return { ok: false, error: "Esa nota no es de este proyecto." };
  await db.coverNote.update({
    where: { id: noteId },
    data: { resolved, resolvedAt: resolved ? new Date() : null, resolvedById: resolved ? session.id : null },
  });
  refresh(projectId);
  return { ok: true };
}

// Importa una carpeta de Google Drive al BANCO: descarga cada imagen y la guarda en el NAS
// (una portada es siempre un archivo local, con su miniatura WebP). Idempotente por nombre.
export async function importDriveCovers(projectId: string, formData: FormData): Promise<CoverUploadResult> {
  const session = await ensureWrite(projectId, "subir_archivos");
  const url = String(formData.get("folderUrl") ?? "").trim();
  if (!url) return { ok: false, error: "Pega el enlace de la carpeta de Drive." };

  const images = await listDriveFolderImages(url);
  if (images.length === 0) return { ok: false, error: "No encontré imágenes ahí. ¿La carpeta es pública («cualquiera con el enlace»)?" };

  const existing = new Set((await db.projectCover.findMany({ where: { projectId }, select: { name: true } })).map((c) => c.name));
  const last = await db.projectCover.findFirst({ where: { projectId }, orderBy: { position: "desc" }, select: { position: true } });
  let pos = (last?.position ?? -1) + 1;
  let added = 0;
  let skipped = 0;

  for (const img of images.slice(0, MAX_FOLDER_IMPORT)) {
    if (existing.has(img.name)) {
      skipped++;
      continue;
    }
    try {
      const res = await fetch(`https://drive.google.com/uc?export=download&id=${img.id}`, { cache: "no-store" });
      if (!res.ok) {
        skipped++;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_UPLOAD) {
        skipped++;
        continue;
      }
      const asset = await db.fileAsset.create({
        data: { projectId, name: img.name, kind: "LOCAL", path: "", mime: mimeFor(img.name, null), size: buf.length, uploadedById: session.id },
      });
      const rel = await saveBufferWithPreview(`project/${projectId}/portadas-banco`, `${asset.id}-${img.name}`, buf);
      await db.fileAsset.update({ where: { id: asset.id }, data: { path: rel } });
      await db.projectCover.create({ data: { projectId, fileAssetId: asset.id, name: img.name, position: pos++, uploadedById: session.id } });
      added++;
    } catch {
      skipped++;
    }
  }

  if (added > 0) {
    await logActivity({ action: "cover.import", summary: `importó ${added} portada(s) desde Drive`, projectId, entityType: "project", entityId: projectId });
  }
  refresh(projectId);
  return added > 0 ? { ok: true, added, skipped } : { ok: false, error: "No se pudo importar ninguna imagen (¿permisos de la carpeta?)." };
}

// Vincula (o desvincula con null) una portada del banco a un entregable del MISMO proyecto.
// Reversible y en cualquier orden: la portada puede existir antes que el video.
export async function linkProjectCover(coverId: string, projectId: string, deliverableId: string | null) {
  await ensureWrite(projectId);
  const cover = await db.projectCover.findUnique({
    where: { id: coverId },
    select: { projectId: true, fileAssetId: true, decision: true, deliverableId: true, name: true },
  });
  if (!cover || cover.projectId !== projectId) noAutorizado();

  let targetName: string | null = null;
  if (deliverableId) {
    const d = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { projectId: true, name: true } });
    if (!d || d.projectId !== projectId) noAutorizado();
    targetName = d.name;
  }

  // Al CAMBIAR de video, una portada DESCARTADA (perdedora del A/B viejo) vuelve a estar en
  // juego: esa decisión era relativa a aquel grupo, no al arte. APROBADA/CAMBIOS se conservan
  // (hablan de la imagen en sí).
  const clearLoser = cover.decision === "DESCARTADA" && deliverableId !== cover.deliverableId;
  await db.projectCover.update({
    where: { id: coverId },
    data: {
      deliverableId,
      ...(clearLoser ? { decision: null, decisionBy: null, decisionAt: null, decisionNote: null } : {}),
    },
  });

  // Coherencia con el flujo viejo de portada-del-reel (coverFileAssetId):
  //  - vincular una portada YA APROBADA a un video sin portada → se convierte en su portada.
  //  - desvincular la portada que era la del video → el video queda sin portada.
  if (deliverableId && cover.decision === "APROBADA") {
    await db.deliverable.updateMany({ where: { id: deliverableId, coverFileAssetId: null }, data: { coverFileAssetId: cover.fileAssetId } });
  }
  if (!deliverableId && cover.deliverableId) {
    await db.deliverable.updateMany({ where: { id: cover.deliverableId, coverFileAssetId: cover.fileAssetId }, data: { coverFileAssetId: null } });
  }

  await logActivity({
    action: "cover.link",
    summary: deliverableId ? `vinculó la portada «${cover.name}» al entregable «${targetName}»` : `desvinculó la portada «${cover.name}»`,
    projectId,
    entityType: "project",
    entityId: projectId,
  });
  refresh(projectId);
}

// Borra una portada del banco (y su archivo del NAS). Solo gestores.
export async function deleteProjectCover(coverId: string, projectId: string) {
  const session = await getSession();
  const cover = await db.projectCover.findUnique({
    where: { id: coverId },
    select: { projectId: true, fileAssetId: true, name: true, deliverableId: true, project: { select: accessSelect } },
  });
  if (!cover || cover.projectId !== projectId) noAutorizado();
  if (!canManageProject(cover.project, session)) noAutorizado();
  // Si era la portada vigente del video, el video queda sin portada (coherente con removeDeliverableCover).
  if (cover.deliverableId) {
    await db.deliverable.updateMany({ where: { id: cover.deliverableId, coverFileAssetId: cover.fileAssetId }, data: { coverFileAssetId: null } });
  }
  // Borrar el FileAsset arrastra la fila de ProjectCover (Cascade en el schema).
  await db.fileAsset.delete({ where: { id: cover.fileAssetId } }).catch(async () => {
    await db.projectCover.delete({ where: { id: coverId } }).catch(() => {});
  });
  await logActivity({ action: "cover.delete", summary: `borró la portada «${cover.name}» del banco`, projectId, entityType: "project", entityId: projectId });
  refresh(projectId);
}

// Corta (o reactiva) el enlace público del banco de portadas. Solo gestores.
export async function setCoversRevoked(projectId: string, revoked: boolean) {
  const session = await getSession();
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  if (!project) noAutorizado();
  if (!canManageProject(project, session)) noAutorizado();
  await db.project.update({ where: { id: projectId }, data: { coversRevokedAt: revoked ? new Date() : null } });
  await logActivity({ action: "cover.link_toggle", summary: revoked ? "revocó el enlace de portadas del cliente" : "reactivó el enlace de portadas del cliente", projectId, entityType: "project", entityId: projectId });
  refresh(projectId);
}

// ── Sets de fotos (pestaña «Fotos») ──

// Crea un SET de fotos (entregable FOTOGRAFIA) con solo el nombre: la pestaña Fotos queda con
// su tarjeta lista para llenar (subir archivos o importar carpeta de Drive).
export async function createPhotoSet(projectId: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await ensureWrite(projectId);
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (!name) return { ok: false, error: "Ponle nombre al set." };
  const maxNum = await db.deliverable.aggregate({ where: { projectId }, _max: { number: true } });
  await db.deliverable.create({
    data: { projectId, name, type: "FOTOGRAFIA", status: "PENDIENTE", number: (maxNum._max.number ?? 0) + 1 },
  });
  await logActivity({ action: "deliverable.create", summary: `creó el set de fotos «${name}»`, projectId, entityType: "project", entityId: projectId });
  refresh(projectId);
  return { ok: true };
}

// Importa TODAS las imágenes de una carpeta pública de Drive al set (como fotos por enlace:
// se visualizan desde Drive, sin duplicar peso en el NAS). Idempotente: las ya importadas
// (misma URL de archivo) se saltan.
export async function importDriveFolderPhotos(
  projectId: string,
  deliverableId: string,
  formData: FormData,
): Promise<{ ok: boolean; added?: number; error?: string }> {
  await ensureWrite(projectId, "subir_archivos");
  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { projectId: true, name: true } });
  if (!deliverable || deliverable.projectId !== projectId) noAutorizado();

  const folderUrl = String(formData.get("folderUrl") ?? "").trim();
  if (!folderUrl) return { ok: false, error: "Pega el enlace de la carpeta de Drive." };

  const images = await listDriveFolderImages(folderUrl);
  if (images.length === 0) {
    return { ok: false, error: "No se encontraron imágenes. ¿La carpeta es pública («cualquiera con el enlace») y tiene fotos?" };
  }

  const existing = await db.deliverablePhoto.findMany({ where: { deliverableId, url: { not: null } }, select: { url: true } });
  const seen = new Set(existing.map((p) => p.url ?? ""));
  const last = await db.deliverablePhoto.findFirst({ where: { deliverableId }, orderBy: { position: "desc" }, select: { position: true } });
  let pos = (last?.position ?? -1) + 1;
  let added = 0;

  for (const img of images.slice(0, MAX_FOLDER_IMPORT)) {
    const url = `https://drive.google.com/file/d/${img.id}/view`;
    if (seen.has(url)) continue;
    await db.deliverablePhoto.create({ data: { deliverableId, url, filename: img.name || "Foto de Drive", position: pos++ } });
    added++;
  }

  if (added > 0) {
    await logActivity({ action: "deliverable.photos", summary: `importó ${added} foto(s) de Drive al set «${deliverable.name}»`, projectId, entityType: "deliverable", entityId: deliverableId });
  }
  refresh(projectId);
  return { ok: true, added };
}
