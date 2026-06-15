import type { SessionUser } from "@/lib/session";
import { db } from "@/lib/db";

type ClientShape = {
  members: { userId: string }[];
  projects: { leadId: string | null; members: { userId: string }[] }[];
};

// Roles comerciales (gerente/ventas) deben ver TODOS los clientes para poder
// cotizarlos: se identifican por el permiso ver_cotizaciones. Producción no.
function seesAllClients(session: SessionUser): boolean {
  return session.role === "admin" || session.perms.includes("ver_cotizaciones");
}

// ¿Puede el usuario VER este cliente?
// Admin/comercial → todos. Resto → solo si es miembro explícito del cliente o
// participa (lidera o es miembro) en alguno de sus proyectos.
export function canAccessClient(client: ClientShape, session: SessionUser | null): boolean {
  if (!session) return false;
  if (seesAllClients(session)) return true;
  if (client.members.some((m) => m.userId === session.id)) return true;
  return client.projects.some(
    (p) => p.leadId === session.id || p.members.some((m) => m.userId === session.id),
  );
}

// ¿Puede GESTIONAR el cliente (añadir/quitar miembros, editar)? Solo admin o
// miembro explícito del cliente. (Pulir más adelante con un rol de "responsable".)
export function canManageClient(client: ClientShape, session: SessionUser | null): boolean {
  if (!session) return false;
  if (session.role === "admin") return true;
  return client.members.some((m) => m.userId === session.id);
}

// Cláusula `where` de Prisma equivalente a canAccessClient(): trae solo los
// clientes que el usuario puede ver, sin cargar todos para descartarlos en JS.
export function accessibleClientWhere(session: SessionUser | null): Record<string, unknown> {
  if (!session) return { id: "__none__" };
  if (seesAllClients(session)) return {};
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
  members: { select: { userId: true } },
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
