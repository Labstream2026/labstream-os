"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { scanGaleria, resolveGaleriaFile, normalizeGaleriaRel } from "@/lib/nas-galeria";
import { carpetaGaleriaProyecto, relPerteneceAlProyecto } from "@/lib/galeria-vinculos";
import { mimeFor } from "@/lib/storage";
import { logActivity } from "@/lib/activity";
import { addDeliverableVersion } from "./actions";

// ── Versión de entregable DESDE EL DISCO (galería de LabTem) ──
// El video ya vive en la carpeta del proyecto: no se copia un byte. Se registra un FileAsset
// kind GALERIA que apunta a la ruta y la sala de revisión lo reproduce por /api/files-asset
// (que prefiere la copia ligera H.264 que fabricó LabTem — reproducción instantánea).

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
} as const;

export type PiezaDisco = { rel: string; name: string; takenAt: string; video: boolean };
export type PiezasResultado = { ok: true; carpeta: string; piezas: PiezaDisco[] } | { error: string };

// Lista las piezas de la carpeta del proyecto para el selector. Solo equipo con acceso al
// proyecto; el rel de cada pieza ya viene acotado porque el scan parte de ESA carpeta.
export async function piezasDeCarpetaProyecto(projectId: string): Promise<PiezasResultado> {
  const session = await getSession();
  if (!session || session.role === "cliente") return { error: "Sin permiso" };
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  if (!project || !canAccessProject(project, session)) return { error: "Sin permiso" };

  const carpeta = await carpetaGaleriaProyecto(projectId);
  if (!carpeta) return { error: "Ni el proyecto ni su cliente tienen carpeta vinculada en la galería. Vincúlala desde /galeria." };
  if (!carpeta.existe) return { error: `La carpeta «${carpeta.rel}» todavía no existe en el disco (o LabTem no responde).` };

  try {
    const scan = await scanGaleria(carpeta.rel);
    const piezas: PiezaDisco[] = scan.months
      .flatMap((m) => m.days)
      .flatMap((d) => d.items)
      .slice(0, 500)
      .map((it) => ({ rel: it.rel, name: it.name, takenAt: it.takenAt, video: it.kind === "video" }));
    return { ok: true, carpeta: carpeta.rel, piezas };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer la carpeta del proyecto." };
  }
}

export type VersionDiscoResultado = { ok: true; version: number } | { error: string };

// Crea la versión apuntando al archivo del disco. La ruta viene del navegador → SIEMPRE se
// re-verifica en el servidor que cuelgue de la carpeta de ESTE proyecto: sin esa guarda, un
// rel manipulado le serviría al cliente A el material del cliente B.
export async function crearVersionDesdeDisco(
  deliverableId: string,
  projectId: string,
  rel: string,
  notes?: string,
): Promise<VersionDiscoResultado> {
  const session = await getSession();
  if (!session || session.role === "cliente") return { error: "Sin permiso" };

  let norm: string;
  try {
    norm = normalizeGaleriaRel(rel);
  } catch {
    return { error: "Ruta inválida" };
  }
  if (!(await relPerteneceAlProyecto(projectId, norm))) {
    return { error: "Ese archivo no está en la carpeta de este proyecto." };
  }
  const info = await resolveGaleriaFile(norm, false);
  if (!info) return { error: "El archivo ya no está en el disco (¿lo movieron por SMB?)." };

  const deliverable = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { projectId: true, name: true } });
  if (!deliverable || deliverable.projectId !== projectId) return { error: "Entregable no encontrado." };

  const asset = await db.fileAsset.create({
    data: {
      projectId,
      name: info.name,
      kind: "GALERIA",
      path: norm,
      mime: mimeFor(info.name, null),
      size: info.size <= 2_000_000_000 ? info.size : null, // Int de 32 bits: un master de +2 GB no cabe; el tamaño real lo dice el disco
      uploadedById: session.id,
    },
  });

  try {
    const fd = new FormData();
    const n = String(notes ?? "").trim();
    if (n) fd.set("notes", n.slice(0, 2000));
    // addDeliverableVersion hace TODAS sus comprobaciones de acceso y efectos (tareas,
    // avisos, SLA). Si no hay permiso, lanza — y el catch limpia el FileAsset.
    await addDeliverableVersion(deliverableId, projectId, fd);

    const v = await db.deliverableVersion.findFirst({
      where: { deliverableId },
      orderBy: { number: "desc" },
      select: { id: true, number: true, fileAssetId: true, uploadedById: true },
    });
    if (!v || v.uploadedById !== session.id || v.fileAssetId) {
      await db.fileAsset.delete({ where: { id: asset.id } }).catch(() => {});
      return { error: "No se pudo atar el archivo del disco a la versión." };
    }
    await db.deliverableVersion.update({ where: { id: v.id }, data: { fileAssetId: asset.id } });
    await logActivity({
      action: "deliverable.version_disco",
      summary: `añadió la v${v.number} de «${deliverable.name}» desde el disco (${norm})`,
      projectId,
      entityType: "deliverable",
      entityId: deliverableId,
      userId: session.id,
    });
    return { ok: true, version: v.number };
  } catch (e) {
    await db.fileAsset.delete({ where: { id: asset.id } }).catch(() => {});
    return { error: e instanceof Error ? e.message : "No se pudo crear la versión." };
  }
}
