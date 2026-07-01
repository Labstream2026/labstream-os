import { db } from "@/lib/db";

// Canal de chat de un cliente/empresa (vista del EQUIPO): reúne a TODOS los del equipo que trabajan
// en cualquiera de sus proyectos (responsables + miembros) MÁS los que estén ligados directamente al
// cliente (ClientMember). Es un canal interno del equipo para coordinar la cuenta: NO incluye a los
// usuarios del PORTAL CLIENTE (esos hablan con el equipo en el canal "con el cliente" de cada
// proyecto). La membresía se sincroniza cada vez que se abre, así siempre refleja quién está en la
// cuenta sin gestión manual.
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

  // Unión de: responsables + miembros de todos los proyectos del cliente, y los ligados al cliente
  // (ClientMember). Se EXCLUYE a los usuarios del portal (rol cliente): este canal es del equipo.
  const [projects, clientMembers] = await Promise.all([
    db.project.findMany({ where: { clientId }, select: { leadId: true, members: { select: { userId: true } } } }),
    db.clientMember.findMany({ where: { clientId }, select: { userId: true } }),
  ]);
  const candidateIds = new Set<string>();
  for (const p of projects) {
    if (p.leadId) candidateIds.add(p.leadId);
    for (const m of p.members) candidateIds.add(m.userId);
  }
  for (const m of clientMembers) candidateIds.add(m.userId);

  // Filtra fuera a los usuarios del portal cliente (no participan en el canal interno del equipo).
  const clientePortal = new Set(
    (await db.user.findMany({ where: { id: { in: [...candidateIds] }, role: { key: "cliente" } }, select: { id: true } })).map((u) => u.id),
  );
  const userIds = new Set([...candidateIds].filter((id) => !clientePortal.has(id)));

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
