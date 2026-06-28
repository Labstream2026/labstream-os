import { cache } from "react";
import { db } from "@/lib/db";

// Preferencias PERSONALES de notificación por evento y canal. Por defecto todo activo; en BD solo
// se guardan las filas que se desvían. Se CRUZA con el ajuste global del admin (NotificationSetting)
// en lib/notify: algo llega solo si está activo a nivel global Y del usuario, por canal.
export type NotifChannels = { inApp: boolean; push: boolean; email: boolean };
export const ALL_ON: NotifChannels = { inApp: true, push: true, email: true };

// Preferencia del usuario para un evento (cacheado por petición: notifyAndEmail consulta dos
// veces —in-app y correo— y así no golpea la BD repetido). Sin fila → todo activo.
export const getUserEventPref = cache(async (userId: string, event?: string | null): Promise<NotifChannels> => {
  if (!event) return ALL_ON;
  try {
    const row = await db.userNotificationPref.findUnique({ where: { userId_eventKey: { userId, eventKey: event } } });
    return row ? { inApp: row.inApp, push: row.push, email: row.email } : ALL_ON;
  } catch {
    return ALL_ON;
  }
});

// Prefs de varios usuarios para un evento (para notifyMany). Solo trae los que tienen fila; el
// resto se asume ALL_ON.
export async function getUsersEventPrefs(userIds: string[], event?: string | null): Promise<Map<string, NotifChannels>> {
  const map = new Map<string, NotifChannels>();
  if (!event || !userIds.length) return map;
  try {
    const rows = await db.userNotificationPref.findMany({ where: { userId: { in: userIds }, eventKey: event } });
    for (const r of rows) map.set(r.userId, { inApp: r.inApp, push: r.push, email: r.email });
  } catch {
    /* defaults: mapa vacío = todos activos */
  }
  return map;
}

// Todas las prefs del usuario como mapa eventKey→canales (para la UI del perfil).
export async function getAllUserNotifPrefs(userId: string): Promise<Record<string, NotifChannels>> {
  const out: Record<string, NotifChannels> = {};
  try {
    const rows = await db.userNotificationPref.findMany({ where: { userId } });
    for (const r of rows) out[r.eventKey] = { inApp: r.inApp, push: r.push, email: r.email };
  } catch {
    /* vacío */
  }
  return out;
}
