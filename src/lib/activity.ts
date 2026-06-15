import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

// Registra un cambio en el log de actividad (fecha/hora automática + autor de la sesión).
// Best-effort: nunca rompe la acción principal si el log falla.
export async function logActivity(input: {
  action: string;
  summary: string;
  projectId?: string | null;
  clientId?: string | null;
  entityType?: string;
  entityId?: string;
  // No notificar (vía actividad) a estos usuarios: p.ej. el asignado de una tarea
  // que ya recibe una notificación directa y más rica. Evita duplicados.
  exclude?: string[];
}): Promise<void> {
  let actorId: string | null = null;
  try {
    const me = await getCurrentUser();
    actorId = me?.id ?? null;
    await db.activityLog.create({
      data: {
        action: input.action,
        summary: input.summary,
        projectId: input.projectId ?? null,
        clientId: input.clientId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        userId: actorId,
      },
    });
  } catch {
    // no propagamos: el registro de actividad es secundario.
  }

  // Notificar a quien pertenece al proyecto/cliente (+ admins), aparte del log.
  try {
    await notifyActivity(input, actorId);
  } catch {
    // las notificaciones también son best-effort.
  }
}

// Pestaña del proyecto a la que enlaza la notificación según lo que cambió.
const TAB_BY_ENTITY: Record<string, string> = {
  task: "tareas",
  checklist: "tareas",
  deliverable: "entregables",
  file: "archivos",
  folder: "archivos",
  table: "tablas",
  member: "resumen",
  project: "resumen",
};

// Avisa por cualquier cambio en un proyecto o cliente a los usuarios que
// pertenecen (líder + miembros, o miembros del cliente y de sus proyectos) y a
// los administradores. Se excluye a quien hizo el cambio. Solo en la app.
async function notifyActivity(
  input: { summary: string; projectId?: string | null; clientId?: string | null; entityType?: string; exclude?: string[] },
  actorId: string | null,
): Promise<void> {
  const ids = new Set<string>();
  let name = "";
  let link = "";

  if (input.projectId) {
    const p = await db.project.findUnique({
      where: { id: input.projectId },
      select: { name: true, leadId: true, members: { select: { userId: true } } },
    });
    if (!p) return;
    if (p.leadId) ids.add(p.leadId);
    p.members.forEach((m) => ids.add(m.userId));
    name = p.name;
    const tab = (input.entityType && TAB_BY_ENTITY[input.entityType]) || "actividad";
    link = `/proyectos/${input.projectId}?tab=${tab}`;
  } else if (input.clientId) {
    const c = await db.client.findUnique({
      where: { id: input.clientId },
      select: {
        name: true,
        members: { select: { userId: true } },
        projects: { select: { leadId: true, members: { select: { userId: true } } } },
      },
    });
    if (!c) return;
    c.members.forEach((m) => ids.add(m.userId));
    c.projects.forEach((p) => {
      if (p.leadId) ids.add(p.leadId);
      p.members.forEach((m) => ids.add(m.userId));
    });
    name = c.name;
    link = `/clientes/${input.clientId}?tab=actividad`;
  } else {
    return; // tarea personal sin proyecto/cliente: no hay audiencia de equipo
  }

  // Los administradores se enteran de todo.
  const admins = await db.user.findMany({ where: { active: true, role: { key: "admin" } }, select: { id: true } });
  admins.forEach((a) => ids.add(a.id));

  if (actorId) ids.delete(actorId); // a uno mismo no se le notifica su propio cambio
  input.exclude?.forEach((id) => ids.delete(id)); // ya recibieron una notificación directa
  if (ids.size === 0) return;

  const actor = actorId ? await db.user.findUnique({ where: { id: actorId }, select: { name: true } }) : null;
  const who = actor?.name ?? "Alguien";
  const title = `${who} ${input.summary}`.slice(0, 180);

  // Una sola consulta para todas las notificaciones (evita N inserts).
  await db.notification.createMany({
    data: [...ids].map((userId) => ({ userId, type: "activity", title, body: name, link })),
  });
}
