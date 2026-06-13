import type { SessionUser } from "@/lib/session";
import { db } from "@/lib/db";

type ProjectShape = {
  isPrivate: boolean;
  leadId: string | null;
  members: { userId: string; role?: string }[];
};

// ¿Puede el usuario VER/colaborar en este proyecto?
// Público → todo el equipo con permiso ver_proyectos. Privado → admin, responsable o miembro.
export function canAccessProject(project: ProjectShape, session: SessionUser | null): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (project.leadId === session.id) return true;
  if (project.members.some((m) => m.userId === session.id)) return true;
  if (!project.isPrivate && session.perms.includes("ver_proyectos")) return true;
  return false;
}

// ¿Puede GESTIONAR el proyecto (visibilidad, miembros, ajustes)?
// Estilo Mattermost: admin del sistema, responsable del proyecto o miembro con rol OWNER.
export function canManageProject(project: ProjectShape, session: SessionUser | null): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (project.leadId === session.id) return true;
  return project.members.some((m) => m.userId === session.id && m.role === "OWNER");
}

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
} as const;

export async function userCanAccessProject(
  projectId: string,
  session: SessionUser | null,
): Promise<boolean> {
  if (!session) return false;
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  if (!project) return false;
  return canAccessProject(project, session);
}

export async function userCanManageProject(
  projectId: string,
  session: SessionUser | null,
): Promise<boolean> {
  if (!session) return false;
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  if (!project) return false;
  return canManageProject(project, session);
}
