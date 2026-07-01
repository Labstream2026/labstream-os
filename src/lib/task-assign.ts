import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";

// El RESPONSABLE de una tarea debe ser del EQUIPO: NUNCA un usuario del portal cliente (los
// clientes no son responsables de tareas). Además, si quien asigna es un cliente, solo puede
// asignar a personas que ya hacen parte del equipo de SU proyecto (responsable o miembro), no a
// usuarios internos ajenos al proyecto. Devuelve el id válido o null (sin asignar / no permitido).
// Se usa en TODOS los caminos que fijan task.assigneeId (proyecto, mis-tareas, wizard, Marcebot).
export async function validateAssignee(
  projectId: string | null,
  rawId: string | null,
  session: SessionUser | null,
): Promise<string | null> {
  if (!rawId) return null;
  const u = await db.user.findUnique({ where: { id: rawId }, select: { active: true, role: { select: { key: true } } } });
  if (!u || !u.active || u.role?.key === "cliente") return null; // a un cliente (o inactivo) no se le asignan tareas
  if (session?.role === "cliente") {
    if (!projectId) return null;
    const proj = await db.project.findUnique({ where: { id: projectId }, select: { leadId: true, members: { select: { userId: true } } } });
    const isTeam = proj?.leadId === rawId || (proj?.members.some((m) => m.userId === rawId) ?? false);
    if (!isTeam) return null; // el cliente solo asigna a su equipo
  }
  return rawId;
}
