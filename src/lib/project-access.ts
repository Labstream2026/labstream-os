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

// ¿Puede ESCRIBIR (crear/editar/borrar tareas, archivos, entregables, fases)?
// Igual que acceder, pero los invitados (rol GUEST) son de solo lectura.
export function canWriteProject(project: ProjectShape, session: SessionUser | null): boolean {
  if (!canAccessProject(project, session)) return false;
  if (session!.role === "admin") return true;
  const membership = project.members.find((m) => m.userId === session!.id);
  if (membership?.role === "GUEST") return false; // invitado = solo lectura
  return true;
}

// ¿Puede GESTIONAR el proyecto (visibilidad, miembros, ajustes)?
// Admin del sistema, editores (sobre proyectos que ya ven), el responsable del
// proyecto o un miembro con rol OWNER.
export function canManageProject(project: ProjectShape, session: SessionUser | null): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  if (project.leadId === session.id) return true;
  if (session.role === "editor" && canAccessProject(project, session)) return true;
  return project.members.some((m) => m.userId === session.id && m.role === "OWNER");
}

// Cláusula `where` de Prisma que limita la consulta a los proyectos que el
// usuario puede ver — así no traemos todos los proyectos para descartarlos en JS.
// Refleja exactamente la lógica de canAccessProject().
export function accessibleProjectWhere(session: SessionUser | null): Record<string, unknown> {
  if (!session) return { id: "__none__" }; // nada
  // Los proyectos archivados (papelera) nunca salen en las listas normales.
  if (session.role === "admin") return { archivedAt: null };
  const or: Record<string, unknown>[] = [
    { leadId: session.id },
    { members: { some: { userId: session.id } } },
  ];
  if (session.perms.includes("ver_proyectos")) or.push({ isPrivate: false });
  return { archivedAt: null, OR: or };
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
