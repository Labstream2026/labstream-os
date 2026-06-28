"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

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
