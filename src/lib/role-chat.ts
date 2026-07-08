import { db } from "@/lib/db";

// Canales de equipo por ROL («Equipo · Editor»): cada rol interno con 2+ usuarios activos tiene
// su grupo automático, y la membresía SIGUE al rol (quien cambia de rol entra/sale solo, igual
// que los canales de proyecto siguen al equipo — mismo espíritu que ensureProjectChannels).
// Idempotente y barato: se llama al cargar el rail y solo escribe cuando hay diferencias.
//
// Reglas no obvias:
//  - Se excluyen cliente y demo (no son equipo) y los bots del sistema (Marcebot).
//  - El canal NACE cuando el rol llega a 2 usuarios activos (un chat de 1 persona es ruido),
//    pero si el rol baja de 2 NO se borra (se conserva el historial) y se sigue sincronizando.
//  - Son canales gestionados: no se renombran/borran/unen/salen a mano (gates en chat/actions.ts),
//    porque la siguiente sincronización desharía el cambio.

const EXCLUDED_ROLE_KEYS = new Set(["cliente", "demo"]);

export async function ensureRoleChannels(): Promise<void> {
  const [roles, channels] = await Promise.all([
    db.role.findMany({
      select: {
        key: true,
        name: true,
        users: { where: { active: true, isSystemBot: false }, select: { id: true } },
      },
    }),
    db.chatChannel.findMany({
      where: { roleKey: { not: null } },
      select: { id: true, roleKey: true, name: true, members: { select: { userId: true } } },
    }),
  ]);
  const byKey = new Map(channels.map((c) => [c.roleKey!, c] as const));

  for (const role of roles) {
    if (EXCLUDED_ROLE_KEYS.has(role.key)) continue;
    const userIds = role.users.map((u) => u.id);
    const name = `Equipo · ${role.name}`;
    const existing = byKey.get(role.key);

    if (!existing) {
      if (userIds.length < 2) continue;
      try {
        await db.chatChannel.create({
          data: {
            type: "GENERAL",
            name,
            isPublic: false,
            roleKey: role.key,
            members: { create: userIds.map((userId) => ({ userId })) },
          },
        });
      } catch {
        // Carrera entre dos cargas simultáneas del rail (roleKey es único): la otra ya lo creó;
        // la próxima pasada sincroniza a los miembros que falten.
      }
      continue;
    }

    // El nombre sigue al rol (si el admin renombra el rol, el canal se renombra solo).
    if (existing.name !== name) {
      await db.chatChannel.update({ where: { id: existing.id }, data: { name } });
    }
    const current = new Set(existing.members.map((m) => m.userId));
    const target = new Set(userIds);
    const toAdd = userIds.filter((u) => !current.has(u));
    const toRemove = [...current].filter((u) => !target.has(u));
    if (toAdd.length) {
      await db.channelMember.createMany({
        data: toAdd.map((userId) => ({ channelId: existing.id, userId })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length) {
      await db.channelMember.deleteMany({ where: { channelId: existing.id, userId: { in: toRemove } } });
    }
  }
}
