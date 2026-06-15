"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

// La wiki es del equipo: cualquier usuario con sesión puede crear/editar páginas.
async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  return session;
}

export async function createWikiPage(title?: string): Promise<void> {
  await requireSession();
  const page = await db.wikiPage.create({ data: { title: title?.trim() || "Página sin título" } });
  revalidatePath("/wiki");
  redirect(`/wiki/${page.id}`);
}

export async function updateWikiPage(id: string, formData: FormData): Promise<void> {
  await requireSession();
  const title = String(formData.get("title") ?? "").trim() || "Página sin título";
  const icon = String(formData.get("icon") ?? "").trim() || null;
  const content = String(formData.get("content") ?? "");
  await db.wikiPage.update({ where: { id }, data: { title, icon, content } });
  revalidatePath(`/wiki/${id}`);
  revalidatePath("/wiki");
}

export async function deleteWikiPage(id: string): Promise<void> {
  await requireSession();
  await db.wikiPage.delete({ where: { id } });
  revalidatePath("/wiki");
  redirect("/wiki");
}
