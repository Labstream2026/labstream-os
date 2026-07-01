"use server";

// Acciones para el CONTENIDO de publicación de un entregable (caption/copy + hashtags).
// Archivo aparte (no el actions.ts general) para mantener el cambio acotado. El equipo edita;
// el cliente solo lo LEE en su sala de revisión (nunca escribe aquí).

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canWriteProject } from "@/lib/project-access";

const projectShapeSelect = { isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } } as const;

// Lee copy + hashtags de un entregable (para precargar el editor del equipo). Requiere acceso
// de escritura al proyecto; el portal cliente no usa esto.
export async function getDeliverableContent(deliverableId: string): Promise<{ copy: string; hashtags: string }> {
  const session = await getSession();
  if (!session || session.role === "cliente") throw new Error("Sin permiso");
  const d = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { copy: true, hashtags: true, project: { select: projectShapeSelect } },
  });
  if (!d) throw new Error("Entregable no encontrado");
  if (!canWriteProject(d.project, session)) throw new Error("Sin permiso");
  return { copy: d.copy ?? "", hashtags: d.hashtags ?? "" };
}

// Guarda copy + hashtags. Solo equipo con permiso de escritura en el proyecto.
export async function setDeliverableContent(deliverableId: string, copy: string, hashtags: string): Promise<void> {
  const session = await getSession();
  if (!session || session.role === "cliente") throw new Error("Sin permiso");
  const d = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { projectId: true, project: { select: projectShapeSelect } },
  });
  if (!d) throw new Error("Entregable no encontrado");
  if (!canWriteProject(d.project, session)) throw new Error("Sin permiso");

  const clean = (s: unknown) => (typeof s === "string" ? s.slice(0, 5000).trim() : "");
  await db.deliverable.update({
    where: { id: deliverableId },
    data: { copy: clean(copy) || null, hashtags: clean(hashtags) || null },
  });
  revalidatePath(`/proyectos/${d.projectId}`);
}
