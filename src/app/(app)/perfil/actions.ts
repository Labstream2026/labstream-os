"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE, type SessionUser } from "@/lib/session";
import { AVATAR_COLORS } from "@/lib/ui";
import { saveBuffer } from "@/lib/storage";

export type ProfileResult = { ok: boolean; error?: string };

// Vuelve a firmar la cookie de sesión con los datos actuales del usuario.
async function resignSession(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const session: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    title: user.title,
    role: user.role.key,
    perms: user.role.permissions.map((rp) => rp.permission.key),
    initials: user.initials,
    color: user.avatarColor,
    avatarUrl: user.avatarUrl,
  };
  const token = await signSession(session);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

// Subir/actualizar la foto de perfil.
export async function updateMyAvatar(formData: FormData): Promise<ProfileResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Selecciona una imagen" };
  if (!file.type.startsWith("image/")) return { ok: false, error: "El archivo debe ser una imagen" };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "La imagen supera 5MB" };
  const buf = Buffer.from(await file.arrayBuffer());
  await saveBuffer("avatars", session.id, buf);
  const url = `/api/avatar/${session.id}?v=${Date.now()}`;
  await db.user.update({ where: { id: session.id }, data: { avatarUrl: url } });
  await resignSession(session.id);
  revalidatePath("/perfil");
  revalidatePath("/");
  return { ok: true };
}

export async function removeMyAvatar(): Promise<ProfileResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  await db.user.update({ where: { id: session.id }, data: { avatarUrl: null } });
  await resignSession(session.id);
  revalidatePath("/perfil");
  revalidatePath("/");
  return { ok: true };
}

// El usuario edita SU propio perfil (cargo, iniciales, color de avatar). Se guarda en
// la BD (Postgres del NAS) y se re-firma la sesión para que se refleje al instante.
export async function updateMyProfile(formData: FormData): Promise<ProfileResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };

  const title = String(formData.get("title") ?? "").trim().slice(0, 60) || null;
  let initials = String(formData.get("initials") ?? "").trim().toUpperCase().slice(0, 2) || null;
  if (initials && !/^[A-ZÑ0-9]{1,2}$/.test(initials)) initials = session.initials;
  let color = String(formData.get("color") ?? "").trim();
  if (!Object.keys(AVATAR_COLORS).includes(color)) color = session.color ?? "slate";

  await db.user.update({
    where: { id: session.id },
    data: { title, initials, avatarColor: color },
  });
  await resignSession(session.id);

  revalidatePath("/perfil");
  revalidatePath("/");
  return { ok: true };
}
