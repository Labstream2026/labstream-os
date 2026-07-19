"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword, getSession } from "@/lib/auth";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { safeNext } from "@/lib/safe-next";
import { logActivity } from "@/lib/activity";
import { getRequestInfo } from "@/lib/request-info";

export type LoginState = { error?: string };

// Rate-limit de login en memoria (ventana deslizante), mismo patrón que en
// src/app/api/ai/route.ts. Frena fuerza bruta de contraseñas. Clave: email + IP.
// Suficiente para una instancia única; si se escala a varias, mover a Redis.
const LOGIN_RL_MAX = 8; // intentos por (email + IP)
const LOGIN_RL_WINDOW_MS = 5 * 60_000; // por 5 minutos
// Segundo limitador SOLO por email (independiente de la IP): que rotar la IP —incluso
// falsificando X-Forwarded-For— no anule del todo el freno a la fuerza bruta de una cuenta.
const LOGIN_RL_EMAIL_MAX = 50; // intentos por email
const LOGIN_RL_EMAIL_WINDOW_MS = 15 * 60_000; // por 15 minutos
const loginHits = new Map<string, number[]>();
let loginSweep = 0;
function loginRateLimited(key: string, max = LOGIN_RL_MAX, windowMs = LOGIN_RL_WINDOW_MS): boolean {
  const now = Date.now();
  // Purga perezosa: cada tantas llamadas borra claves cuyo último intento ya expiró (evita que
  // muchas claves distintas —p. ej. por IPs variadas— se acumulen sin techo en memoria).
  if (++loginSweep % 500 === 0) {
    for (const [k, ts] of loginHits) {
      if (!ts.length || now - ts[ts.length - 1] > LOGIN_RL_EMAIL_WINDOW_MS) loginHits.delete(k);
    }
  }
  const recent = (loginHits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    loginHits.set(key, recent);
    return true;
  }
  recent.push(now);
  loginHits.set(key, recent);
  return false;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  if (!email || !password) return { error: "Ingresa correo y contraseña." };

  // Limita los intentos por email + IP y, además, solo por email. El mensaje no revela si el
  // correo existe. La IP se toma del ÚLTIMO salto de X-Forwarded-For (el que añade NUESTRO nginx),
  // no del primero (falsificable por el cliente).
  const h = await headers();
  const xff = (h.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ip = xff.length ? xff[xff.length - 1] : (h.get("x-real-ip") ?? "").trim();
  if (
    loginRateLimited(`ip:${email}|${ip}`) ||
    loginRateLimited(`email:${email}`, LOGIN_RL_EMAIL_MAX, LOGIN_RL_EMAIL_WINDOW_MS)
  ) {
    return { error: "Demasiados intentos, espera unos minutos." };
  }

  const user = await db.user.findUnique({
    where: { email },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });

  if (!user || !user.active || !user.passwordHash) {
    return { error: "Correo o contraseña incorrectos." };
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return { error: "Correo o contraseña incorrectos." };

  const token = await signSession({
    id: user.id,
    email: user.email,
    name: user.name,
    title: user.title,
    role: user.role.key,
    perms: user.role.permissions.map((rp) => rp.permission.key),
    initials: user.initials,
    color: user.avatarColor,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  // Auditoría de sesiones: quién entró, desde qué IP y dispositivo. Antes del redirect
  // (redirect lanza) y con userId explícito (la cookie recién puesta aún no se "ve").
  const info = await getRequestInfo();
  await logActivity({
    action: "session.login",
    summary: `inició sesión${info.device ? ` · ${info.device}` : ""}`,
    userId: user.id,
    ip: info.ip,
    meta: { device: info.device || null, via: "password" },
    silent: true,
  });

  redirect(next);
}

export async function logout() {
  // Registra el cierre ANTES de borrar la cookie (después ya no sabríamos quién fue).
  try {
    const session = await getSession();
    if (session) {
      const info = await getRequestInfo();
      await logActivity({ action: "session.logout", summary: "cerró sesión", userId: session.id, ip: info.ip, silent: true });
    }
  } catch {}
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
