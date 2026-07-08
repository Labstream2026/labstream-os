import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { ensureMarcebot, postBotTextMessage } from "@/lib/marcebot/bot";
import { getOrCreateClientChannel } from "@/lib/client-chat";
import { rateLimit } from "@/lib/rate-limit";

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
  // Nombre del autor cuando NO hay sesión (p.ej. el cliente desde el portal público).
  actorName?: string;
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
        // Guarda el nombre del autor sin cuenta (cliente) para el rastro de auditoría.
        actorName: actorId ? null : input.actorName ?? null,
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

  // Espejo al CHAT: los eventos de ESTADO se publican como mensaje automático en el canal del
  // proyecto (y resumidos en el canal de la cuenta del cliente). También best-effort.
  try {
    await mirrorToChat(input, actorId);
  } catch {
    // el espejo al chat es secundario: nunca rompe la acción principal.
  }
}

// ── Estados automáticos en el chat ──
// Estas acciones (y SOLO estas, para no hacer ruido) se espejan como mensaje del bot en el canal
// INTERNO del proyecto y, con el nombre del proyecto delante, en el canal de la CUENTA del cliente:
// así el chat es el lugar donde se VEN los estados sin que nadie los escriba a mano, y quien
// atiende la cuenta ve el pulso de TODOS los proyectos de ese cliente en un solo chat.
const CHAT_MIRROR_ACTIONS = new Set([
  "project.status", // el proyecto cambió de estado
  "deliverable.status", // un entregable cambió de estado
  "deliverable.preapproval", // pre-aprobación interna / cambios solicitados
  "deliverable.client_approved", // el cliente aprobó
  "deliverable.client_changes", // el cliente pidió cambios
  "deliverable.client_preapprove", // el invitado pre-aprobó (puente al cliente final)
  "deliverable.version", // nueva versión subida
  "file.client_upload", // el cliente subió material por el enlace público
]);

async function mirrorToChat(
  input: { action: string; summary: string; projectId?: string | null; actorName?: string },
  actorId: string | null,
): Promise<void> {
  if (!input.projectId || !CHAT_MIRROR_ACTIONS.has(input.action)) return;
  // Tope anti-inundación: algunas de estas acciones son alcanzables por TOKEN público (decisión del
  // cliente en /review): sin tope, un enlace filtrado podría meter decenas de mensajes del bot por
  // minuto en el chat del equipo. 6 por acción/proyecto cada 10 min cubre el flujo real de sobra.
  if (!rateLimit(`chat-mirror:${input.projectId}:${input.action}`, 6, 10 * 60_000)) return;
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: {
      name: true,
      emoji: true,
      clientId: true,
      // El canal INTERNO del equipo (nunca el "con el cliente": los estados internos no se exponen
      // al portal). Incluye canales heredados sin audiencia (aún no migrados por ensureProjectChannels):
      // `not: "CLIENT"` en Prisma EXCLUYE los null, así que se enumeran explícitamente.
      channels: { where: { OR: [{ audience: "INTERNAL" }, { audience: null }] }, select: { id: true }, take: 1 },
    },
  });
  if (!project) return;
  const actor = actorId ? await db.user.findUnique({ where: { id: actorId }, select: { name: true } }) : null;
  const who = actor?.name ?? input.actorName ?? "Alguien";
  const bot = await ensureMarcebot();

  const internal = project.channels[0];
  if (internal) await postBotTextMessage(bot.id, internal.id, `📣 ${who} ${input.summary}`);

  // Versión con contexto para el canal de la cuenta. Lookup BARATO primero (este camino corre en
  // cada acción espejada): solo si el canal no existe aún se llama getOrCreateClientChannel, que
  // además de crearlo re-sincroniza TODA la membresía (queda para ese primer evento; el resto de
  // sincronizaciones las hacen ensureProjectChannels y el dock, cuando la membresía cambia).
  if (project.clientId) {
    let account = await db.chatChannel.findFirst({ where: { clientId: project.clientId }, select: { id: true } });
    if (!account) {
      try {
        const created = await getOrCreateClientChannel(project.clientId);
        account = created ? { id: created } : null;
      } catch {
        // Carrera con otra creación simultánea (clientId es único): re-lee el que ganó.
        account = await db.chatChannel.findFirst({ where: { clientId: project.clientId }, select: { id: true } });
      }
    }
    if (account && account.id !== internal?.id) {
      await postBotTextMessage(
        bot.id,
        account.id,
        `📣 ${project.emoji ? `${project.emoji} ` : ""}${project.name} — ${who} ${input.summary}`,
      );
    }
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
  input: { summary: string; projectId?: string | null; clientId?: string | null; entityType?: string; exclude?: string[]; actorName?: string },
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
  const who = actor?.name ?? input.actorName ?? "Alguien";
  const title = `${who} ${input.summary}`.slice(0, 180);

  // Una sola consulta para todas las notificaciones (evita N inserts).
  await db.notification.createMany({
    data: [...ids].map((userId) => ({ userId, type: "activity", title, body: name, link })),
  });
}
