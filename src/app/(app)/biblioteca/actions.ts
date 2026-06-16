"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { safeExternalUrl } from "@/lib/url";

// Biblioteca del equipo: requiere permiso ver_biblioteca para añadir; borrar solo
// quien lo subió o un admin (además del permiso).
export async function addLibraryAsset(formData: FormData) {
  const session = await getSession();
  if (!hasPermission(session, "ver_biblioteca")) throw new Error("No autorizado");
  const name = String(formData.get("name") ?? "").trim();
  const url = safeExternalUrl(String(formData.get("url") ?? ""));
  const category = String(formData.get("category") ?? "").trim() || null;
  if (!name || !url) return;
  const kind = url.includes("drive.google.com") ? "DRIVE" : "LINK";
  await db.libraryAsset.create({
    data: { name, url, category, kind: kind as never, uploadedById: session!.id },
  });
  revalidatePath("/biblioteca");
}

// Añadir una RUTA del NAS (SMB) para copiar/pegar en el explorador de Windows.
// No es una URL http; se valida de forma laxa (\\servidor\carpeta, smb://… o X:\…).
export async function addLibraryNasPath(formData: FormData) {
  const session = await getSession();
  if (!hasPermission(session, "ver_biblioteca")) throw new Error("No autorizado");
  const name = String(formData.get("name") ?? "").trim();
  const path = String(formData.get("path") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || "NAS";
  if (!name || !path) return;
  const ok = /^(\\\\|smb:\/\/|[a-zA-Z]:\\)/.test(path) && !/^(https?:|javascript:)/i.test(path);
  if (!ok) throw new Error("Ruta de NAS no válida (usa \\\\servidor\\carpeta, smb:// o X:\\)");
  await db.libraryAsset.create({
    data: { name, url: path, category, kind: "NAS" as never, uploadedById: session!.id },
  });
  revalidatePath("/biblioteca");
}

export async function deleteLibraryAsset(id: string) {
  const session = await getSession();
  if (!hasPermission(session, "ver_biblioteca")) throw new Error("No autorizado");
  const asset = await db.libraryAsset.findUnique({ where: { id }, select: { uploadedById: true } });
  if (!asset) return;
  if (session!.role !== "admin" && asset.uploadedById !== session!.id) throw new Error("No autorizado");
  await db.libraryAsset.delete({ where: { id } });
  revalidatePath("/biblioteca");
}
