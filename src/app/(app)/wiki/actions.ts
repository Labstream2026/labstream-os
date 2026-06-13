"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export async function createWikiPage(): Promise<void> {
  const page = await db.wikiPage.create({ data: {} });
  revalidatePath("/wiki");
  redirect(`/wiki/${page.id}`);
}

export async function updateWikiPage(id: string, formData: FormData): Promise<void> {
  const title = String(formData.get("title") ?? "").trim() || "Página sin título";
  const icon = String(formData.get("icon") ?? "").trim() || null;
  const content = String(formData.get("content") ?? "");
  await db.wikiPage.update({ where: { id }, data: { title, icon, content } });
  revalidatePath(`/wiki/${id}`);
  revalidatePath("/wiki");
}

export async function deleteWikiPage(id: string): Promise<void> {
  await db.wikiPage.delete({ where: { id } });
  revalidatePath("/wiki");
  redirect("/wiki");
}
