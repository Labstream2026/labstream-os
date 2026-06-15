import { db } from "@/lib/db";

// Canal de chat de un cliente: reúne a TODOS los que trabajan en cualquiera de
// sus proyectos (responsables + miembros). La membresía se sincroniza cada vez
// que se abre el chat, así siempre refleja quién está en los proyectos del cliente.
export async function getOrCreateClientChannel(clientId: string): Promise<string | null> {
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) return null;

  let channel = await db.chatChannel.findFirst({ where: { clientId }, select: { id: true } });
  if (!channel) {
    channel = await db.chatChannel.create({
      data: { type: "CLIENT" as never, clientId, name: client.name, isPublic: false },
      select: { id: true },
    });
  }

  // Unión de responsables + miembros de todos los proyectos del cliente.
  const projects = await db.project.findMany({
    where: { clientId },
    select: { leadId: true, members: { select: { userId: true } } },
  });
  const userIds = new Set<string>();
  for (const p of projects) {
    if (p.leadId) userIds.add(p.leadId);
    for (const m of p.members) userIds.add(m.userId);
  }

  // Sincroniza la membresía del canal a esa unión exacta.
  const current = await db.channelMember.findMany({ where: { channelId: channel.id }, select: { userId: true } });
  const currentSet = new Set(current.map((c) => c.userId));
  const toAdd = [...userIds].filter((u) => !currentSet.has(u));
  const toRemove = [...currentSet].filter((u) => !userIds.has(u));
  if (toAdd.length) {
    await db.channelMember.createMany({ data: toAdd.map((userId) => ({ channelId: channel!.id, userId })), skipDuplicates: true });
  }
  if (toRemove.length) {
    await db.channelMember.deleteMany({ where: { channelId: channel.id, userId: { in: toRemove } } });
  }
  return channel.id;
}
