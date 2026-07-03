"use server";

import { noAutorizado } from "@/lib/authz-error";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canSeeWiki } from "@/lib/wiki-access";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import type { SessionUser } from "@/lib/session";

// La bóveda de credenciales es de alta sensibilidad: además de ver la Wiki, exige el
// permiso dedicado `ver_contrasenas` para CUALQUIER operación (incluido revelar el
// secreto en claro). Sin esto, cualquier usuario con acceso a la Wiki que sea creador o
// esté en la lista de "viewers" podría descifrar contraseñas saltándose el permiso.
async function ensureInternal(): Promise<SessionUser> {
  const session = await getSession();
  if (!(await canSeeWiki(session)) || !hasPermission(session, "ver_contrasenas")) noAutorizado();
  return session!;
}

// ¿Puede REVELAR esta credencial? Admin siempre, el creador, o quien esté en la lista.
function canView(cred: { createdById: string | null; viewers: { userId: string }[] }, session: SessionUser): boolean {
  if (session.role === "admin") return true;
  if (cred.createdById === session.id) return true;
  return cred.viewers.some((v) => v.userId === session.id);
}
// ¿Puede gestionar (editar/borrar/compartir)? Admin o el creador.
function canManage(cred: { createdById: string | null }, session: SessionUser): boolean {
  return session.role === "admin" || cred.createdById === session.id;
}

export async function createCredential(formData: FormData) {
  const session = await ensureInternal();
  const title = String(formData.get("title") ?? "").trim();
  const secret = String(formData.get("secret") ?? "");
  if (!title || !secret) return;
  await db.credential.create({
    data: {
      title,
      category: String(formData.get("category") ?? "").trim() || null,
      username: String(formData.get("username") ?? "").trim() || null,
      url: String(formData.get("url") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      ownerUserId: String(formData.get("ownerUserId") ?? "") || null,
      createdById: session.id,
      secretEnc: encryptSecret(secret),
    },
  });
  revalidatePath("/wiki/contrasenas");
}

export async function updateCredential(id: string, formData: FormData) {
  const session = await ensureInternal();
  const cred = await db.credential.findUnique({ where: { id }, select: { createdById: true } });
  if (!cred || !canManage(cred, session)) noAutorizado();
  const secret = String(formData.get("secret") ?? "");
  await db.credential.update({
    where: { id },
    data: {
      title: String(formData.get("title") ?? "").trim() || undefined,
      category: String(formData.get("category") ?? "").trim() || null,
      username: String(formData.get("username") ?? "").trim() || null,
      url: String(formData.get("url") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      ownerUserId: String(formData.get("ownerUserId") ?? "") || null,
      ...(secret ? { secretEnc: encryptSecret(secret) } : {}),
    },
  });
  revalidatePath("/wiki/contrasenas");
}

export async function deleteCredential(id: string) {
  const session = await ensureInternal();
  const cred = await db.credential.findUnique({ where: { id }, select: { createdById: true } });
  if (!cred || !canManage(cred, session)) noAutorizado();
  await db.credential.delete({ where: { id } });
  revalidatePath("/wiki/contrasenas");
}

// Devuelve la contraseña en claro SOLO si el usuario puede verla.
export async function revealCredential(id: string): Promise<string> {
  const session = await ensureInternal();
  const cred = await db.credential.findUnique({ where: { id }, select: { secretEnc: true, createdById: true, viewers: { select: { userId: true } } } });
  if (!cred || !canView(cred, session)) noAutorizado();
  return decryptSecret(cred.secretEnc);
}

export async function addCredentialViewer(id: string, userId: string) {
  const session = await ensureInternal();
  const cred = await db.credential.findUnique({ where: { id }, select: { createdById: true } });
  if (!cred || !canManage(cred, session)) noAutorizado();
  await db.credentialViewer.upsert({
    where: { credentialId_userId: { credentialId: id, userId } },
    create: { credentialId: id, userId },
    update: {},
  });
  revalidatePath("/wiki/contrasenas");
}

export async function removeCredentialViewer(id: string, userId: string) {
  const session = await ensureInternal();
  const cred = await db.credential.findUnique({ where: { id }, select: { createdById: true } });
  if (!cred || !canManage(cred, session)) noAutorizado();
  await db.credentialViewer.delete({ where: { credentialId_userId: { credentialId: id, userId } } }).catch(() => null);
  revalidatePath("/wiki/contrasenas");
}
