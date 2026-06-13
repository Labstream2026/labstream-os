import { db } from "@/lib/db";

// Crea una notificación in-app para un usuario.
export async function notify(
  userId: string | null | undefined,
  n: { type: string; title: string; body?: string; link?: string },
) {
  if (!userId) return;
  await db.notification.create({
    data: { userId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null },
  });
}
