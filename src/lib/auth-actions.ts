"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Ingresa correo y contraseña." };

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

  redirect("/");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
