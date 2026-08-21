// Sesión basada en JWT firmado (HS256) guardado en cookie httpOnly.
// Solo usa `jose` → es compatible con el middleware (edge). NO importar prisma ni bcrypt aquí.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "labstream_session";
// Vida de la sesión del EQUIPO: 30 días (≈ un mes). Antes eran 7 días, y con Authentik caducando
// aún antes, el equipo re-iniciaba sesión cada 2-3 días. Ahora el re-login es MENSUAL. Sigue
// siendo seguro: la cookie es httpOnly/secure/sameSite=lax, y getSession() SIEMPRE superpone el
// estado EN VIVO desde la BD, así que desactivar/borrar a un usuario corta su acceso al instante
// aunque su cookie no haya caducado (revocación efectiva sin esperar los 30 días).
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 días (≈ 1 mes)

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
    // En segundos desde ahora, atado a SESSION_MAX_AGE para que el `exp` del token y el `maxAge`
    // de la cookie nunca se desfasen (si se cambia la vida, se cambia en UN solo sitio).
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_MAX_AGE)
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
