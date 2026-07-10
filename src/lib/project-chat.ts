import { db } from "@/lib/db";
import { getOrCreateClientChannel } from "@/lib/client-chat";

// UN SOLO canal de chat por proyecto (decisión del usuario, 2026-07-09): el equipo y el
// invitado del portal conviven en el mismo canal — se acabó la pareja «interno» + «con el
// cliente», que fragmentaba la conversación. Idempotente: se puede llamar en cada carga.
//
// MIGRACIÓN EN CALIENTE de los proyectos con la pareja vieja: los mensajes del canal «con el
// cliente» se mueven al canal del proyecto (quedan intercalados por fecha) y el canal sobrante
// se elimina (miembros/estados caen en cascada). OJO: el canal del proyecto pasa a ser visible
// para el invitado, INCLUIDO el historial interno previo del equipo.
//
// Además SINCRONIZA la membresía del canal con el proyecto COMPLETO (equipo + invitados del
// portal): quien está en el proyecto es miembro del chat automáticamente (no hay que invitarlo),
// y solo esas personas. Así las @menciones, los no-leídos y los avisos de mensaje (que se apoyan
// en ChannelMember) llegan a todos sin gestión manual.

export type ProjectChannels = { internalId: string; clientId: string | null };

// Sincroniza los miembros de un canal EXACTAMENTE a `targetIds` (añade los que falten, quita a los
// que ya no correspondan). El responsable del proyecto queda como ADMIN del canal.
async function syncChannelMembers(channelId: string, targetIds: string[], leadId: string | null): Promise<void> {
  const targetSet = new Set(targetIds);
  const current = await db.channelMember.findMany({ where: { channelId }, select: { userId: true } });
  const currentSet = new Set(current.map((c) => c.userId));

  // El responsable entra (o se conserva) como ADMIN del canal.
  if (leadId && targetSet.has(leadId)) {
    await db.channelMember.upsert({
      where: { channelId_userId: { channelId, userId: leadId } },
      create: { channelId, userId: leadId, role: "ADMIN" },
      update: {},
    });
  }
  const toAdd = targetIds.filter((u) => u !== leadId && !currentSet.has(u));
  if (toAdd.length) {
    await db.channelMember.createMany({ data: toAdd.map((userId) => ({ channelId, userId })), skipDuplicates: true });
  }
  const toRemove = [...currentSet].filter((u) => !targetSet.has(u));
  if (toRemove.length) {
    await db.channelMember.deleteMany({ where: { channelId, userId: { in: toRemove } } });
  }
}

export async function ensureProjectChannels(projectId: string): Promise<ProjectChannels | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      leadId: true,
      clientId: true,
      channels: { select: { id: true, audience: true } },
      // TODOS los miembros del proyecto (equipo + invitados del portal) van al canal único.
      members: { select: { userId: true } },
      // Rol del responsable: si (por config atípica) fuera un usuario del portal cliente, entra
      // como miembro normal del canal, nunca como ADMIN.
      lead: { select: { role: { select: { key: true } } } },
    },
  });
  if (!project) return null;
  const leadIsCliente = project.lead?.role?.key === "cliente";

  // El canal ÚNICO del proyecto: adopta el interno o uno heredado sin audiencia; si el proyecto
  // (atípicamente) solo tenía el canal «con el cliente», ese asciende a canal del proyecto.
  const legacyClient = project.channels.find((c) => c.audience === "CLIENT") ?? null;
  let channel = project.channels.find((c) => c.audience === "INTERNAL") ?? project.channels.find((c) => c.audience == null);
  if (!channel && legacyClient) {
    channel = legacyClient;
    await db.chatChannel.update({ where: { id: channel.id }, data: { audience: "INTERNAL", name: project.name } });
  }
  if (!channel) {
    channel = await db.chatChannel.create({
      data: {
        type: "PROJECT",
        audience: "INTERNAL",
        name: project.name,
        projectId,
        isPublic: false,
        ...(project.leadId ? { members: { create: { userId: project.leadId, role: "ADMIN" } } } : {}),
      },
      select: { id: true, audience: true },
    });
  } else if (channel.audience == null) {
    await db.chatChannel.update({ where: { id: channel.id }, data: { audience: "INTERNAL" } });
  }

  // Migración de la pareja vieja: los mensajes del canal «con el cliente» pasan al canal único
  // (intercalados por fecha; hilos y adjuntos viajan con su mensaje) y el canal sobrante se borra.
  if (legacyClient && legacyClient.id !== channel.id) {
    await db.chatMessage.updateMany({ where: { channelId: legacyClient.id }, data: { channelId: channel.id } });
    await db.chatChannel.delete({ where: { id: legacyClient.id } });
  }

  // Membresía = el proyecto COMPLETO (equipo + invitados del portal). El responsable queda como
  // ADMIN del canal, salvo que sea (atípicamente) un usuario del portal: entra como miembro normal.
  const memberIds = project.members.map((m) => m.userId);
  if (project.leadId && !memberIds.includes(project.leadId)) memberIds.push(project.leadId);
  await syncChannelMembers(channel.id, memberIds, leadIsCliente ? null : project.leadId);

  // El canal de la CUENTA del cliente se mantiene al día JUNTO con los del proyecto: deja de ser
  // "fantasma" (antes solo nacía al abrir el dock en /clientes/[id]) y su membresía refleja los
  // equipos actuales cuando el equipo de un proyecto cambia — no al azar de quién abre qué.
  // Best-effort: nunca rompe la sincronización de los canales del proyecto.
  if (project.clientId) {
    try {
      await getOrCreateClientChannel(project.clientId);
    } catch {
      /* secundario */
    }
  }

  return { internalId: channel.id, clientId: null };
}
