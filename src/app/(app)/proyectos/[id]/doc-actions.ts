"use server";

import { revalidatePath } from "next/cache";
import { createProjectDoc, saveAsDocTemplate, activeDocTemplates } from "@/lib/doc-create";
import type { NewDocKind } from "@/lib/office-blank";

// Crear documentos desde el proyecto. La lógica vive en `@/lib/doc-create` para que la
// compartan Archivos, Guiones, ⌘K, la ficha del cliente y el chat.

export type DocTemplateOption = { id: string; name: string; ext: string; kind: NewDocKind };

export async function createOfficeDoc(input: {
  projectId: string;
  name: string;
  kind: NewDocKind;
  folderId?: string | null;
  templateId?: string | null;
}): Promise<{ ok: boolean; error?: string; id?: string; name?: string }> {
  const r = await createProjectDoc(input);
  if (r.ok) revalidatePath(`/proyectos/${input.projectId}`);
  return r;
}

export async function listDocTemplates(): Promise<DocTemplateOption[]> {
  return activeDocTemplates();
}

export async function saveDocAsTemplate(
  fileId: string,
  name: string,
  description: string | null,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const r = await saveAsDocTemplate(fileId, name, description);
  if (r.ok) revalidatePath("/plantillas/documentos");
  return r;
}
