"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { userCanAccessClient } from "@/lib/client-access";
import { instantiateTemplate } from "@/lib/provisioning";
import { logActivity } from "@/lib/activity";
import { notifyAndEmail } from "@/lib/notify";

type WizardAnswer = { taskTitle: string; assigneeId?: string | null; dueDate?: string | null };

export async function createProject(formData: FormData) {
  const session = await getSession();
  if (!hasPermission(session, "crear_proyectos")) throw new Error("No autorizado");
  const name = String(formData.get("name") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "");
  const leadId = String(formData.get("leadId") ?? "") || null;
  const templateKey = String(formData.get("templateKey") ?? "");
  if (!name || !clientId) return;
  // No confiar en el clientId del formulario: exigir que el usuario pueda acceder a ese cliente.
  if (!(await userCanAccessClient(clientId, session))) throw new Error("No autorizado");

  const project = await instantiateTemplate(db, {
    templateKey,
    name,
    clientId,
    leadId,
  });

  await logActivity({
    action: "project.create",
    summary: templateKey ? `creó el proyecto «${name}» desde plantilla` : `creó el proyecto «${name}»`,
    projectId: project.id,
    entityType: "project",
    entityId: project.id,
  });

  // Aplicar respuestas del wizard: asignar responsables y fechas a las tareas
  // creadas por la plantilla (por título), y avisar a los responsables.
  let answers: WizardAnswer[] = [];
  try {
    answers = JSON.parse(String(formData.get("wizard") ?? "[]"));
  } catch { /* sin wizard */ }
  for (const a of answers) {
    if (!a.taskTitle || (!a.assigneeId && !a.dueDate)) continue;
    const task = await db.task.findFirst({ where: { projectId: project.id, title: a.taskTitle }, select: { id: true } });
    if (!task) continue;
    const assigneeId = a.assigneeId || null;
    const dueDate = a.dueDate ? new Date(`${a.dueDate}T12:00:00.000Z`) : null;
    await db.task.update({
      where: { id: task.id },
      data: {
        ...(assigneeId ? { assigneeId, assignedById: session?.id ?? null } : {}),
        ...(a.dueDate ? { dueDate } : {}),
      },
    });
    if (assigneeId && assigneeId !== session?.id) {
      await notifyAndEmail(assigneeId, {
        type: "task",
        title: `Tarea asignada: ${a.taskTitle}`,
        body: `En el proyecto «${name}»${a.dueDate ? ` · entrega ${a.dueDate}` : ""}.`,
        link: `/proyectos/${project.id}?tab=tareas`,
      });
    }
  }

  revalidatePath("/proyectos");
  revalidatePath("/");
  redirect(`/proyectos/${project.id}`);
}
