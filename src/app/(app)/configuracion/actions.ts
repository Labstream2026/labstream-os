"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { isEmailEnabled, currentEmailProvider, sendEmail, clearMailConfigCache, emailButton } from "@/lib/email";
import { encryptSecret } from "@/lib/crypto";
import { clearOpenClawCache } from "@/lib/openclaw/config";
import { clearOnlyOfficeCache, getOnlyOfficeConfig } from "@/lib/onlyoffice";
import { askOpenClaw } from "@/lib/openclaw/client";
import { testCaldav } from "@/lib/caldav";
import { syncAllCalendars } from "@/lib/calendar-sync";
import { notifyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
import { permissionLabel, ALL_PERMISSION_KEYS } from "@/lib/permissions";

export type AdminActionResult = { ok: boolean; error?: string };

const ALL_KEYS = new Set(ALL_PERMISSION_KEYS);

async function requireAdmin() {
  const session = await getSession();
  if (!hasPermission(session, "administrar_usuarios")) return null;
  return session!;
}

// Gate más estricto para la edición de roles/permisos: requiere "administrar_roles".
// Quien solo tenga "administrar_usuarios" NO puede tocar definiciones de rol ni
// conceder permisos por usuario (evita escalada a admin). El rol "admin" pasa siempre
// (hasPermission lo deja pasar) y además tiene administrar_roles vía ROLE_DEFAULTS.
async function requireRoleAdmin() {
  const session = await getSession();
  if (!hasPermission(session, "administrar_roles")) return null;
  return session!;
}

// Gate de INTEGRACIONES (correo, OpenClaw/Marcebot, sincronización de calendario): requiere
// "administrar_integraciones". Por defecto solo lo tiene el admin, pero ahora el admin puede
// delegarlo a otro rol y SÍ surtirá efecto (antes estas acciones eran admin-only fijo).
async function requireIntegrations() {
  const session = await getSession();
  if (!hasPermission(session, "administrar_integraciones")) return null;
  return session!;
}

// ── Programación del sondeo de calendarios Synology (planificador en-proceso) ──
// El admin define frecuencia, franja horaria (Bogotá) y días desde Configuración →
// Integraciones; el planificador (calendar-scheduler) lo lee en cada tick.
export async function saveCalendarSyncSettings(input: {
  enabled: boolean;
  everyMinutes: number;
  startHour: number;
  endHour: number;
  workDays: number[];
}): Promise<AdminActionResult> {
  const session = await requireIntegrations();
  if (!session) return { ok: false, error: "No autorizado" };
  const everyMinutes = Math.min(720, Math.max(1, Math.round(input.everyMinutes || 15)));
  const startHour = Math.min(23, Math.max(0, Math.round(input.startHour)));
  const endHour = Math.min(24, Math.max(startHour + 1, Math.round(input.endHour)));
  const days = [...new Set(input.workDays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
  const workDays = (days.length ? days : [0, 1, 2, 3, 4, 5, 6]).join(",");
  await db.calendarSyncSettings.upsert({
    where: { id: "default" },
    create: { id: "default", enabled: input.enabled, everyMinutes, startHour, endHour, workDays },
    update: { enabled: input.enabled, everyMinutes, startHour, endHour, workDays },
  });
  revalidatePath("/configuracion");
  await logActivity({
    action: "calendar.sync_settings",
    summary: input.enabled
      ? `programó el sondeo de calendarios cada ${everyMinutes} min (${startHour}:00–${endHour}:00)`
      : "apagó el sondeo automático de calendarios",
  }).catch(() => null);
  return { ok: true };
}

// clave estable a partir del nombre del rol (slug); evita choques con un sufijo.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Notifica (app + correo) a todos los usuarios ACTIVOS de un rol, salvo al actor.
async function notifyRoleUsers(
  roleId: string,
  actorId: string | undefined,
  n: { type: string; title: string; body?: string; link?: string },
) {
  const users = await db.user.findMany({ where: { roleId, active: true }, select: { id: true } });
  for (const u of users) {
    if (u.id === actorId) continue;
    await notifyAndEmail(u.id, { ...n, actorId, event: "admin_role" });
  }
}

// Guarda la configuración SMTP (Synology MailPlus) desde la UI. La contraseña se cifra;
// si el campo llega vacío se conserva la existente. Tiene prioridad sobre el .env.
export async function saveMailSettings(formData: FormData): Promise<AdminActionResult> {
  const session = await requireIntegrations();
  if (!session) return { ok: false, error: "No autorizado" };

  const enabled = formData.get("enabled") === "on" || formData.get("enabled") === "true";
  const host = String(formData.get("host") ?? "").trim() || null;
  const port = Math.max(1, Math.min(65535, parseInt(String(formData.get("port") ?? "587"), 10) || 587));
  const secure = formData.get("secure") === "on" || formData.get("secure") === "true";
  const username = String(formData.get("username") ?? "").trim() || null;
  const fromName = String(formData.get("fromName") ?? "").trim() || "Labstream OS";
  const fromEmail = String(formData.get("fromEmail") ?? "").trim() || null;
  const rejectUnauthorized = formData.get("rejectUnauthorized") === "on" || formData.get("rejectUnauthorized") === "true";
  const rawPassword = String(formData.get("password") ?? "");
  // Solo se reescribe la contraseña si el admin escribió una nueva (campo no vacío).
  const passwordEnc = rawPassword ? encryptSecret(rawPassword) : undefined;

  if (enabled && (!host || !username)) {
    return { ok: false, error: "Para activarlo necesitas al menos servidor (host) y usuario." };
  }
  // Para activar el envío hace falta una contraseña: o la escribes ahora, o ya había una
  // guardada. Si no, el correo quedaría "activado" pero `getMailConfig` lo descartaría por
  // falta de clave (apagado en silencio). Mejor avisar aquí.
  if (enabled && !passwordEnc) {
    const existing = await db.mailSettings.findUnique({ where: { id: "default" }, select: { passwordEnc: true } });
    if (!existing?.passwordEnc) {
      return { ok: false, error: "Para activarlo escribe la contraseña del buzón." };
    }
  }

  await db.mailSettings.upsert({
    where: { id: "default" },
    create: { id: "default", enabled, host, port, secure, username, fromName, fromEmail, rejectUnauthorized, ...(passwordEnc ? { passwordEnc } : {}) },
    update: { enabled, host, port, secure, username, fromName, fromEmail, rejectUnauthorized, ...(passwordEnc ? { passwordEnc } : {}) },
  });
  clearMailConfigCache();
  await logActivity({ action: "settings.mail", summary: "actualizó la configuración de correo (SMTP)" });
  revalidatePath("/configuracion");
  return { ok: true };
}

// Guarda la conexión con el agente OpenClaw (gateway compatible con OpenAI). El token se
// cifra; si el campo llega vacío se conserva el existente. Limpia la caché al guardar.
export async function saveOpenClawSettings(formData: FormData): Promise<AdminActionResult> {
  const session = await requireIntegrations();
  if (!session) return { ok: false, error: "No autorizado" };

  const enabled = formData.get("enabled") === "on" || formData.get("enabled") === "true";
  const baseUrl = String(formData.get("baseUrl") ?? "").trim().replace(/\/+$/, "") || null;
  const agentModel = String(formData.get("agentModel") ?? "").trim() || "openclaw";
  // Se sanea (trim + comillas envolventes) para no guardar un token con comillas/espacios que
  // luego rompería el header Authorization hacia el gateway y daría un 401 falso.
  const rawToken = String(formData.get("token") ?? "").trim().replace(/^["']+|["']+$/g, "");
  // Solo se reescribe el token si el admin escribió uno nuevo (campo no vacío).
  const tokenEnc = rawToken ? encryptSecret(rawToken) : undefined;

  if (enabled && !baseUrl) {
    return { ok: false, error: "Para activarlo necesitas la URL del gateway (ej. http://192.168.0.4:18789)." };
  }

  await db.openClawSettings.upsert({
    where: { id: "default" },
    create: { id: "default", enabled, baseUrl, agentModel, ...(tokenEnc ? { tokenEnc } : {}) },
    update: { enabled, baseUrl, agentModel, ...(tokenEnc ? { tokenEnc } : {}) },
  });
  clearOpenClawCache();
  await logActivity({ action: "settings.openclaw", summary: "actualizó la conexión con el agente OpenClaw" });
  revalidatePath("/configuracion");
  return { ok: true };
}

// Envía un "ping" al agente para verificar la conexión y devuelve su respuesta.
export async function testOpenClaw(): Promise<AdminActionResult & { reply?: string }> {
  const session = await requireIntegrations();
  if (!session) return { ok: false, error: "No autorizado" };
  clearOpenClawCache(); // leer la config recién guardada
  const r = await askOpenClaw([
    { role: "system", content: "Eres el asistente del equipo de Labstream. Responde en una sola frase." },
    { role: "user", content: "Hola, ¿estás conectado? Confírmalo brevemente." },
  ]);
  return r.ok ? { ok: true, reply: r.reply } : { ok: false, error: r.error };
}

// Guarda la conexión con el Document Server de OnlyOffice. El secreto JWT se cifra; si llega
// vacío se conserva el existente. Limpia la caché al guardar.
export async function saveOnlyOfficeSettings(formData: FormData): Promise<AdminActionResult> {
  const session = await requireIntegrations();
  if (!session) return { ok: false, error: "No autorizado" };

  const enabled = formData.get("enabled") === "on" || formData.get("enabled") === "true";
  const strip = (k: string) => String(formData.get(k) ?? "").trim().replace(/\/+$/, "") || null;
  const docsUrl = strip("docsUrl");
  const callbackBase = strip("callbackBase");
  const internalUrl = strip("internalUrl");
  const rawSecret = String(formData.get("jwtSecret") ?? "");
  const jwtSecretEnc = rawSecret ? encryptSecret(rawSecret) : undefined; // solo si escribió uno nuevo

  if (enabled && !docsUrl) {
    return { ok: false, error: "Para activarlo necesitas la URL pública del Document Server (ej. https://docs.labstreamsas.com)." };
  }

  await db.onlyOfficeSettings.upsert({
    where: { id: "default" },
    create: { id: "default", enabled, docsUrl, callbackBase, internalUrl, ...(jwtSecretEnc ? { jwtSecretEnc } : {}) },
    update: { enabled, docsUrl, callbackBase, internalUrl, ...(jwtSecretEnc ? { jwtSecretEnc } : {}) },
  });
  clearOnlyOfficeCache();
  await logActivity({ action: "settings.onlyoffice", summary: "actualizó la conexión con OnlyOffice" });
  revalidatePath("/configuracion");
  return { ok: true };
}

// Verifica que el Document Server responda (healthcheck) desde el contenedor de la app.
// Prueba la URL interna (si hay) y la pública; cualquiera OK = conectado.
export async function testOnlyOffice(): Promise<AdminActionResult> {
  const session = await requireIntegrations();
  if (!session) return { ok: false, error: "No autorizado" };
  clearOnlyOfficeCache(); // leer la config recién guardada
  const cfg = await getOnlyOfficeConfig();
  if (!cfg.docsUrl) return { ok: false, error: "Falta la URL del Document Server." };
  const targets = [...new Set([cfg.internalUrl, cfg.docsUrl].filter(Boolean))];
  const errors: string[] = [];
  for (const base of targets) {
    try {
      const res = await fetch(`${base}/healthcheck`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      const text = (await res.text().catch(() => "")).trim().toLowerCase();
      if (res.ok && text.includes("true")) return { ok: true };
      errors.push(`${base} → HTTP ${res.status}${text ? ` (${text.slice(0, 40)})` : ""}`);
    } catch (e) {
      errors.push(`${base} → ${e instanceof Error ? e.message : "error de red"}`);
    }
  }
  return { ok: false, error: `El Document Server no respondió. Intentos: ${errors.join(" | ")}.` };
}

// Envía un correo de prueba al propio admin para verificar la config SMTP de Synology.
export async function sendTestEmail(): Promise<AdminActionResult> {
  const session = await requireIntegrations();
  if (!session) return { ok: false, error: "No autorizado" };
  if (!(await isEmailEnabled())) return { ok: false, error: "Correo no configurado (configúralo aquí en Integraciones o vía RESEND_API_KEY / SMTP_*)." };
  if (!session.email) return { ok: false, error: "Tu usuario no tiene correo." };
  const via = (await currentEmailProvider()) === "resend" ? "Resend (API HTTP)" : "SMTP";
  const appUrl = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
  const r = await sendEmail({
    to: session.email,
    subject: "✅ El correo de Labstream OS ya funciona",
    text: `¡Funciona! El envío de correo desde Labstream OS (vía ${via}) está operativo. A partir de ahora el equipo recibirá por correo sus notificaciones de tareas, revisiones y más.\n${appUrl}`,
    html: `<h1 style="margin:0 0 12px;font-size:19px;font-weight:700;color:#111">¡Funciona! ✅</h1>
      <p style="margin:0 0 14px;color:#444;font-size:15px;line-height:1.65">El envío de correo desde <strong>Labstream OS</strong> (vía ${via}) está operativo. A partir de ahora el equipo recibirá por correo sus notificaciones de <strong>tareas, revisiones y avisos del proyecto</strong>.</p>
      ${appUrl ? emailButton("Abrir Labstream OS  →", appUrl) : ""}`,
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// Prueba la conexión al Synology Calendar (CalDAV).
export async function testCalendar(): Promise<AdminActionResult> {
  const session = await requireIntegrations();
  if (!session) return { ok: false, error: "No autorizado" };
  return testCaldav();
}

// Fuerza el sondeo de TODOS los calendarios conectados del equipo (lo que normalmente
// hace el cron cada pocos minutos). Para el panel de Integraciones del admin.
export async function syncAllCalendarsNow(): Promise<{ ok: boolean; error?: string; users?: number; imported?: number; updated?: number; deleted?: number }> {
  const session = await requireIntegrations();
  if (!session) return { ok: false, error: "No autorizado" };
  try {
    const r = await syncAllCalendars();
    revalidatePath("/configuracion");
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "error de sincronización" };
  }
}

// Activar/desactivar un permiso para un rol. El rol "admin" es todopoderoso por
// código (hasPermission lo deja pasar siempre), así que no se edita aquí.
export async function setRolePermission(
  roleId: string,
  permissionKey: string,
  enabled: boolean,
): Promise<AdminActionResult> {
  const session = await requireRoleAdmin();
  if (!session) return { ok: false, error: "No autorizado" };

  const role = await db.role.findUnique({ where: { id: roleId }, select: { key: true, name: true } });
  if (!role) return { ok: false, error: "Rol inexistente" };
  if (role.key === "admin") return { ok: false, error: "El rol Administrador no se edita (acceso total)." };

  // Anti-escalada: un actor que no es admin pleno NO puede editar los permisos de su
  // propio rol (se daría poderes a sí mismo) ni conceder a otro rol un permiso que él
  // mismo no posee (escalada por proxy: crear un rol-títere con más poder del que tiene).
  if (session.role !== "admin") {
    if (role.key === session.role) return { ok: false, error: "No puedes editar los permisos de tu propio rol." };
    if (enabled && !hasPermission(session, permissionKey)) {
      return { ok: false, error: "No puedes conceder un permiso que tú no tienes." };
    }
  }

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
  // Notifica a todos los del rol y registra el cambio (auditoría).
  const label = permissionLabel(permissionKey);
  await notifyRoleUsers(roleId, session.id, {
    type: "role",
    title: `Permisos de tu rol «${role.name}» actualizados`,
    body: `${enabled ? "Se añadió" : "Se quitó"} el permiso: ${label}.`,
    link: "/perfil",
  });
  await logActivity({
    action: "role.permission",
    summary: `${enabled ? "añadió" : "quitó"} el permiso «${label}» ${enabled ? "a" : "de"}l rol «${role.name}»`,
    entityType: "role",
    entityId: roleId,
  });
  revalidatePath("/configuracion");
  return { ok: true };
}

// Cambiar el rol de un usuario. Bajo Authentik la creación es por auto-provisión;
// esta es la palanca para ajustar el rol después.
export async function setUserRole(userId: string, roleKey: string): Promise<AdminActionResult> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "No autorizado" };

  const role = await db.role.findUnique({ where: { key: roleKey }, select: { id: true, name: true } });
  if (!role) return { ok: false, error: "Rol inexistente" };

  // Un actor que NO es admin pleno no puede conceder el rol admin (evita escalada).
  if (session.role !== "admin" && roleKey === "admin") {
    return { ok: false, error: "Solo un administrador puede asignar el rol Administrador." };
  }
  // Un actor que NO es admin pleno no puede cambiarse su propio rol (evita auto-escalada/abuso).
  if (session.role !== "admin" && session.id === userId) {
    return { ok: false, error: "No puedes cambiar tu propio rol." };
  }

  // No permitir que el último admin se quite a sí mismo el rol admin (evita quedarse sin admins).
  if (session.id === userId && session.role === "admin" && roleKey !== "admin") {
    const admins = await db.user.count({ where: { active: true, role: { key: "admin" } } });
    if (admins <= 1) return { ok: false, error: "Eres el único administrador activo." };
  }

  const target = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await db.user.update({ where: { id: userId }, data: { roleId: role.id } });
  // Avisa al usuario y registra el cambio.
  if (userId !== session.id) {
    await notifyAndEmail(userId, {
      type: "role",
      event: "admin_role",
      title: `Tu rol ahora es «${role.name}»`,
      body: "Un administrador actualizó tu rol. Tus permisos se aplicaron de inmediato.",
      link: "/perfil",
      actorId: session.id,
    });
  }
  await logActivity({
    action: "user.role",
    summary: `cambió el rol de ${target?.name ?? "un usuario"} a «${role.name}»`,
    entityType: "user",
    entityId: userId,
  });
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
  const tActive = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await logActivity({
    action: active ? "user.activate" : "user.deactivate",
    summary: `${active ? "activó" : "desactivó"} a ${tActive?.name ?? "un usuario"}`,
    entityType: "user",
    entityId: userId,
  });
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
  await logActivity({
    action: "user.delete",
    summary: `eliminó al usuario ${target.name}`,
    entityType: "user",
    entityId: userId,
  });
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
  const tGuest = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await logActivity({
    action: "user.guest",
    summary: `${isGuest ? "marcó como invitado" : "quitó el estado de invitado"} a ${tGuest?.name ?? "un usuario"}`,
    entityType: "user",
    entityId: userId,
  });
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

// Limpia nombres con sufijo de cargo ("Nombre Apellido - Cargo"): deja solo el nombre y mueve el
// cargo al campo «título» (solo si estaba vacío, para no pisar títulos existentes). Solo admin,
// idempotente (no hace nada si el nombre ya está limpio).
export async function cleanupUserNames(): Promise<AdminActionResult & { updated?: number }> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "No autorizado" };
  const users = await db.user.findMany({ where: { isSystemBot: false }, select: { id: true, name: true, title: true } });
  let updated = 0;
  for (const u of users) {
    const m = u.name.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (!m) continue;
    const name = m[1].trim();
    const role = m[2].trim();
    if (!name || name === u.name) continue;
    await db.user.update({ where: { id: u.id }, data: { name, ...(u.title?.trim() ? {} : { title: role }) } });
    updated++;
  }
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  await logActivity({ action: "users.cleanup", summary: `limpió ${updated} nombre(s) de usuario (movió el cargo al título)` }).catch(() => null);
  return { ok: true, updated };
}

// Define cómo saluda Marcebot a la persona: "M" (muchacho) | "F" (muchacha) | null.
export async function setUserGender(userId: string, gender: string | null): Promise<AdminActionResult> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "No autorizado" };
  const value = gender === "M" || gender === "F" ? gender : null;
  await db.user.update({ where: { id: userId }, data: { gender: value } });
  revalidatePath("/configuracion");
  return { ok: true };
}

// Vincula el número de WhatsApp de un usuario y si puede COMANDAR al agente desde WhatsApp.
// El número se guarda como solo dígitos (con indicativo, p. ej. 57300…); el webhook compara
// normalizando ambos lados, así que el formato exacto no importa. Sin número no se puede
// comandar (se fuerza command=false), porque el agente identifica a la persona por su número.
export async function setUserWhatsapp(
  userId: string,
  phone: string | null,
  command: boolean,
): Promise<AdminActionResult> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "No autorizado" };
  const digits = (phone ?? "").replace(/\D/g, "");
  const whatsappPhone = digits.length >= 7 ? digits : null; // mínimo razonable; vacío → desvincula
  if (phone && phone.trim() && !whatsappPhone) {
    return { ok: false, error: "Número inválido. Usa solo dígitos con indicativo, p. ej. 57300…" };
  }
  // Si no hay número, no puede comandar (el agente no podría identificarlo).
  const whatsappCommand = whatsappPhone ? !!command : false;
  // Evita que dos usuarios queden con el mismo número (el webhook elegiría a uno arbitrario).
  if (whatsappPhone) {
    const clash = await db.user.findFirst({
      where: { id: { not: userId }, whatsappPhone },
      select: { name: true },
    });
    if (clash) return { ok: false, error: `Ese número ya está vinculado a ${clash.name}.` };
  }
  await db.user.update({ where: { id: userId }, data: { whatsappPhone, whatsappCommand } });
  revalidatePath("/configuracion");
  return { ok: true };
}

// Configuración de Marcebot: encendido, días laborales (0=Dom … 6=Sáb) y franja horaria.
export async function setMarcebotConfig(input: {
  enabled: boolean;
  workDays: number[];
  startHour: number;
  lastHour: number;
}): Promise<AdminActionResult> {
  const session = await requireIntegrations();
  if (!session) return { ok: false, error: "No autorizado" };
  const days = [...new Set((input.workDays ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
  if (!days.length) return { ok: false, error: "Elige al menos un día laboral." };
  const clamp = (n: number) => Math.max(0, Math.min(23, Math.round(Number(n) || 0)));
  const startHour = clamp(input.startHour);
  const lastHour = clamp(input.lastHour);
  if (lastHour < startHour) return { ok: false, error: "La última hora debe ser igual o mayor que la de inicio." };
  const data = { enabled: !!input.enabled, workDays: days.join(","), startHour, lastHour };
  await db.marcebotConfig.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── Roles personalizables (CRUD) ──

// Crea un rol nuevo. Opcionalmente copia los permisos de un rol existente (copyFromKey).
export async function createRole(formData: FormData): Promise<AdminActionResult> {
  const session = await requireRoleAdmin();
  if (!session) return { ok: false, error: "No autorizado" };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "El nombre es obligatorio." };
  const description = String(formData.get("description") ?? "").trim() || null;
  const emoji = String(formData.get("emoji") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  const copyFromKey = String(formData.get("copyFromKey") ?? "").trim();

  // Clave única: slug del nombre + sufijo si choca.
  let key = slugify(name) || "rol";
  if (await db.role.findUnique({ where: { key }, select: { id: true } })) {
    key = `${key}-${Date.now().toString(36).slice(-4)}`;
  }
  const role = await db.role.create({
    data: { key, name, description, emoji, color, isSystem: false },
  });
  // Copiar permisos del rol de origen (si se indicó).
  if (copyFromKey) {
    const src = await db.role.findUnique({
      where: { key: copyFromKey },
      select: { key: true, permissions: { select: { permissionId: true } } },
    });
    if (src) {
      const perms = src.key === "admin"
        ? await db.permission.findMany({ select: { id: true } })
        : src.permissions.map((p) => ({ id: p.permissionId }));
      if (perms.length) {
        await db.rolePermission.createMany({
          data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
          skipDuplicates: true,
        });
      }
    }
  }
  await logActivity({ action: "role.create", summary: `creó el rol «${name}»`, entityType: "role", entityId: role.id });
  revalidatePath("/configuracion");
  return { ok: true };
}

// Edita nombre, descripción, emoji y color de un rol (incl. los del sistema).
export async function updateRole(roleId: string, formData: FormData): Promise<AdminActionResult> {
  const session = await requireRoleAdmin();
  if (!session) return { ok: false, error: "No autorizado" };
  const role = await db.role.findUnique({ where: { id: roleId }, select: { name: true } });
  if (!role) return { ok: false, error: "Rol inexistente" };
  const name = String(formData.get("name") ?? "").trim() || role.name;
  const description = String(formData.get("description") ?? "").trim() || null;
  const emoji = String(formData.get("emoji") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  await db.role.update({ where: { id: roleId }, data: { name, description, emoji, color } });
  await logActivity({ action: "role.update", summary: `editó el rol «${name}»`, entityType: "role", entityId: roleId });
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

// Elimina un rol creado por el admin. Los roles del sistema no se borran. Los usuarios
// que tuvieran el rol se reasignan al rol indicado (reassignToKey).
export async function deleteRole(roleId: string, reassignToKey: string): Promise<AdminActionResult> {
  const session = await requireRoleAdmin();
  if (!session) return { ok: false, error: "No autorizado" };
  const role = await db.role.findUnique({ where: { id: roleId }, select: { key: true, name: true, isSystem: true } });
  if (!role) return { ok: true };
  if (role.isSystem) return { ok: false, error: "Los roles del sistema no se pueden eliminar." };
  const fallback = await db.role.findUnique({ where: { key: reassignToKey }, select: { id: true, name: true } });
  if (!fallback || reassignToKey === role.key) return { ok: false, error: "Elige un rol válido al que reasignar." };

  // Reasigna y avisa a los afectados.
  const affected = await db.user.findMany({ where: { roleId }, select: { id: true } });
  await db.user.updateMany({ where: { roleId }, data: { roleId: fallback.id } });
  for (const u of affected) {
    if (u.id === session.id) continue;
    await notifyAndEmail(u.id, {
      type: "role",
      event: "admin_role",
      title: `Tu rol cambió a «${fallback.name}»`,
      body: `El rol «${role.name}» se eliminó; tu cuenta se reasignó a «${fallback.name}».`,
      link: "/perfil",
      actorId: session.id,
    });
  }
  await db.role.delete({ where: { id: roleId } });
  await logActivity({ action: "role.delete", summary: `eliminó el rol «${role.name}» (reasignó a «${fallback.name}»)`, entityType: "role" });
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true };
}

// Lee el estado de permisos de un usuario para el editor de overrides.
export async function getUserPermissionState(userId: string): Promise<{
  ok: boolean;
  error?: string;
  isAdmin?: boolean;
  roleName?: string;
  rolePerms?: string[];
  overrides?: Record<string, boolean>;
}> {
  const session = await requireAdmin();
  if (!session) return { ok: false, error: "No autorizado" };
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: { select: { key: true, name: true, permissions: { select: { permission: { select: { key: true } } } } } },
      permissionOverrides: { select: { permissionKey: true, granted: true } },
    },
  });
  if (!user) return { ok: false, error: "Usuario inexistente" };
  const isAdmin = user.role.key === "admin";
  const rolePerms = isAdmin ? [...ALL_KEYS] : user.role.permissions.map((rp) => rp.permission.key);
  const overrides: Record<string, boolean> = {};
  for (const o of user.permissionOverrides) overrides[o.permissionKey] = o.granted;
  return { ok: true, isAdmin, roleName: user.role.name, rolePerms, overrides };
}

// ── Permisos por usuario (overrides sobre su rol) ──
// state: "grant" (conceder extra) | "revoke" (quitar) | "inherit" (volver al rol).
export async function setUserPermissionOverride(
  userId: string,
  permissionKey: string,
  state: "grant" | "revoke" | "inherit",
): Promise<AdminActionResult> {
  const session = await requireRoleAdmin();
  if (!session) return { ok: false, error: "No autorizado" };
  if (!ALL_KEYS.has(permissionKey)) return { ok: false, error: "Permiso desconocido." };

  // Anti-escalada: un actor que no es admin pleno NO puede modificar sus propios permisos
  // (se concedería extras a sí mismo) ni conceder a otro un permiso que él mismo no posee.
  if (session.role !== "admin") {
    if (userId === session.id) return { ok: false, error: "No puedes modificar tus propios permisos." };
    if (state === "grant" && !hasPermission(session, permissionKey)) {
      return { ok: false, error: "No puedes conceder un permiso que tú no tienes." };
    }
  }

  if (state === "inherit") {
    await db.userPermission
      .delete({ where: { userId_permissionKey: { userId, permissionKey } } })
      .catch((e: { code?: string }) => { if (e?.code !== "P2025") throw e; });
  } else {
    const granted = state === "grant";
    await db.userPermission.upsert({
      where: { userId_permissionKey: { userId, permissionKey } },
      create: { userId, permissionKey, granted },
      update: { granted },
    });
  }
  const label = permissionLabel(permissionKey);
  const target = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (userId !== session.id && state !== "inherit") {
    await notifyAndEmail(userId, {
      type: "role",
      event: "admin_role",
      title: state === "grant" ? `Permiso concedido: ${label}` : `Permiso retirado: ${label}`,
      body: state === "grant" ? "Un administrador te concedió un permiso adicional." : "Un administrador te retiró un permiso.",
      link: "/perfil",
      actorId: session.id,
    });
  }
  await logActivity({
    action: "user.permission",
    summary: `${state === "grant" ? "concedió" : state === "revoke" ? "revocó" : "restableció"} «${label}» ${state === "inherit" ? "en" : "a"} ${target?.name ?? "un usuario"}`,
    entityType: "user",
    entityId: userId,
  });
  revalidatePath("/configuracion");
  return { ok: true };
}
