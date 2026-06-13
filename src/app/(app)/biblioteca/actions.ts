"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Biblioteca del equipo: cualquier usuario con sesión puede añadir; borrar solo
// quien lo subió o un admin.
export async function addLibraryAsset(formData: FormData) {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  if (!name || !url) return;
  const kind = url.includes("drive.google.com") ? "DRIVE" : "LINK";
  await db.libraryAsset.create({
    data: { name, url, category, kind: kind as never, uploadedById: session.id },
  });
  revalidatePath("/biblioteca");
}

export async function deleteLibraryAsset(id: string) {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const asset = await db.libraryAsset.findUnique({ where: { id }, select: { uploadedById: true } });
  if (!asset) return;
  if (session.role !== "admin" && asset.uploadedById !== session.id) throw new Error("No autorizado");
  await db.libraryAsset.delete({ where: { id } });
  revalidatePath("/biblioteca");
}
