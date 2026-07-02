import type { SessionUser } from "@/lib/session";
import { db } from "@/lib/db";

// Roles con acceso TOTAL a proyectos y clientes (como los admins): el productor coordina la
// producción, así que ve todos los clientes/proyectos y puede gestionarlos (añadir colaboradores,
// ajustes). Se centraliza aquí para que las 5 funciones de acceso lo traten igual.
const FULL_ACCESS_ROLES = new Set(["admin", "productor"]);
function hasFullAccess(session: SessionUser | null): boolean {
  return !!session && FULL_ACCESS_ROLES.has(session.role);
}
export { hasFullAccess };

type ProjectShape = {
  isPrivate: boolean;
  leadId: string | null;
  members: { userId: string; role?: string }[];
  // Opcional: el cliente del proyecto con sus miembros (para reconocer al RESPONSABLE de la cuenta).
  // Solo se pasa donde se carga (p. ej. el detalle del proyecto); el resto de sitios lo omiten. El
  // índice permite pasar el `client` con otras formas (name/emoji/…) sin romper el tipo.
  client?: { members?: { userId: string; role?: string | null }[]; [k: string]: unknown } | null;
};

// ¿Puede el usuario VER/colaborar en este proyecto?
// Público → todo el equipo con permiso ver_proyectos. Privado → admin, responsable o miembro.
export function canAccessProject(project: ProjectShape, session: SessionUser | null): boolean {
  if (!session) return false;
  if (hasFullAccess(session)) return true; // admin y productor ven todos los proyectos
  if (project.leadId === session.id) return true;
  if (project.members.some((m) => m.userId === session.id)) return true;
  // Responsable del CLIENTE (productor asignado a la cuenta) ve todos los proyectos de su cliente.
  if (session.role !== "cliente" && project.client?.members?.some((m) => m.userId === session.id && m.role === "RESPONSABLE")) return true;
  // El "cliente" (portal del cliente) SOLO accede a lo suyo (es lead o miembro): nunca a la rama
  // de proyectos públicos, aunque tenga ver_proyectos. Así no ve proyectos de otros clientes.
  if (!project.isPrivate && session.role !== "cliente" && session.perms.includes("ver_proyectos")) return true;
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
  if (hasFullAccess(session)) return true; // admin y productor gestionan (añadir colaboradores, ajustes)
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
  if (hasFullAccess(session)) return { archivedAt: null }; // admin y productor: todos

  const or: Record<string, unknown>[] = [
    { leadId: session.id },
    { members: { some: { userId: session.id } } },
  ];
  // Responsable del cliente: ve todos los proyectos de los clientes que gestiona (no aplica al portal cliente).
  if (session.role !== "cliente") or.push({ client: { members: { some: { userId: session.id, role: "RESPONSABLE" } } } });
  // El "cliente" queda acotado a sus proyectos (lead/miembro): no se le añade la rama pública.
  if (session.role !== "cliente" && session.perms.includes("ver_proyectos")) or.push({ isPrivate: false });
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
