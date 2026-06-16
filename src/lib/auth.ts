// Helpers de auth del lado servidor (Node): leer sesión, permisos y hashing.
// NO usar en el middleware (edge) → ahí va `@/lib/session`.
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { SESSION_COOKIE, verifyToken, type SessionUser } from "./session";
import { getLiveAuthState } from "./permissions";

export type { SessionUser };

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const base = await verifyToken(store.get(SESSION_COOKIE)?.value);
  if (!base) return null;
  // Superpone rol y permisos EN VIVO desde la BD (cacheado por request): cualquier
  // cambio de rol/permisos aplica al instante, sin re-login. Un usuario desactivado o
  // borrado pierde la sesión de inmediato.
  const live = await getLiveAuthState(base.id);
  if (!live || !live.active) return null;
  return { ...base, role: live.roleKey, perms: live.perms };
}

export function hasPermission(session: SessionUser | null, key: string): boolean {
  if (!session) return false;
  return session.role === "admin" || session.perms.includes(key);
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
