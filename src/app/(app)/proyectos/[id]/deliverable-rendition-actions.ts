"use server";

// Acciones para los ARCHIVOS FINALES por formato de un entregable ("renditions").
// El equipo adjunta un enlace de descarga por formato (Instagram Reel, TikTok, YouTube Shorts, etc.);
// el cliente solo los DESCARGA en su sala de revisión (nunca escribe aquí). Archivo aparte para
// mantener el cambio acotado.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canWriteProject } from "@/lib/project-access";
import { RENDITION_FORMAT_KEYS } from "@/lib/rendition-format";

const projectShapeSelect = { isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } } as const;

export type RenditionRow = { id: string; format: string; label: string | null; url: string };

// Lee los archivos finales de un entregable (para el editor del equipo). Requiere acceso de
// escritura al proyecto; el portal cliente no usa esto.
export async function getRenditions(deliverableId: string): Promise<RenditionRow[]> {
  const session = await getSession();
  if (!session || session.role === "cliente") throw new Error("Sin permiso");
  const d = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: {
      renditions: { orderBy: { position: "asc" }, select: { id: true, format: true, label: true, url: true } },
      project: { select: projectShapeSelect },
    },
  });
  if (!d) throw new Error("Entregable no encontrado");
  if (!canWriteProject(d.project, session)) throw new Error("Sin permiso");
  return d.renditions;
}

// Añade un archivo final por formato. Solo equipo con permiso de escritura en el proyecto.
export async function addRendition(deliverableId: string, format: string, url: string, label?: string): Promise<void> {
  const session = await getSession();
  if (!session || session.role === "cliente") throw new Error("Sin permiso");
  const d = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { projectId: true, project: { select: projectShapeSelect } },
  });
  if (!d) throw new Error("Entregable no encontrado");
  if (!canWriteProject(d.project, session)) throw new Error("Sin permiso");

  const cleanUrl = url.trim();
  // "//" (protocolo-relativo) queda excluido a propósito: parece ruta local pero apunta a otro dominio.
  if (!(cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://") || (cleanUrl.startsWith("/") && !cleanUrl.startsWith("//")))) {
    throw new Error("Enlace no válido");
  }
  const cleanFormat = RENDITION_FORMAT_KEYS.includes(format) ? format : "OTRO";
  const cleanLabel = (label || "").trim().slice(0, 120) || null;

  const position = await db.deliverableRendition.count({ where: { deliverableId } });
  await db.deliverableRendition.create({
    data: {
      deliverableId,
      format: cleanFormat,
      label: cleanLabel,
      url: cleanUrl.slice(0, 2000),
      position,
    },
  });
  revalidatePath(`/proyectos/${d.projectId}`);
}

// Elimina un archivo final. Solo equipo con permiso de escritura en el proyecto.
export async function deleteRendition(renditionId: string): Promise<void> {
  const session = await getSession();
  if (!session || session.role === "cliente") throw new Error("Sin permiso");
  const r = await db.deliverableRendition.findUnique({
    where: { id: renditionId },
    select: { deliverableId: true, deliverable: { select: { projectId: true, project: { select: projectShapeSelect } } } },
  });
  if (!r) throw new Error("Archivo no encontrado");
  if (!canWriteProject(r.deliverable.project, session)) throw new Error("Sin permiso");
  await db.deliverableRendition.delete({ where: { id: renditionId } });
  revalidatePath(`/proyectos/${r.deliverable.projectId}`);
}
