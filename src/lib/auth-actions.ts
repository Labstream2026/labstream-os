"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";
import { safeNext } from "@/lib/safe-next";

export type LoginState = { error?: string };

// Rate-limit de login en memoria (ventana deslizante), mismo patrón que en
// src/app/api/ai/route.ts. Frena fuerza bruta de contraseñas. Clave: email + IP.
// Suficiente para una instancia única; si se escala a varias, mover a Redis.
const LOGIN_RL_MAX = 8; // intentos
const LOGIN_RL_WINDOW_MS = 5 * 60_000; // por 5 minutos
const loginHits = new Map<string, number[]>();
function loginRateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (loginHits.get(key) ?? []).filter((t) => now - t < LOGIN_RL_WINDOW_MS);
  if (recent.length >= LOGIN_RL_MAX) {
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

  // Limita los intentos por email + IP. El mensaje no revela si el correo existe.
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
  if (loginRateLimited(`${email}|${ip}`)) {
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

  redirect(next);
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
