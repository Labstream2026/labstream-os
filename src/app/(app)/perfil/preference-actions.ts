"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { START_PAGE_SET } from "@/lib/user-preference";
import { NOTIFICATION_EVENT_KEYS } from "@/lib/notification-types";

// Guarda (parcialmente) las preferencias del usuario actual. Best-effort: no lanza al cliente para
// no romper la UI por un fallo al persistir una preferencia (la UI ya cambió de forma optimista).
export async function saveUserPreference(patch: {
  sidebarCollapsed?: boolean;
  chatPanelOpen?: boolean;
  reduceMotion?: boolean;
  density?: string;
  startPage?: string;
}): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const data: { sidebarCollapsed?: boolean; chatPanelOpen?: boolean; reduceMotion?: boolean; density?: string; startPage?: string } = {};
  if (typeof patch.sidebarCollapsed === "boolean") data.sidebarCollapsed = patch.sidebarCollapsed;
  if (typeof patch.chatPanelOpen === "boolean") data.chatPanelOpen = patch.chatPanelOpen;
  if (typeof patch.reduceMotion === "boolean") data.reduceMotion = patch.reduceMotion;
  if (patch.density === "normal" || patch.density === "compact") data.density = patch.density;
  if (typeof patch.startPage === "string" && START_PAGE_SET.has(patch.startPage)) data.startPage = patch.startPage;
  if (Object.keys(data).length === 0) return;
  // Best-effort DE VERDAD: si la BD falla al persistir una preferencia, NO debe lanzar (la UI ya
  // cambió de forma optimista). Sin este try/catch un fallo tumbaba la página con el cartel gris.
  try {
    await db.userPreference.upsert({
      where: { userId: session.id },
      create: { userId: session.id, ...data },
      update: data,
    });
    // reduceMotion/density/startPage afectan el render del servidor (shell / <html> / Inicio): revalida el layout.
    if ("reduceMotion" in data || "density" in data || "startPage" in data) revalidatePath("/", "layout");
  } catch (e) {
    console.error("[perfil] saveUserPreference:", e);
  }
}

// Guarda las VISTAS GUARDADAS (filtros con nombre) de una superficie (p. ej. "mis-tareas").
// Reemplaza solo las de esa superficie y conserva las demás. Sincroniza entre dispositivos.
export async function setSavedViews(surface: string, views: { id: string; name: string; query: string }[]): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const row = await db.userPreference.findUnique({ where: { userId: session.id }, select: { savedViews: true } }).catch(() => null);
  let all: { surface: string; id: string; name: string; query: string }[] = [];
  try { const p = row?.savedViews ? JSON.parse(row.savedViews) : []; if (Array.isArray(p)) all = p; } catch { all = []; }
  const others = all.filter((v) => v && v.surface !== surface);
  const clean = (views ?? []).slice(0, 50).map((v) => ({ surface, id: String(v.id).slice(0, 40), name: String(v.name ?? "").slice(0, 60), query: String(v.query ?? "").slice(0, 500) }));
  try {
    await db.userPreference.upsert({
      where: { userId: session.id },
      create: { userId: session.id, savedViews: JSON.stringify([...others, ...clean]) },
      update: { savedViews: JSON.stringify([...others, ...clean]) },
    });
    return { ok: true };
  } catch (e) {
    console.error("[perfil] setSavedViews:", e);
    return { ok: false };
  }
}

// Preferencia personal de notificación: activa/desactiva un CANAL (app/push/correo) para un evento.
// Sin fila previa, los otros canales quedan en su default (activos). Best-effort.
export async function setNotifPref(
  eventKey: string,
  channel: "inApp" | "push" | "email",
  enabled: boolean,
): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  if (!NOTIFICATION_EVENT_KEYS.has(eventKey)) return { ok: false };
  const data = channel === "inApp" ? { inApp: enabled } : channel === "push" ? { push: enabled } : channel === "email" ? { email: enabled } : null;
  if (!data) return { ok: false };
  // try/catch: sin él, un fallo de BD al alternar un canal en Ajustes→Notificaciones subía al
  // límite de error y tumbaba la página con el cartel gris (mismo caso ya arreglado en saveUserPreference).
  try {
    await db.userNotificationPref.upsert({
      where: { userId_eventKey: { userId: session.id, eventKey } },
      create: { userId: session.id, eventKey, ...data },
      update: data,
    });
    return { ok: true };
  } catch (e) {
    console.error("[perfil] setNotifPref:", e);
    return { ok: false };
  }
}
