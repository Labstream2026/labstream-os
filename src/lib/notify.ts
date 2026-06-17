import { db } from "@/lib/db";
import { emailEnabled, sendEmail } from "@/lib/email";

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

// Notifica en la app Y por correo (si SMTP está configurado). Best-effort.
const APP_URL = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
export async function notifyAndEmail(
  userId: string | null | undefined,
  n: { type: string; title: string; body?: string; link?: string },
) {
  if (!userId) return;
  await notify(userId, n);
  if (!emailEnabled) return;
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user?.email) return;
    const url = n.link ? `${APP_URL}${n.link}` : APP_URL;
    const html = `<p>Hola ${user.name},</p><p><strong>${n.title}</strong></p>${
      n.body ? `<p>${n.body}</p>` : ""
    }<p><a href="${url}">Abrir en Labstream OS</a></p>`;
    await sendEmail({ to: user.email, subject: n.title, html, text: `${n.title}\n${n.body ?? ""}\n${url}` });
  } catch {
    /* el correo es secundario, no rompemos la acción */
  }
}

// Notifica SOLO en la app (sin correo) a varios usuarios, sin duplicar. Para eventos
// frecuentes/de bajo nivel (p. ej. «se marcó un cambio como hecho») donde mandar correo
// a todo el equipo en cada acción sería ruido.
export async function notifyMany(
  userIds: Array<string | null | undefined>,
  n: { type: string; title: string; body?: string; link?: string },
) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null })),
  });
}

// Notifica en la app Y por correo a VARIOS usuarios (sin duplicar). Best-effort.
// Útil para avisar a todo el equipo de un proyecto (p. ej. «el cliente pidió cambios»).
export async function notifyManyAndEmail(
  userIds: Array<string | null | undefined>,
  n: { type: string; title: string; body?: string; link?: string },
) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  await Promise.all(ids.map((id) => notifyAndEmail(id, n)));
}
