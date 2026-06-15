import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/session";

// Roles externos que se consideran "invitados" por defecto (sin acceso a la Wiki).
const GUEST_ROLES = ["freelancer", "cliente"];

// ¿Este usuario es del equipo interno con acceso a la Wiki?
// Quedan fuera: sin sesión, roles externos (freelancer/cliente) y los marcados
// como invitado puntual (User.isGuest). La Wiki y sus enlaces no se les muestran.
export async function canSeeWiki(session: SessionUser | null): Promise<boolean> {
  if (!session) return false;
  if (session.role === "admin") return true; // el admin siempre
  if (GUEST_ROLES.includes(session.role)) return false;
  const u = await db.user.findUnique({ where: { id: session.id }, select: { isGuest: true } });
  return !u?.isGuest;
}
