import { db } from "@/lib/db";

// Canales de chat de un proyecto por AUDIENCIA:
//  - INTERNAL: chat SOLO del equipo (siempre existe).
//  - CLIENT:   chat con el cliente invitado (equipo + cliente). Solo existe si el proyecto tiene
//              algún miembro con rol "cliente".
// La "pestaña doble" (interno + con el cliente) aparece justo cuando existe el canal CLIENT.
// Idempotente: se puede llamar en cada carga; crea lo que falte y no duplica.
//
// Además SINCRONIZA la membresía de los canales con el equipo del proyecto: quien está en el
// proyecto es miembro del chat automáticamente (no hay que invitarlo), y solo esas personas. Así
// las @menciones, los no-leídos y los avisos de mensaje (que se apoyan en ChannelMember) llegan a
// todo el equipo del proyecto sin gestión manual.

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
      channels: { select: { id: true, audience: true } },
      // Miembros del proyecto con su rol: el equipo (todos menos los invitados) va al canal interno;
      // el equipo + los invitados (rol cliente) van al canal con el cliente.
      members: { select: { userId: true, user: { select: { role: { select: { key: true } } } } } },
      // Rol del responsable: si (por config atípica) fuera un usuario del portal cliente, NO entra al
      // canal interno del equipo (va con los invitados). canAccessChannel ya lo bloquearía, pero así
      // tampoco figura como miembro ni recibe avisos del canal interno.
      lead: { select: { role: { select: { key: true } } } },
    },
  });
  if (!project) return null;
  const leadIsCliente = project.lead?.role?.key === "cliente";

  // INTERNAL: el canal del equipo. Adopta un canal de proyecto sin audiencia (heredado) o crea uno.
  let internal = project.channels.find((c) => c.audience === "INTERNAL") ?? project.channels.find((c) => c.audience == null);
  if (!internal) {
    internal = await db.chatChannel.create({
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
  } else if (internal.audience == null) {
    await db.chatChannel.update({ where: { id: internal.id }, data: { audience: "INTERNAL" } });
  }

  // CLIENT: solo si el proyecto tiene un invitado.
  const clienteIds = project.members.filter((m) => m.user.role?.key === "cliente").map((m) => m.userId);
  const teamIds = project.members.filter((m) => m.user.role?.key !== "cliente").map((m) => m.userId);
  // El responsable entra al equipo salvo que sea (atípicamente) un usuario del portal cliente, en
  // cuyo caso va con los invitados (canal con el cliente), nunca al interno.
  if (project.leadId && !leadIsCliente && !teamIds.includes(project.leadId)) teamIds.push(project.leadId);
  if (project.leadId && leadIsCliente && !clienteIds.includes(project.leadId)) clienteIds.push(project.leadId);

  const hasCliente = clienteIds.length > 0;
  let clientCh = project.channels.find((c) => c.audience === "CLIENT") ?? null;
  if (hasCliente && !clientCh) {
    clientCh = await db.chatChannel.create({
      data: { type: "PROJECT", audience: "CLIENT", name: `${project.name} · cliente`, projectId, isPublic: false },
      select: { id: true, audience: true },
    });
  }

  // Sincroniza la membresía: el canal interno = solo el equipo; el canal con el cliente = equipo +
  // invitados. De este modo estar en el proyecto ES estar en el chat (no hay que invitar a nadie) y
  // solo esas personas figuran (el chat con el cliente "solo habla con el equipo del proyecto").
  await syncChannelMembers(internal.id, teamIds, leadIsCliente ? null : project.leadId);
  if (clientCh) await syncChannelMembers(clientCh.id, [...teamIds, ...clienteIds], project.leadId);

  return { internalId: internal.id, clientId: clientCh?.id ?? null };
}
