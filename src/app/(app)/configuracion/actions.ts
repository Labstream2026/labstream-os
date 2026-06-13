"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";

export type AdminActionResult = { ok: boolean; error?: string };

async function requireAdmin() {
  const session = await getSession();
  if (!hasPermission(session, "administrar_usuarios")) return null;
  return session!;
}

// Cambiar el rol de un usuario. Bajo Authentik la creación es por auto-provisión;
// esta es la palanca para ajustar el rol después.
export async function setUserRole(userId: string, roleKey: string): Promise<AdminActionResult> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "No autorizado" };

  const role = await db.role.findUnique({ where: { key: roleKey } });
  if (!role) return { ok: false, error: "Rol inexistente" };

  // No permitir que el último admin se quite a sí mismo el rol admin (evita quedarse sin admins).
  if (session.id === userId && session.role === "admin" && roleKey !== "admin") {
    const admins = await db.user.count({ where: { active: true, role: { key: "admin" } } });
    if (admins <= 1) return { ok: false, error: "Eres el único administrador activo." };
  }

  await db.user.update({ where: { id: userId }, data: { roleId: role.id } });
  revalidatePath("/configuracion");
  return { ok: true };
}

// Activar / desactivar un usuario. Un usuario inactivo no puede iniciar sesión
// (lo bloquean tanto el login por contraseña como el callback de Authentik).
export async function setUserActive(userId: string, active: boolean): Promise<AdminActionResult> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "No autorizado" };

  // No permitir desactivarse a sí mismo (evita auto-bloqueo).
  if (session.id === userId && !active) {
    return { ok: false, error: "No puedes desactivar tu propia cuenta." };
  }
  // No desactivar al último admin activo.
  if (!active) {
    const target = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (target?.role.key === "admin") {
      const admins = await db.user.count({ where: { active: true, role: { key: "admin" } } });
      if (admins <= 1) return { ok: false, error: "Es el único administrador activo." };
    }
  }

  await db.user.update({ where: { id: userId }, data: { active } });
  revalidatePath("/configuracion");
  return { ok: true };
}
