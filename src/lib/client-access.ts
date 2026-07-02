import type { SessionUser } from "@/lib/session";
import { db } from "@/lib/db";
import { hasFullAccess } from "@/lib/project-access";

type ClientShape = {
  members: { userId: string; role?: string }[];
  projects: { leadId: string | null; members: { userId: string }[] }[];
};

// ¿Puede el usuario VER este cliente?
// Admin → todos. Resto (incluido editor) → SOLO si tiene permiso explícito
// (miembro del cliente) o participa (lidera o es miembro) en alguno de sus proyectos.
export function canAccessClient(client: ClientShape, session: SessionUser | null): boolean {
  if (!session) return false;
  if (hasFullAccess(session)) return true; // admin y productor ven todos los clientes
  if (client.members.some((m) => m.userId === session.id)) return true;
  return client.projects.some(
    (p) => p.leadId === session.id || p.members.some((m) => m.userId === session.id),
  );
}

// ¿Puede CONCEDER/quitar acceso al cliente? Solo administradores o editores
// (y el editor, únicamente sobre clientes que ya puede ver).
export function canManageClient(client: ClientShape, session: SessionUser | null): boolean {
  if (!session) return false;
  if (hasFullAccess(session)) return true; // admin y productor gestionan cualquier cliente
  if (session.role === "editor" && canAccessClient(client, session)) return true;
  // RESPONSABLES del cliente (productores asignados a la cuenta) la gestionan. Puede haber varios.
  return session.role !== "cliente" && client.members.some((m) => m.userId === session.id && m.role === "RESPONSABLE");
}

// Cláusula `where` de Prisma equivalente a canAccessClient(): trae solo los
// clientes que el usuario puede ver, sin cargar todos para descartarlos en JS.
export function accessibleClientWhere(session: SessionUser | null): Record<string, unknown> {
  if (!session) return { id: "__none__" };
  if (hasFullAccess(session)) return {}; // admin y productor: todos los clientes
  return {
    OR: [
      { members: { some: { userId: session.id } } },
      {
        projects: {
          some: {
            OR: [
              { leadId: session.id },
              { members: { some: { userId: session.id } } },
            ],
          },
        },
      },
    ],
  };
}

const accessSelect = {
  members: { select: { userId: true, role: true } },
  projects: { select: { leadId: true, members: { select: { userId: true } } } },
} as const;

export async function userCanAccessClient(
  clientId: string,
  session: SessionUser | null,
): Promise<boolean> {
  if (!session) return false;
  const client = await db.client.findUnique({ where: { id: clientId }, select: accessSelect });
  if (!client) return false;
  return canAccessClient(client, session);
}

export async function userCanManageClient(
  clientId: string,
  session: SessionUser | null,
): Promise<boolean> {
  if (!session) return false;
  const client = await db.client.findUnique({ where: { id: clientId }, select: accessSelect });
  if (!client) return false;
  return canManageClient(client, session);
}
