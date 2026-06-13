import type { SessionUser } from "@/lib/session";

// ¿Puede el usuario ver/escribir en este canal?
// Público → todo el equipo. Privado → admin, responsable del proyecto o miembro invitado.
export function canAccessChannel(
  channel: {
    isPublic: boolean;
    project?: { leadId: string | null } | null;
    members: { userId: string }[];
  },
  session: SessionUser | null,
): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (channel.isPublic) return true;
  if (channel.project?.leadId === session.id) return true;
  return channel.members.some((m) => m.userId === session.id);
}
