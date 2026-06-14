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

// Un secreto débil/placeholder permitiría forjar sesiones de admin: en producción
// se exige uno real (openssl rand -base64 32). En dev se usa un fallback fijo.
function isWeakSecret(s: string | undefined): boolean {
  return !s || s.length < 16 || s === "dev-secret-cambiar" || /genera-uno|cambiar|changeme|example|secret-aqui/i.test(s);
}
function secretKey() {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (isWeakSecret(secret)) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXTAUTH_SECRET ausente o inseguro en producción. Genera uno con: openssl rand -base64 32");
    }
    return new TextEncoder().encode("dev-secret-cambiar");
  }
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
