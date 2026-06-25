"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { generateApiKey } from "@/lib/api-key";
import { ALL_PERMISSION_KEYS } from "@/lib/permissions";

type Result = { ok: boolean; error?: string };

// Crea una credencial de API. Devuelve el SECRETO EN CLARO UNA sola vez (no se puede recuperar).
// Solo administradores de integraciones.
export async function createAppKey(formData: FormData): Promise<Result & { secret?: string; prefix?: string }> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_integraciones")) return { ok: false, error: "No autorizado" };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Falta el nombre de la credencial." };
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { ok: false, error: "Elige el usuario titular (define el techo de permisos)." };
  const user = await db.user.findUnique({ where: { id: userId }, select: { active: true } });
  if (!user?.active) return { ok: false, error: "El usuario titular no existe o está inactivo." };

  const readOnly = String(formData.get("readOnly") ?? "") === "1";
  // Scopes: subconjunto válido del catálogo; vacío = hereda todos los permisos del usuario.
  const scopes = formData.getAll("scopes").map(String).filter((s) => ALL_PERMISSION_KEYS.includes(s));
  const rateRaw = Number(formData.get("rateLimitPerMin"));
  const rateLimitPerMin = Number.isFinite(rateRaw) && rateRaw > 0 ? Math.min(6000, Math.round(rateRaw)) : 120;

  const gen = generateApiKey();
  await db.appKey.create({
    data: {
      name,
      prefixVisible: gen.prefixVisible,
      secretHash: gen.secretHash,
      scopes,
      readOnly,
      userId,
      createdById: session.id,
      rateLimitPerMin,
    },
  });
  await logActivity({ action: "apikey.create", summary: `creó la credencial de API «${name}»`, entityType: "appkey" });
  revalidatePath("/configuracion");
  // El secreto solo se devuelve aquí; nunca más se puede leer.
  return { ok: true, secret: gen.raw, prefix: gen.prefixVisible };
}

// Revoca (desactiva) una credencial al instante.
export async function revokeAppKey(keyId: string): Promise<Result> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_integraciones")) return { ok: false, error: "No autorizado" };
  const key = await db.appKey.findUnique({ where: { id: keyId }, select: { name: true, revoked: true } });
  if (!key) return { ok: false, error: "No existe." };
  if (!key.revoked) {
    await db.appKey.update({ where: { id: keyId }, data: { revoked: true, revokedAt: new Date() } });
    await logActivity({ action: "apikey.revoke", summary: `revocó la credencial de API «${key.name}»`, entityType: "appkey" });
    revalidatePath("/configuracion");
  }
  return { ok: true };
}

// Borra definitivamente una credencial revocada (limpieza). Solo admin de integraciones.
export async function deleteAppKey(keyId: string): Promise<Result> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_integraciones")) return { ok: false, error: "No autorizado" };
  await db.appKey.delete({ where: { id: keyId } }).catch(() => {});
  revalidatePath("/configuracion");
  return { ok: true };
}

// Crea un USUARIO DE SERVICIO (no-SSO) para ser el titular de una key del gateway. No inicia
// sesión por navegador; solo sirve como techo de permisos para credenciales. Gestión de usuarios.
export async function createServiceUser(formData: FormData): Promise<Result & { userId?: string }> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_usuarios")) return { ok: false, error: "No autorizado" };
  const name = String(formData.get("name") ?? "").trim();
  const roleKey = String(formData.get("roleKey") ?? "").trim();
  if (!name) return { ok: false, error: "Falta el nombre del usuario de servicio." };
  const role = await db.role.findUnique({ where: { key: roleKey }, select: { id: true } });
  if (!role) return { ok: false, error: "Rol inválido." };
  // Email sintético único (no recibe correo ni inicia sesión).
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 32) || "servicio";
  const email = `svc-${slug}-${Date.now().toString(36)}@servicio.labstream`;
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "SV";
  const user = await db.user.create({
    data: { email, name, initials, avatarColor: "slate", active: true, role: { connect: { id: role.id } } },
    select: { id: true },
  });
  await logActivity({ action: "user.service.create", summary: `creó el usuario de servicio «${name}»`, entityType: "user", entityId: user.id });
  revalidatePath("/configuracion");
  return { ok: true, userId: user.id };
}
