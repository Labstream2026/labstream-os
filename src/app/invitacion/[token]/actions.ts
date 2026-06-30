"use server";

import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { verifyClientInviteToken } from "@/lib/client-invite-token";
import { getLiveAuthState } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";

// El usuario cliente fija su contraseña desde el enlace de invitación y queda autenticado.
// Autorización = el token firmado (no hay sesión). De un solo uso efectivo: solo procede si el
// usuario AÚN no tiene contraseña (tras fijarla, el enlace ya no sirve aunque se filtre).
export async function setInvitePassword(token: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  if (!rateLimit(`invite-set:${token}:${ip}`, 8, 60_000)) return { ok: false, error: "Demasiados intentos. Espera un momento e inténtalo de nuevo." };

  const userId = verifyClientInviteToken(token);
  if (!userId) return { ok: false, error: "El enlace no es válido o ya caducó. Pide una nueva invitación." };
  if (!password || password.length < 8) return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, title: true, initials: true, avatarColor: true, passwordHash: true, active: true, role: { select: { key: true } } },
  });
  if (!user || !user.active || user.role?.key !== "cliente") return { ok: false, error: "El enlace no es válido." };
  if (user.passwordHash) return { ok: false, error: "Esta cuenta ya está activada. Inicia sesión con tu correo y contraseña." };

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });

  // Inicia sesión automáticamente (mismo patrón que login()).
  const live = await getLiveAuthState(user.id);
  const sessionToken = await signSession({
    id: user.id,
    email: user.email,
    name: user.name,
    title: user.title,
    role: live?.roleKey ?? "cliente",
    perms: live?.perms ?? [],
    initials: user.initials,
    color: user.avatarColor,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return { ok: true };
}
