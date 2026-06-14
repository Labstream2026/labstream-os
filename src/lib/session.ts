// Sesión basada en JWT firmado (HS256) guardado en cookie httpOnly.
// Solo usa `jose` → es compatible con el middleware (edge). NO importar prisma ni bcrypt aquí.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "labstream_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 días

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  title: string | null;
  role: string; // role key
  perms: string[];
  initials: string | null;
  color: string | null;
  avatarUrl?: string | null;
};

function secretKey() {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "dev-secret-cambiar";
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

export async function verifyToken(token?: string | null): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      id: String(payload.id),
      email: String(payload.email),
      name: String(payload.name),
      title: (payload.title as string | null) ?? null,
      role: String(payload.role),
      perms: (payload.perms as string[]) ?? [],
      initials: (payload.initials as string | null) ?? null,
      color: (payload.color as string | null) ?? null,
      avatarUrl: (payload.avatarUrl as string | null) ?? null,
    };
  } catch {
    return null;
  }
}
