import type { SessionUser } from "@/lib/session";
import { db } from "@/lib/db";

// ¿Puede el usuario ver/escribir en este canal?
// Público → todo el equipo. Privado → admin, responsable o MIEMBRO del proyecto, o invitado al
// canal. (Cada proyecto tiene su chat: quien está en el proyecto puede entrar a su chat aunque
// no lo hayan invitado al canal explícitamente.)
export function canAccessChannel(
  channel: {
    isPublic: boolean;
    project?: { leadId: string | null; members?: { userId: string }[] } | null;
    members: { userId: string }[];
  },
  session: SessionUser | null,
): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (channel.isPublic) return true;
  if (channel.project?.leadId === session.id) return true;
  if (channel.project?.members?.some((m) => m.userId === session.id)) return true;
  return channel.members.some((m) => m.userId === session.id);
}

// Variante que carga el canal por id y resuelve el acceso (para server actions y rutas).
// Devuelve false si el canal no existe o el usuario no puede verlo.
export async function userCanAccessChannel(
  channelId: string,
  session: SessionUser | null,
): Promise<boolean> {
  if (!session) return false;
  const channel = await db.chatChannel.findUnique({
    where: { id: channelId },
    select: {
      isPublic: true,
      project: { select: { leadId: true, members: { select: { userId: true } } } },
      members: { select: { userId: true } },
    },
  });
  if (!channel) return false;
  return canAccessChannel(channel, session);
}

// ¿Puede el usuario GESTIONAR el canal (visibilidad, miembros)?
// Estilo Mattermost: admin del sistema, responsable del proyecto del canal, o
// un miembro del canal con rol ADMIN (channel admin). Los miembros normales
// (rol MEMBER) solo participan, no administran.
export async function userCanManageChannel(
  channelId: string,
  session: SessionUser | null,
): Promise<boolean> {
  if (!session) return false;
  if (session.role === "admin") return true;
  const channel = await db.chatChannel.findUnique({
    where: { id: channelId },
    select: {
      project: { select: { leadId: true } },
      members: { where: { userId: session.id }, select: { role: true } },
    },
  });
  if (!channel) return false;
  if (channel.project?.leadId === session.id) return true;
  return channel.members.some((m) => m.role === "ADMIN");
}
