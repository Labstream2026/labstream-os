"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { AVATAR_COLORS } from "@/lib/ui";

export type ProfileResult = { ok: boolean; error?: string };

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

  const user = await db.user.update({
    where: { id: session.id },
    data: { title, initials, avatarColor: color },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });

  // Re-firmar la sesión con los datos nuevos (sidebar/avatares la usan).
  const token = await signSession({
    id: user.id,
    email: user.email,
    name: user.name,
    title: user.title,
    role: user.role.key,
    perms: user.role.permissions.map((rp) => rp.permission.key),
    initials: user.initials,
    color: user.avatarColor,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  revalidatePath("/perfil");
  revalidatePath("/");
  return { ok: true };
}
