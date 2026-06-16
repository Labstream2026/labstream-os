"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { testConnection, type CalendarCollection } from "@/lib/caldav-client";
import { syncUserCalendar } from "@/lib/calendar-sync";

export type CalendarConnResult = {
  ok: boolean;
  error?: string;
  calendars?: CalendarCollection[];
  selected?: string | null;
};

// Conecta (o reconecta) el Synology Calendar del usuario: prueba credenciales,
// descubre sus calendarios y guarda la conexión cifrada. Elige por defecto el
// primer calendario si aún no hay uno seleccionado.
export async function connectCalendar(formData: FormData): Promise<CalendarConnResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };

  const serverUrl = String(formData.get("serverUrl") ?? "").trim().replace(/\/$/, "");
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!/^https?:\/\//i.test(serverUrl)) return { ok: false, error: "La URL del NAS debe empezar por http(s)://" };
  if (!username || !password) return { ok: false, error: "Faltan usuario o contraseña." };

  // Anti-SSRF: el servidor hace PROPFIND/REPORT contra serverUrl. Validamos el host.
  // Siempre se bloquea el endpoint de metadata de la nube; si CALDAV_ALLOWED_HOSTS está
  // configurado, solo se permiten esos hosts (recomendado: el del NAS).
  let host: string;
  try {
    host = new URL(serverUrl).hostname.toLowerCase();
  } catch {
    return { ok: false, error: "URL del servidor inválida." };
  }
  if (host === "169.254.169.254" || host === "metadata.google.internal") {
    return { ok: false, error: "Host no permitido." };
  }
  const allowed = (process.env.CALDAV_ALLOWED_HOSTS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes(host)) {
    return { ok: false, error: `El servidor CalDAV solo puede ser: ${allowed.join(", ")}.` };
  }

  const test = await testConnection({ serverUrl, username, password });
  if (!test.ok) return { ok: false, error: test.error };

  const calendars = test.calendars ?? [];
  const existing = await db.calendarConnection.findUnique({ where: { userId: session.id } });
  const selected = existing?.calendarUrl && calendars.some((c) => c.url === existing.calendarUrl)
    ? existing.calendarUrl
    : calendars[0]?.url ?? null;
  const selectedName = calendars.find((c) => c.url === selected)?.name ?? null;

  await db.calendarConnection.upsert({
    where: { userId: session.id },
    create: {
      userId: session.id, serverUrl, username, passwordEnc: encryptSecret(password),
      calendarUrl: selected, calendarName: selectedName, enabled: true,
    },
    update: {
      serverUrl, username, passwordEnc: encryptSecret(password),
      calendarUrl: selected, calendarName: selectedName, enabled: true, lastError: null,
    },
  });
  revalidatePath("/perfil");
  return { ok: true, calendars, selected };
}

// Cambia el calendario destino (cuando el usuario tiene varios en Synology).
export async function selectCalendar(url: string, name: string): Promise<CalendarConnResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  await db.calendarConnection.update({
    where: { userId: session.id },
    data: { calendarUrl: url, calendarName: name },
  });
  revalidatePath("/perfil");
  return { ok: true, selected: url };
}

export async function disconnectCalendar(): Promise<CalendarConnResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  await db.calendarConnection.deleteMany({ where: { userId: session.id } });
  revalidatePath("/perfil");
  return { ok: true };
}

// Fuerza una sincronización inmediata (sin esperar al cron) — útil para probar.
export async function syncCalendarNow(): Promise<{ ok: boolean; error?: string; imported?: number; updated?: number; deleted?: number }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  const conn = await db.calendarConnection.findUnique({ where: { userId: session.id } });
  if (!conn) return { ok: false, error: "No tienes Synology Calendar conectado." };
  const r = await syncUserCalendar(conn);
  revalidatePath("/perfil");
  revalidatePath("/calendario");
  return { ok: !r.error, error: r.error, imported: r.imported, updated: r.updated, deleted: r.deleted };
}
