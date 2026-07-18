"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { utcFromBogota, bogotaYmd, ymdPlus } from "@/lib/reminder-schedule";

export async function markAllNotificationsRead() {
  const session = await getSession();
  if (!session) return;
  await db.notification.updateMany({ where: { userId: session.id, read: false }, data: { read: true } });
}

export async function markNotificationRead(id: string) {
  const session = await getSession();
  if (!session) return;
  await db.notification.updateMany({ where: { id, userId: session.id }, data: { read: true } });
}

// Borra una notificación del usuario (deslizar/borrar en la campana). updateMany→deleteMany
// con el userId en el where: nunca borra notificaciones de otra persona.
export async function deleteNotification(id: string) {
  const session = await getSession();
  if (!session) return;
  await db.notification.deleteMany({ where: { id, userId: session.id } });
}

// ── No molestar (silencio temporal) ──
// Silencia push y correo hasta un instante; la campana in-app sigue acumulando. "off" lo apaga.
export type DndKind = "30m" | "1h" | "untilTomorrow" | "off";
export async function setDoNotDisturb(kind: DndKind): Promise<{ ok: boolean; until: string | null }> {
  const session = await getSession();
  if (!session) return { ok: false, until: null };
  const now = new Date();
  let until: Date | null;
  if (kind === "off") until = null;
  else if (kind === "30m") until = new Date(now.getTime() + 30 * 60_000);
  else if (kind === "1h") until = new Date(now.getTime() + 3_600_000);
  else until = utcFromBogota(ymdPlus(bogotaYmd(now), 1), "07:00"); // mañana 7:00 Bogotá
  await db.user.update({ where: { id: session.id }, data: { dndUntil: until } });
  return { ok: true, until: until?.toISOString() ?? null };
}

// Horario silencioso recurrente (horas de pared de Bogotá 0–23). null/null lo desactiva.
export async function setQuietHours(start: number | null, end: number | null): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const clamp = (h: number | null) => (h == null || !Number.isInteger(h) || h < 0 || h > 23 ? null : h);
  const s = clamp(start);
  const e = clamp(end);
  await db.user.update({ where: { id: session.id }, data: { quietStart: s, quietEnd: e } });
  return { ok: true };
}

// Silenciar / reactivar un proyecto o persona (deja de mandar sus avisos). Idempotente.
export async function toggleNotificationMute(kind: "project" | "user", targetId: string, on: boolean): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session || (kind !== "project" && kind !== "user") || !targetId) return { ok: false };
  if (on) {
    await db.notificationMute.upsert({
      where: { userId_kind_targetId: { userId: session.id, kind, targetId } },
      create: { userId: session.id, kind, targetId },
      update: {},
    });
  } else {
    await db.notificationMute.deleteMany({ where: { userId: session.id, kind, targetId } });
  }
  return { ok: true };
}
