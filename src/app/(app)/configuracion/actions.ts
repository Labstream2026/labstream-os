"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { emailEnabled, sendEmail } from "@/lib/email";
import { testCaldav } from "@/lib/caldav";

export type AdminActionResult = { ok: boolean; error?: string };

async function requireAdmin() {
  const session = await getSession();
  if (!hasPermission(session, "administrar_usuarios")) return null;
  return session!;
}

// Envía un correo de prueba al propio admin para verificar la config SMTP de Synology.
export async function sendTestEmail(): Promise<AdminActionResult> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "No autorizado" };
  if (!emailEnabled) return { ok: false, error: "SMTP no configurado (faltan SMTP_HOST/USER/PASSWORD)." };
  if (!session.email) return { ok: false, error: "Tu usuario no tiene correo." };
  const r = await sendEmail({
    to: session.email,
    subject: "Correo de prueba · Labstream OS",
    text: "Funciona ✅ El envío de correo desde Labstream OS (Synology MailPlus) está operativo.",
    html: "<p>Funciona ✅</p><p>El envío de correo desde Labstream OS (Synology MailPlus) está operativo.</p>",
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// Prueba la conexión al Synology Calendar (CalDAV).
export async function testCalendar(): Promise<AdminActionResult> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "No autorizado" };
  return testCaldav();
}

// Activar/desactivar un permiso para un rol. El rol "admin" es todopoderoso por
// código (hasPermission lo deja pasar siempre), así que no se edita aquí.
export async function setRolePermission(
  roleId: string,
  permissionKey: string,
  enabled: boolean,
): Promise<AdminActionResult> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "No autorizado" };

  const role = await db.role.findUnique({ where: { id: roleId }, select: { key: true } });
  if (!role) return { ok: false, error: "Rol inexistente" };
  if (role.key === "admin") return { ok: false, error: "El rol Administrador no se edita (acceso total)." };

  const perm = await db.permission.findUnique({ where: { key: permissionKey }, select: { id: true } });
  if (!perm) return { ok: false, error: "Permiso inexistente" };

  if (enabled) {
    await db.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId: perm.id } },
      create: { roleId, permissionId: perm.id },
      update: {},
    });
  } else {
    await db.rolePermission
      .delete({ where: { roleId_permissionId: { roleId, permissionId: perm.id } } })
      .catch((e: { code?: string }) => {
        if (e?.code !== "P2025") throw e;
      });
  }
  revalidatePath("/configuracion");
  return { ok: true };
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

// Borra un usuario por completo. Sus pertenencias (miembros de proyecto/cliente/
// canal, reacciones, votos, notificaciones, asistencias) se borran en cascada; el
// contenido en propiedad (tareas, archivos, mensajes) queda con autor nulo. No se
// puede borrar la propia cuenta ni al último administrador activo.
export async function deleteUser(userId: string): Promise<AdminActionResult> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "No autorizado" };
  if (session.id === userId) return { ok: false, error: "No puedes borrar tu propia cuenta." };
  const target = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!target) return { ok: true };
  if (target.role.key === "admin") {
    const admins = await db.user.count({ where: { active: true, role: { key: "admin" } } });
    if (admins <= 1) return { ok: false, error: "Es el único administrador activo." };
  }
  await db.user.delete({ where: { id: userId } });
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

// Marca/desmarca a un usuario como invitado: pierde acceso a la Wiki (documentación,
// inventario, ubicación y contraseñas) y a sus enlaces, aunque sea del equipo.
export async function setUserGuest(userId: string, isGuest: boolean): Promise<AdminActionResult> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "No autorizado" };
  await db.user.update({ where: { id: userId }, data: { isGuest } });
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}
