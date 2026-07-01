import { db } from "@/lib/db";

// Canales de chat de un proyecto por AUDIENCIA:
//  - INTERNAL: chat SOLO del equipo (siempre existe).
//  - CLIENT:   chat con el cliente invitado (equipo + cliente). Solo existe si el proyecto tiene
//              algún miembro con rol "cliente".
// La "pestaña doble" (interno + con el cliente) aparece justo cuando existe el canal CLIENT.
// Idempotente: se puede llamar en cada carga; crea lo que falte y no duplica.

export type ProjectChannels = { internalId: string; clientId: string | null };

export async function ensureProjectChannels(projectId: string): Promise<ProjectChannels | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      leadId: true,
      channels: { select: { id: true, audience: true } },
      // ¿Hay algún invitado (rol cliente) en el proyecto? → habilita el canal con el cliente.
      members: { select: { user: { select: { role: { select: { key: true } } } } } },
    },
  });
  if (!project) return null;

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(project.leadId ? { members: { create: { userId: project.leadId, role: "ADMIN" as any } } } : {}),
      },
      select: { id: true, audience: true },
    });
  } else if (internal.audience == null) {
    await db.chatChannel.update({ where: { id: internal.id }, data: { audience: "INTERNAL" } });
  }

  // CLIENT: solo si el proyecto tiene un invitado.
  const hasCliente = project.members.some((m) => m.user.role?.key === "cliente");
  let clientCh = project.channels.find((c) => c.audience === "CLIENT") ?? null;
  if (hasCliente && !clientCh) {
    clientCh = await db.chatChannel.create({
      data: { type: "PROJECT", audience: "CLIENT", name: `${project.name} · cliente`, projectId, isPublic: false },
      select: { id: true, audience: true },
    });
  }

  return { internalId: internal.id, clientId: clientCh?.id ?? null };
}
