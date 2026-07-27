"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject, canWriteProject } from "@/lib/project-access";
import { logActivity } from "@/lib/activity";
import { restoreFileVersion } from "@/lib/file-versions";

// Historial de un documento del proyecto: ver las versiones anteriores y volver a una.
// El acceso se calcula con los MISMOS helpers que la página del editor (ver = acceso al
// proyecto; restaurar = poder escribir en él y que el proyecto no esté dormido).

export type VersionRow = { id: string; version: number; when: string; savedByName: string | null; size: number };

const ACCESO = {
  isPrivate: true,
  leadId: true,
  archivedAt: true,
  finishedAt: true,
  members: { select: { userId: true, role: true } },
} as const;

const fmt = (d: Date): string => {
  try {
    return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return d.toISOString();
  }
};

export async function listFileVersions(fileId: string): Promise<{ ok: boolean; error?: string; rows?: VersionRow[]; canRestore?: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  const file = await db.fileAsset.findUnique({ where: { id: fileId }, select: { project: { select: ACCESO } } });
  if (!file) return { ok: false, error: "El archivo no existe" };
  if (!canAccessProject(file.project, session)) return { ok: false, error: "Sin acceso" };

  const rows = await db.fileVersion.findMany({
    where: { fileId },
    orderBy: { version: "desc" },
    take: 30,
    select: { id: true, version: true, createdAt: true, savedByName: true, size: true },
  });
  return {
    ok: true,
    canRestore: canWriteProject(file.project, session) && session.role !== "demo",
    rows: rows.map((r) => ({ id: r.id, version: r.version, when: fmt(r.createdAt), savedByName: r.savedByName, size: r.size })),
  };
}

export async function restoreVersion(fileId: string, versionId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role === "demo") return { ok: false, error: "No autorizado" };
  const file = await db.fileAsset.findUnique({ where: { id: fileId }, select: { name: true, projectId: true, project: { select: ACCESO } } });
  if (!file) return { ok: false, error: "El archivo no existe" };
  if (!canWriteProject(file.project, session)) return { ok: false, error: "Sin permiso para restaurar" };

  // La versión debe ser de ESTE archivo (si no, se podría restaurar la de otro proyecto).
  const v = await db.fileVersion.findUnique({ where: { id: versionId }, select: { fileId: true, version: true } });
  if (!v || v.fileId !== fileId) return { ok: false, error: "Esa versión no es de este documento" };

  const r = await restoreFileVersion(versionId, session.name);
  if (!r.ok) return r;
  await logActivity({
    action: "file.restore",
    summary: `restauró la versión ${v.version} de «${file.name}»`,
    projectId: file.projectId,
    entityType: "file",
    entityId: fileId,
  }).catch(() => null);
  revalidatePath(`/proyectos/${file.projectId}`);
  return { ok: true };
}
