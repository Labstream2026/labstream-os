"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { NOTIFICATION_EVENT_KEYS } from "@/lib/notification-types";

// Activa/desactiva un TIPO de notificación para todo el equipo. Solo administradores
// (mismo gate que el resto de Configuración: administrar_usuarios; admin pasa por bypass).
// Por defecto todo está activo; aquí solo se persiste lo que el admin toca.
export async function setNotificationTypeEnabled(
  key: string,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_usuarios")) {
    return { ok: false, error: "No autorizado" };
  }
  if (!NOTIFICATION_EVENT_KEYS.has(key)) {
    return { ok: false, error: "Tipo de notificación inválido" };
  }
  await db.notificationSetting.upsert({
    where: { key },
    update: { enabled, updatedById: session.id },
    create: { key, enabled, updatedById: session.id },
  });
  revalidatePath("/configuracion");
  return { ok: true };
}
