import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { ensureMarcebot, postBotTextMessage } from "@/lib/marcebot/bot";
import { getOrCreateClientChannel } from "@/lib/client-chat";
import { rateLimit } from "@/lib/rate-limit";
import { publishActivity } from "@/lib/chat-bus";

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
  // Autor EXPLÍCITO cuando la sesión de cookie no aplica (login/SSO recién firmado,
  // llaves API/MCP): sin esto, getCurrentUser() daría null y el evento quedaría anónimo.
  userId?: string | null;
  // Auditoría ampliada: IP del actor y detalle extra (dispositivo, herramienta, etc.).
  ip?: string | null;
  meta?: Record<string, unknown> | null;
  // SOLO registrar (auditoría): sin notificaciones ni espejo al chat. Para eventos de
  // volumen o vigilancia (sesiones, descargas, llamadas de llaves API) que no deben
  // hacer ruido al equipo.
  silent?: boolean;
}): Promise<void> {
  let actorId: string | null = null;
  let logRow: { id: string; createdAt: Date } | null = null;
  try {
    if (input.userId !== undefined) {
      actorId = input.userId;
    } else {
      const me = await getCurrentUser();
      actorId = me?.id ?? null;
    }
    logRow = await db.activityLog.create({
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
        ip: input.ip ?? null,
        meta: input.meta ? (input.meta as object) : undefined,
      },
      select: { id: true, createdAt: true },
    });
  } catch {
    // no propagamos: el registro de actividad es secundario.
  }

  if (input.silent) return;

  // Notificar a quien pertenece al proyecto/cliente (+ admins), aparte del log.
  try {
    await notifyActivity(input, actorId);
  } catch {
    // las notificaciones también son best-effort.
  }

  // Espejo al CHAT: los eventos notables alimentan la BARRA DE ESTADO VIVA del canal (ya no como
  // mensaje del bot, que interrumpía) y el feed de la cuenta del cliente. También best-effort.
  try {
    await mirrorToChat(input, actorId, logRow);
  } catch {
    // el espejo al chat es secundario: nunca rompe la acción principal.
  }
}

// ── Eventos notables del proyecto (el "pulso") ──
// Estas acciones (y SOLO estas, para no hacer ruido) alimentan la BARRA DE ESTADO VIVA del canal
// interno y el feed de la cuenta del cliente. Es también el filtro que usa el endpoint /activity
// (barra + panel de Actividad), para que ambos muestren exactamente "lo que Marcebot anunciaba".
export const CHAT_MIRROR_ACTIONS = new Set([
  "project.status", // el proyecto cambió de estado
  "task.create", // nació una tarea (aparece el trabajo nuevo en el pulso del proyecto)
  "task.complete", // se completó una tarea (progreso; SOLO al pasar a "Terminada", no en cada cambio de estado)
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
  logRow: { id: string; createdAt: Date } | null,
): Promise<void> {
  if (!input.projectId || !CHAT_MIRROR_ACTIONS.has(input.action)) return;
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
  const actor = actorId
    ? await db.user.findUnique({ where: { id: actorId }, select: { name: true, initials: true, avatarColor: true } })
    : null;
  const who = actor?.name ?? input.actorName ?? "Alguien";

  // BARRA DE ESTADO VIVA (canal interno del equipo): el evento YA NO entra como mensaje del bot
  // —eso interrumpía la conversación—; se empuja EFÍMERO a la barra viva del canal (mismo bus SSE,
  // kind "activity"). El histórico lo sirve ActivityLog (endpoint /activity + panel). Sin tope: la
  // barra siempre debe reflejar lo último. Si el log no se creó, no hay nada vivo que empujar.
  const internal = project.channels[0];
  if (internal && logRow) {
    publishActivity(internal.id, {
      id: logRow.id,
      action: input.action,
      summary: input.summary,
      createdAt: logRow.createdAt.toISOString(),
      user: actor ? { name: actor.name, initials: actor.initials, color: actor.avatarColor } : null,
      actorName: actorId ? null : input.actorName ?? null,
    });
  }

  // Canal de la CUENTA del cliente: es un FEED (quien atiende la cuenta ve el pulso de TODOS sus
  // proyectos en un solo chat), NO una conversación que seguir → ahí el evento SÍ se mantiene como
  // mensaje del bot, con tope anti-inundación (algunas acciones son alcanzables por token público:
  // sin tope, un enlace filtrado podría meter decenas de mensajes por minuto). 6/acción/proy/10min.
  if (project.clientId && rateLimit(`chat-mirror:${input.projectId}:${input.action}`, 6, 10 * 60_000)) {
    // Lookup BARATO primero; solo si el canal no existe aún se llama getOrCreateClientChannel (que
    // además re-sincroniza TODA la membresía — queda para ese primer evento).
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
      const bot = await ensureMarcebot();
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
