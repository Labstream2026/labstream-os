"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { instantiateTemplate } from "@/lib/provisioning";
import { logActivity } from "@/lib/activity";

export async function createProject(formData: FormData) {
  const session = await getSession();
  if (!hasPermission(session, "crear_proyectos")) throw new Error("No autorizado");
  const name = String(formData.get("name") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "");
  const leadId = String(formData.get("leadId") ?? "") || null;
  const templateKey = String(formData.get("templateKey") ?? "");
  if (!name || !clientId) return;

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

  revalidatePath("/proyectos");
  revalidatePath("/");
  redirect(`/proyectos/${project.id}`);
}
