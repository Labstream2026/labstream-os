import type { SessionUser } from "@/lib/session";
import { db } from "@/lib/db";
import { sessionHasSectionAccess } from "@/lib/chat-section-access";

// ¿Puede el usuario ver/escribir en este canal?
// Público → todo el equipo. Privado → admin, responsable o MIEMBRO del proyecto, o invitado al
// canal. (Cada proyecto tiene su chat: quien está en el proyecto puede entrar a su chat aunque
// no lo hayan invitado al canal explícitamente.)
export function canAccessChannel(
  channel: {
    isPublic: boolean;
    audience?: string | null;
    section?: string | null;
    project?: { leadId: string | null; members?: { userId: string }[] } | null;
    members: { userId: string }[];
  },
  session: SessionUser | null,
): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  // Rol DEMO (usuario de prueba, solo lectura): sin chat. Un canal no separa leer de escribir
  // (quien entra puede publicar), y un demo escribiendo mancharía conversaciones reales del equipo.
  if (session.role === "demo") return false;
  // Grupo asignado a una SECCIÓN/dependencia: solo entra quien tiene acceso a esa sección (aunque el
  // canal sea PÚBLICO). Es la puerta que cierra join/explore (que solo miraban isPublic) → sin esto
  // un usuario sin permiso de la sección podía auto-unirse a un grupo público asignado a ella.
  if (channel.section && !sessionHasSectionAccess(channel.section, session)) return false;
  // PORTAL DEL CLIENTE: SIN chat (decisión 2026-07-19). El cliente ya no entra a ningún canal
  // —ni al de su proyecto—, no recibe menciones y sus superficies de chat se ocultaron. El canal
  // del proyecto queda 100% interno del equipo.
  if (session.role === "cliente") return false;
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
      audience: true,
      section: true,
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

// ¿Canal CONGELADO? El canal de un proyecto en la PAPELERA queda en solo lectura: se puede
// abrir y leer (el acceso no cambia), pero no publicar. Los TERMINADOS no se congelan: retomar
// la conversación de un proyecto terminado es legítimo (y lo sube en el rail por actividad).
export async function channelFrozen(channelId: string): Promise<boolean> {
  const c = await db.chatChannel.findUnique({
    where: { id: channelId },
    select: { project: { select: { archivedAt: true } } },
  });
  return !!c?.project?.archivedAt;
}
