import { db } from "@/lib/db";
import { publishMessage } from "@/lib/chat-bus";
import { notify } from "@/lib/notify";
import { sendEmail, emailButton } from "@/lib/email";

const APP_URL = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Usuario de sistema que encarna a Marcebot en el chat. No inicia sesión nunca
// (sin passwordHash y con el dominio .local que el SSO no aprovisiona) y se marca
// `active: false` + `isSystemBot: true` para que quede fuera de todos los listados de
// equipo sin tener que tocar cada consulta. Sus DMs igual se renderizan porque la
// lista de chats deriva al "otro" desde los miembros del canal, sin filtrar por activo.

export const MARCEBOT_EMAIL = "marcebot@labstream.local";
export const MARCEBOT_NAME = "Marcebot";

export type BotUser = { id: string; name: string };

// Crea (o repara) el usuario Marcebot. Idempotente.
export async function ensureMarcebot(): Promise<BotUser> {
  const existing = await db.user.findUnique({ where: { email: MARCEBOT_EMAIL }, select: { id: true, name: true, isSystemBot: true } });
  if (existing) {
    if (!existing.isSystemBot) {
      await db.user.update({ where: { id: existing.id }, data: { isSystemBot: true, active: false } });
    }
    return { id: existing.id, name: existing.name };
  }
  // Necesita un rol (la relación es obligatoria); cualquiera sirve, nunca autentica.
  const role = (await db.role.findUnique({ where: { key: "editor" }, select: { id: true } })) ?? (await db.role.findFirst({ select: { id: true } }));
  if (!role) throw new Error("No hay roles disponibles para crear a Marcebot");
  const bot = await db.user.create({
    data: {
      email: MARCEBOT_EMAIL,
      name: MARCEBOT_NAME,
      title: "Asistente del equipo",
      initials: "🤖",
      avatarColor: "orange",
      active: false,
      isSystemBot: true,
      roleId: role.id,
    },
    select: { id: true, name: true },
  });
  return bot;
}

// Localiza (o crea) el canal DIRECT entre el bot y un usuario.
async function getOrCreateDM(botId: string, userId: string, userName: string): Promise<string> {
  const existing = await db.chatChannel.findFirst({
    where: {
      type: "DIRECT",
      AND: [{ members: { some: { userId: botId } } }, { members: { some: { userId } } }],
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  const channel = await db.chatChannel.create({
    data: {
      type: "DIRECT",
      name: userName,
      isPublic: false,
      members: { create: [{ userId: botId }, { userId }] },
    },
    select: { id: true },
  });
  return channel.id;
}

// Envía un DM de Marcebot a un usuario: inserta el mensaje, lo emite en tiempo real
// y crea la notificación in-app (sin correo, para no saturar cada hora).
export async function sendBotDM(bot: BotUser, userId: string, userName: string, body: string): Promise<void> {
  const channelId = await getOrCreateDM(bot.id, userId, userName);
  const msg = await db.chatMessage.create({
    data: { channelId, body, authorId: bot.id },
    include: { author: { select: { name: true, initials: true, avatarColor: true } } },
  });
  publishMessage({
    id: msg.id,
    channelId,
    body: msg.body,
    parentId: null,
    createdAt: msg.createdAt.toISOString(),
    author: msg.author ? { name: msg.author.name, initials: msg.author.initials, color: msg.author.avatarColor } : null,
    attachments: [],
  });
  const firstLine = body.split("\n").find((l) => l.trim())?.replace(/\*/g, "") ?? "Tienes un mensaje";
  await notify(userId, { type: "marcebot", title: "Marcebot", body: firstLine.slice(0, 140), link: `/chat/${channelId}` });
}

// Manda el mismo resumen por CORREO (además del DM). Best-effort: solo sale si el SMTP
// está configurado (lo gestiona sendEmail) y el usuario tiene correo. Conserva los saltos
// de línea y la sangría del texto (white-space:pre-wrap) y agrega un botón a la app.
// Se usa solo para los resúmenes "grandes" (plan de la mañana y cierre del día/semana),
// no para los avisos sueltos de cada hora, para no saturar la bandeja.
export async function sendBotEmail(email: string | null | undefined, subject: string, body: string): Promise<void> {
  if (!email) return;
  const html =
    `<div style="white-space:pre-wrap;font-size:15px;line-height:1.6;color:#1a1a1a">${escHtml(body)}</div>` +
    (APP_URL ? `<div style="margin-top:18px">${emailButton("Abrir mis tareas  →", `${APP_URL}/mis-tareas`)}</div>` : "");
  try {
    await sendEmail({ to: email, subject, html, text: `${body}${APP_URL ? `\n\n${APP_URL}/mis-tareas` : ""}` });
  } catch {
    /* el correo es secundario: el DM ya se envió */
  }
}
