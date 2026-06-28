import { db } from "@/lib/db";
import { isEmailEnabled, sendEmail, emailButton } from "@/lib/email";
import { sendPushToUser } from "@/lib/web-push";
import { getUserEventPref, getUsersEventPrefs, ALL_ON } from "@/lib/user-notif-prefs";

// ── Compuerta por TIPO de notificación (global, gestionada por el admin) ──
// El catálogo de keys vive en `@/lib/notification-types`; la BD solo guarda lo DESACTIVADO.
// Se cachea el conjunto de keys deshabilitados unos segundos para no consultar en cada aviso
// (notifyManyAndEmail puede disparar muchos seguidos). Un cambio del admin tarda ≤ el TTL en
// propagarse a todo el equipo.
let disabledCache: { at: number; set: Set<string> } | null = null;
const DISABLED_TTL_MS = 15000;
async function getDisabledNotificationKeys(): Promise<Set<string>> {
  const now = Date.now();
  if (disabledCache && now - disabledCache.at < DISABLED_TTL_MS) return disabledCache.set;
  try {
    const rows = await db.notificationSetting.findMany({ where: { enabled: false }, select: { key: true } });
    disabledCache = { at: now, set: new Set(rows.map((r) => r.key)) };
  } catch {
    // Si la consulta falla (p. ej. tabla aún sin migrar), no bloqueamos: todo habilitado.
    disabledCache = { at: now, set: new Set() };
  }
  return disabledCache.set;
}

// ¿Está habilitado este evento? Sin `event` (avisos sin clasificar) → siempre se envía.
async function eventEnabled(event?: string | null): Promise<boolean> {
  if (!event) return true;
  return !(await getDisabledNotificationKeys()).has(event);
}

// Escapa texto controlado por el usuario antes de interpolarlo en HTML de correo,
// para evitar inyección de HTML/XSS (nombre, título y cuerpo vienen del cliente).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Forma de una notificación. `actorId` = quién la ORIGINA (para agrupar por persona y pintar
// su avatar/color en la campana). Si se omite o es null → evento del sistema (recordatorios,
// tareas recurrentes, Marcebot), que en la campana se muestra con un icono neutro.
export type NotifyInput = { type: string; title: string; body?: string; link?: string; actorId?: string | null; event?: string | null };

// Crea una notificación in-app para un usuario. Devuelve `true` si se envió, `false` si se
// omitió (sin destinatario o tipo desactivado por el admin) — así notifyAndEmail sabe si
// además debe mandar el correo.
export async function notify(
  userId: string | null | undefined,
  n: NotifyInput,
): Promise<boolean> {
  if (!userId) return false;
  // Compuerta global por tipo: si el admin desactivó este evento, no se envía nada.
  if (!(await eventEnabled(n.event))) return false;
  // Preferencia personal por canal: el usuario puede apagar la campana y/o el push de este evento.
  const pref = await getUserEventPref(userId, n.event);
  // Una notificación cuyo actor es el propio destinatario no aporta nada (uno no se avisa a sí
  // mismo): se descarta el actor para no agrupar «tú» en la campana.
  const actorId = n.actorId && n.actorId !== userId ? n.actorId : null;
  if (pref.inApp) {
    await db.notification.create({
      data: { userId, actorId, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null },
    });
  }
  // Web Push al navegador (best-effort; sin claves VAPID es no-op).
  if (pref.push) {
    await sendPushToUser(userId, { title: n.title, body: n.body, url: n.link });
  }
  // true = el evento está habilitado a nivel global (para que notifyAndEmail evalúe el correo por
  // su propio canal), aunque el usuario haya apagado la campana/push.
  return true;
}

// Notifica en la app Y por correo (si SMTP está configurado). Best-effort.
const APP_URL = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
export async function notifyAndEmail(
  userId: string | null | undefined,
  n: NotifyInput,
) {
  if (!userId) return;
  // Si la notificación in-app se omitió (tipo desactivado), tampoco se manda el correo.
  const sent = await notify(userId, n);
  if (!sent) return;
  if (!(await isEmailEnabled())) return;
  // Canal correo de la preferencia del usuario (cacheado → no re-consulta tras el notify de arriba).
  if (!(await getUserEventPref(userId, n.event)).email) return;
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user?.email) return;
    const url = n.link ? `${APP_URL}${n.link}` : APP_URL;
    const firstName = (user.name ?? "").split(" ")[0] || "hola";
    const html = `<p style="margin:0 0 6px;color:#6b6b6b;font-size:14px">Hola ${escapeHtml(firstName)},</p>
      <h1 style="margin:0 0 12px;font-size:19px;font-weight:700;color:#111;line-height:1.35">${escapeHtml(n.title)}</h1>
      ${n.body ? `<p style="margin:0 0 18px;color:#444;font-size:15px;line-height:1.65">${escapeHtml(n.body)}</p>` : ""}
      ${emailButton("Abrir en Labstream OS  →", url)}`;
    await sendEmail({ to: user.email, subject: n.title, html, text: `${n.title}\n${n.body ?? ""}\n${url}` });
  } catch {
    /* el correo es secundario, no rompemos la acción */
  }
}

// Notifica SOLO en la app (sin correo) a varios usuarios, sin duplicar. Para eventos
// frecuentes/de bajo nivel (p. ej. «se marcó un cambio como hecho») donde mandar correo
// a todo el equipo en cada acción sería ruido.
export async function notifyMany(
  userIds: Array<string | null | undefined>,
  n: NotifyInput,
) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return;
  // Compuerta global por tipo: si el admin desactivó este evento, no se envía nada.
  if (!(await eventEnabled(n.event))) return;
  // El actor nunca se anota a sí mismo (se descarta de la lista de destinatarios).
  const recipients = ids.filter((userId) => userId !== n.actorId);
  // Preferencia personal por canal de cada destinatario (sin fila → todo activo).
  const prefs = await getUsersEventPrefs(recipients, n.event);
  const inAppIds = recipients.filter((id) => (prefs.get(id) ?? ALL_ON).inApp);
  if (inAppIds.length) {
    await db.notification.createMany({
      data: inAppIds.map((userId) => ({ userId, actorId: n.actorId ?? null, type: n.type, title: n.title, body: n.body ?? null, link: n.link ?? null })),
    });
  }
  // Web Push a cada uno que lo tenga activo (best-effort).
  await Promise.all(
    recipients.filter((id) => (prefs.get(id) ?? ALL_ON).push).map((userId) => sendPushToUser(userId, { title: n.title, body: n.body, url: n.link })),
  );
}

// Notifica en la app Y por correo a VARIOS usuarios (sin duplicar). Best-effort.
// Útil para avisar a todo el equipo de un proyecto (p. ej. «el cliente pidió cambios»).
export async function notifyManyAndEmail(
  userIds: Array<string | null | undefined>,
  n: NotifyInput,
) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  await Promise.all(ids.map((id) => notifyAndEmail(id, n)));
}
