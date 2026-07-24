"use server";

import { noAutorizado } from "@/lib/authz-error";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { safeExternalUrl } from "@/lib/url";

// Biblioteca del equipo: añadir/editar/fijar requiere gestionar_biblioteca; borrar también
// puede el propio dueño del recurso. Ver requiere ver_biblioteca (lo controla la página).

// Ruta de NAS válida: \\servidor\carpeta, smb://… o X:\… (nunca http/js).
function validNasPath(path: string): boolean {
  return /^(\\\\|smb:\/\/|[a-zA-Z]:\\)/.test(path) && !/^(https?:|javascript:)/i.test(path);
}

// Normaliza el vínculo opcional a proyecto/cliente: "" → null; si el id no existe, null
// (mejor perder el chip que reventar el alta por un id viejo).
async function resolveLinks(formData: FormData): Promise<{ projectId: string | null; clientId: string | null }> {
  const rawProject = String(formData.get("projectId") ?? "").trim();
  const rawClient = String(formData.get("clientId") ?? "").trim();
  let projectId: string | null = null;
  let clientId: string | null = null;
  if (rawProject) {
    const p = await db.project.findUnique({ where: { id: rawProject }, select: { id: true } });
    projectId = p?.id ?? null;
  }
  if (rawClient) {
    const c = await db.client.findUnique({ where: { id: rawClient }, select: { id: true } });
    clientId = c?.id ?? null;
  }
  return { projectId, clientId };
}

export async function addLibraryAsset(formData: FormData) {
  const session = await getSession();
  if (!hasPermission(session, "gestionar_biblioteca")) noAutorizado();
  const name = String(formData.get("name") ?? "").trim();
  const url = safeExternalUrl(String(formData.get("url") ?? ""));
  const category = String(formData.get("category") ?? "").trim() || null;
  if (!name || !url) return;
  const { projectId, clientId } = await resolveLinks(formData);
  const kind = url.includes("drive.google.com") ? "DRIVE" : "LINK";
  await db.libraryAsset.create({
    data: { name, url, category, kind: kind as never, uploadedById: session!.id, projectId, clientId },
  });
  revalidatePath("/biblioteca");
}

// Añadir una RUTA del NAS (SMB) para copiar/pegar en el explorador de Windows.
// No es una URL http; se valida de forma laxa (\\servidor\carpeta, smb://… o X:\…).
export async function addLibraryNasPath(formData: FormData) {
  const session = await getSession();
  if (!hasPermission(session, "gestionar_biblioteca")) noAutorizado();
  const name = String(formData.get("name") ?? "").trim();
  const path = String(formData.get("path") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || "NAS";
  if (!name || !path) return;
  if (!validNasPath(path)) throw new Error("Ruta de NAS no válida (usa \\\\servidor\\carpeta, smb:// o X:\\)");
  const { projectId, clientId } = await resolveLinks(formData);
  await db.libraryAsset.create({
    data: { name, url: path, category, kind: "NAS" as never, uploadedById: session!.id, projectId, clientId },
  });
  revalidatePath("/biblioteca");
}

// Editar EN SITIO (antes no existía: un tipeo obligaba a borrar y recrear).
export async function updateLibraryAsset(id: string, formData: FormData) {
  const session = await getSession();
  if (!session) noAutorizado();
  const asset = await db.libraryAsset.findUnique({
    where: { id },
    select: { uploadedById: true, kind: true },
  });
  if (!asset) return;
  if (!hasPermission(session, "gestionar_biblioteca") && asset.uploadedById !== session.id) noAutorizado();

  const name = String(formData.get("name") ?? "").trim();
  const rawUrl = String(formData.get("url") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || null;
  if (!name || !rawUrl) return;

  let url: string | null;
  if (asset.kind === "NAS") {
    if (!validNasPath(rawUrl)) throw new Error("Ruta de NAS no válida (usa \\\\servidor\\carpeta, smb:// o X:\\)");
    url = rawUrl;
  } else {
    url = safeExternalUrl(rawUrl);
    if (!url) return;
  }
  const { projectId, clientId } = await resolveLinks(formData);
  // Si cambia el dominio, Drive/enlace se recalcula (la ruta NAS conserva su tipo).
  const kind = asset.kind === "NAS" ? "NAS" : url.includes("drive.google.com") ? "DRIVE" : "LINK";
  await db.libraryAsset.update({
    where: { id },
    data: { name, url, category, projectId, clientId, kind: kind as never },
  });
  revalidatePath("/biblioteca");
}

// Fijar/soltar: los fijados encabezan la Biblioteca.
export async function toggleLibraryPin(id: string) {
  const session = await getSession();
  if (!hasPermission(session, "gestionar_biblioteca")) noAutorizado();
  const asset = await db.libraryAsset.findUnique({ where: { id }, select: { pinned: true } });
  if (!asset) return;
  await db.libraryAsset.update({ where: { id }, data: { pinned: !asset.pinned } });
  revalidatePath("/biblioteca");
}

export async function deleteLibraryAsset(id: string) {
  const session = await getSession();
  if (!session) noAutorizado();
  const asset = await db.libraryAsset.findUnique({ where: { id }, select: { uploadedById: true } });
  if (!asset) return;
  // Borra quien gestiona la biblioteca, o el propio dueño del recurso.
  if (!hasPermission(session, "gestionar_biblioteca") && asset.uploadedById !== session.id) noAutorizado();
  await db.libraryAsset.delete({ where: { id } });
  revalidatePath("/biblioteca");
}
