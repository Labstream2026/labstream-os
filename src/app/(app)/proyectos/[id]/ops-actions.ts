"use server";

import { noAutorizado } from "@/lib/authz-error";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canWriteProject } from "@/lib/project-access";
import { normalizeOpsRel, statOps, opsEnabled } from "@/lib/nas-ops";
import { logActivity } from "@/lib/activity";
import type { SessionUser } from "@/lib/session";

// ── Carpeta de Operaciones_LAB vinculada al proyecto ──
// Separado de actions.ts a propósito (archivo enorme, tocado por otras sesiones).

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
  archivedAt: true,
  finishedAt: true,
} as const;

async function ensureWrite(projectId: string, perm?: string): Promise<SessionUser> {
  const session = await getSession();
  // El cliente jamás gestiona la carpeta del NAS (rutas internas del servidor).
  if (!session || session.role === "cliente") noAutorizado();
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  if (!project) noAutorizado();
  if (project.archivedAt || project.finishedAt) noAutorizado();
  if (!canWriteProject(project, session)) noAutorizado();
  if (perm && !hasPermission(session, perm)) noAutorizado();
  return session!;
}

// Vincular (o cambiar/quitar con rel = null) la carpeta del proyecto en Operaciones_LAB.
// Con carpeta vinculada, las subidas de Archivos van ahí por defecto y la pestaña muestra
// la carpeta en vivo.
export async function setProjectOpsFolder(projectId: string, rel: string | null): Promise<{ ok: true } | { error: string }> {
  const session = await ensureWrite(projectId, "subir_archivos");
  if (!opsEnabled()) return { error: "Operaciones_LAB no está configurado" };
  let value: string | null = null;
  if (rel !== null) {
    try {
      value = normalizeOpsRel(rel);
    } catch {
      return { error: "Ruta inválida" };
    }
    const st = await statOps(value);
    if (!st || !st.dir) return { error: "Esa carpeta ya no existe en el disco" };
  }
  await db.project.update({ where: { id: projectId }, data: { opsFolder: value } });
  await logActivity({
    action: "project.ops_folder",
    summary: value ? `vinculó el proyecto a Operaciones_LAB/${value}` : "desvinculó la carpeta de Operaciones_LAB",
    projectId,
    entityType: "project",
    entityId: projectId,
    userId: session.id,
  });
  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true };
}
