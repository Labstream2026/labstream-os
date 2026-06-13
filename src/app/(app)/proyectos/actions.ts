"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { instantiateTemplate } from "@/lib/provisioning";

export async function createProject(formData: FormData) {
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

  revalidatePath("/proyectos");
  revalidatePath("/");
  redirect(`/proyectos/${project.id}`);
}
