// Helpers de auth del lado servidor (Node): leer sesión, permisos y hashing.
// NO usar en el middleware (edge) → ahí va `@/lib/session`.
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { SESSION_COOKIE, verifyToken, type SessionUser } from "./session";

export type { SessionUser };

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifyToken(store.get(SESSION_COOKIE)?.value);
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
