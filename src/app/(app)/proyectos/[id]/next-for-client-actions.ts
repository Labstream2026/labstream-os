"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageProject } from "@/lib/project-access";
import { logActivity } from "@/lib/activity";

// Guarda el «¿Qué sigue?» del portal del cliente (Project.nextForClient). Vive en su propio
// archivo (no en actions.ts) para no chocar con el trabajo concurrente de ese módulo.
export async function setNextForClient(
  projectId: string,
  fd: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await getSession();
    if (!session || session.role === "cliente" || session.role === "demo") {
      return { ok: false, error: "Sin permiso." };
    }
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } },
    });
    if (!project) return { ok: false, error: "Proyecto no encontrado." };
    if (!canManageProject(project, session)) return { ok: false, error: "Solo quien gestiona el proyecto puede editar este mensaje." };

    const raw = String(fd.get("nextForClient") ?? "").trim();
    if (raw.length > 500) return { ok: false, error: "Máximo 500 caracteres." };

    await db.project.update({ where: { id: projectId }, data: { nextForClient: raw || null } });
    await logActivity({
      action: "project.next_for_client",
      summary: raw ? "actualizó el «¿Qué sigue?» del portal del cliente" : "borró el «¿Qué sigue?» (vuelve al texto automático)",
      projectId,
      silent: true,
    });
    revalidatePath(`/proyectos/${projectId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo guardar." };
  }
}
