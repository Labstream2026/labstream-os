"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canWriteProject } from "@/lib/project-access";
import { PROJECT_STATUS_DEFAULTS } from "@/lib/project-status";
import { statusMeta } from "@/lib/ui";
import { logActivity } from "@/lib/activity";

// Cambia SOLO el estado de un proyecto (para el Pipeline de /proyectos: arrastrar una tarjeta a
// otra columna o elegir en su selector). Aparte de updateProject a propósito: aquel es el
// formulario completo del detalle; esto es un movimiento puntual con su propio gate y rastro.
export async function setProjectStatus(projectId: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  if (!PROJECT_STATUS_DEFAULTS.some((s) => s.key === status)) return { ok: false, error: "Estado desconocido." };
  try {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, status: true, leadId: true, isPrivate: true, members: { select: { userId: true, role: true } } },
    });
    if (!project) return { ok: false, error: "El proyecto no existe." };
    if (!canWriteProject(project, session)) return { ok: false, error: "No autorizado" };
    if (project.status === status) return { ok: true };
    await db.project.update({ where: { id: projectId }, data: { status: status as never } });
    await logActivity({
      action: "project.status",
      summary: `movió «${project.name}» a ${statusMeta(status).label}`,
      projectId,
      entityType: "project",
      entityId: projectId,
    });
    revalidatePath("/proyectos");
    revalidatePath(`/proyectos/${projectId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo cambiar el estado." };
  }
}
