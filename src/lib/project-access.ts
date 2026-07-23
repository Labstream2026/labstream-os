import type { SessionUser } from "@/lib/session";
import { db } from "@/lib/db";

// Roles con acceso TOTAL a proyectos y clientes (como los admins): el GERENTE dirige la empresa
// (ve TODOS los clientes y proyectos por defecto, sin depender de membresías) y el productor
// coordina la producción. Se centraliza aquí para que las 5 funciones de acceso lo traten igual.
const FULL_ACCESS_ROLES = new Set(["admin", "gerente", "productor"]);
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
  // Opcionales: CICLO DE VIDA. Donde el select los incluya, canWriteProject bloquea la escritura
  // de proyectos dormidos (papelera o terminados). Donde no (undefined), se asume vivo — así los
  // llamadores existentes no cambian de comportamiento sin quererlo.
  archivedAt?: Date | null;
  finishedAt?: Date | null;
};

// ── Ciclo de vida: proyecto VIVO vs DORMIDO ──
// DORMIDO = en la papelera (archivedAt) o TERMINADO (finishedAt). El trabajo del día a día lo
// ignora por completo: Mis tareas, calendarios, feed .ics, barredores (SLA, recurrentes,
// recordatorios) y escrituras. Se consulta (lectura) pero no suena ni se edita: primero se
// restaura/reabre (eso va por canManageProject, que NO mira estos campos a propósito).
export const aliveProjectWhere = { archivedAt: null, finishedAt: null };
// Para recursos cuyo proyecto es OPCIONAL (tareas sueltas, avisos, eventos): sin proyecto o vivo.
// (Sin `as const`: los OR de Prisma no aceptan arrays readonly.)
export const inAliveProjectWhere = { OR: [{ projectId: null }, { project: aliveProjectWhere }] };

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

// Reglas de escritura COMUNES (rol y membresía), sin el candado del ciclo de vida: lo comparten
// canWriteProject (edición del proyecto) y canReviewProject (trabajo de revisión).
function canWriteByRole(project: ProjectShape, session: SessionUser | null): boolean {
  if (!canAccessProject(project, session)) return false;
  if (session!.role === "admin") return true;
  // Rol DEMO (usuario de prueba): SOLO LECTURA global — ve todo pero nunca escribe, como un GUEST.
  // Es el candado server-side del usuario demo; sus permisos de catálogo son solo ver_*.
  if (session!.role === "demo") return false;
  const membership = project.members.find((m) => m.userId === session!.id);
  if (membership?.role === "GUEST") return false; // invitado = solo lectura
  return true;
}

// ¿Puede ESCRIBIR (crear/editar/borrar tareas, archivos, entregables, fases)?
// Igual que acceder, pero los invitados (rol GUEST) son de solo lectura.
export function canWriteProject(project: ProjectShape, session: SessionUser | null): boolean {
  if (!canAccessProject(project, session)) return false;
  // Proyecto DORMIDO (papelera o terminado): SOLO LECTURA para todos, admin incluido — se
  // restaura/reabre primero. Va ANTES del bypass de admin a propósito: el candado protege de
  // ediciones por accidente, no de falta de permisos.
  if (project.archivedAt || project.finishedAt) return false;
  return canWriteByRole(project, session);
}

// ¿Puede hacer TRABAJO DE REVISIÓN (cerrar correcciones, responder al cliente, subir la
// versión corregida)? Igual que escribir, PERO permitido en proyectos TERMINADOS.
//
// El porqué: terminar un proyecto significa «ya se entregó», no «se prohíbe rematarlo». El
// cliente puede mandar correcciones justo después de la entrega (y el flujo de la app empuja a
// terminar al pasar a Entregado/Cerrado), así que bloquear el cierre de esas correcciones
// dejaba al equipo en un callejón sin salida: el panel de Resolve las listaba y al marcarlas
// respondía «sin permiso». Cerrar una corrección abierta NO es editar el proyecto.
// La PAPELERA sí sigue bloqueada: ahí el proyecto está borrado, no entregado.
export function canReviewProject(project: ProjectShape, session: SessionUser | null): boolean {
  if (!canAccessProject(project, session)) return false;
  if (project.archivedAt) return false;
  return canWriteByRole(project, session);
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
