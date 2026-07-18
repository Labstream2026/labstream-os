import { db } from "@/lib/db";
import { isEmailEnabled, sendEmail, emailButton } from "@/lib/email";
import { sendPushToUser } from "@/lib/web-push";
import { getUserEventPref, getUsersEventPrefs, ALL_ON } from "@/lib/user-notif-prefs";
import { eventCategory, eventPriority } from "@/lib/notification-types";
import { isSilencedNow, mutedKeys, isMutedBy } from "@/lib/notif-silence";

// Tag de agrupación para el Web Push: los avisos del mismo origen (un recordatorio, un canal de
// chat) comparten tag → el nuevo REEMPLAZA al anterior en la bandeja sin tapar a los demás.
// Sin agrupador, cada aviso es único (tag por id de notificación) para que no se pisen entre sí.
function pushTag(n: { push?: { reminderId?: string }; groupKey?: string | null; event?: string | null }): string {
  if (n.push?.reminderId) return `reminder:${n.push.reminderId}`;
  if (n.groupKey) return `grp:${n.groupKey}`;
  return `evt:${n.event ?? "aviso"}:${Math.random().toString(36).slice(2, 9)}`;
}
const PUSH_ICON = "/icons/icon-192.png";

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
export type NotifyInput = {
  type: string;
  title: string;
  body?: string;
  link?: string;
  actorId?: string | null;
  event?: string | null;
  // Persona a la que PERTENECE el aviso cuando no hay actor (avisos del sistema): la campana lo
  // pinta con su color/avatar. Así un recordatorio propio, un SLA o una tarea recurrente saben
  // "de quién son" aunque nadie los originara. Se colorea por actor ?? subject.
  subjectId?: string | null;
  // Agrupador para colapsar ráfagas del mismo origen en la campana y en el push (p. ej.
  // "chat:<channelId>"). Los avisos con el mismo groupKey se juntan.
  groupKey?: string | null;
  // Proyecto del que nace el aviso: permite que el destinatario SILENCIE ese proyecto.
  projectId?: string | null;
  // Override de prioridad (0 normal, 1 alta, 2 urgente). Si se omite, se deriva del catálogo.
  priority?: number;
  // Extras para el Web Push: adjunta un recordatorio para ofrecer botones de acción
  // (posponer/hecho) directamente en la notificación del sistema.
  push?: { reminderId?: string; snooze?: boolean };
};

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
  // Responsable (subject): colorea el aviso aunque no haya actor. Se ignora si coincide con el
  // actor (no duplica) — pero se conserva aunque sea el propio destinatario (mis recordatorios
  // salen con mi color, para saber que son míos).
  const subjectId = n.subjectId && n.subjectId !== actorId ? n.subjectId : null;
  const category = eventCategory(n.event);
  const priority = n.priority ?? eventPriority(n.event);
  // Silenciar por proyecto/persona: si el destinatario silenció el origen, no se envía nada.
  if (isMutedBy(await mutedKeys(userId), { actorId: n.actorId, subjectId: n.subjectId, projectId: n.projectId })) return false;
  // No molestar / horario silencioso: NO borra el aviso (la campana lo acumula), pero silencia
  // push y correo mientras esté vigente.
  const silenced = await isSilencedNow(userId);
  if (pref.inApp) {
    await db.notification.create({
      data: {
        userId, actorId, subjectId, type: n.type, title: n.title, body: n.body ?? null,
        link: n.link ?? null, category, priority, groupKey: n.groupKey ?? null,
      },
    });
  }
  // Web Push al navegador (best-effort; sin claves VAPID es no-op). No se manda en silencio.
  if (pref.push && !silenced) {
    const rid = n.push?.reminderId;
    await sendPushToUser(userId, {
      title: n.title,
      body: n.body,
      url: n.link,
      icon: PUSH_ICON,
      tag: pushTag(n),
      ...(rid ? { data: { reminderId: rid } } : {}),
      ...(rid && n.push?.snooze
        ? { actions: [{ action: "snooze", title: "⏰ +10 min" }, { action: "done", title: "✓ Hecho" }] }
        : {}),
    });
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
  // No molestar / horario silencioso: tampoco se manda el correo mientras esté vigente.
  if (await isSilencedNow(userId)) return;
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
  const initial = ids.filter((userId) => userId !== n.actorId);
  // Silencio por destinatario: quién silenció el origen (se excluye del todo) y quién está en
  // "No molestar"/horario (recibe in-app pero sin push).
  const silence = await Promise.all(
    initial.map(async (id) => ({
      id,
      muted: isMutedBy(await mutedKeys(id), { actorId: n.actorId, subjectId: n.subjectId, projectId: n.projectId }),
      silenced: await isSilencedNow(id),
    })),
  );
  const recipients = silence.filter((s) => !s.muted).map((s) => s.id);
  if (!recipients.length) return;
  const silencedSet = new Set(silence.filter((s) => !s.muted && s.silenced).map((s) => s.id));
  // Preferencia personal por canal de cada destinatario (sin fila → todo activo).
  const prefs = await getUsersEventPrefs(recipients, n.event);
  const category = eventCategory(n.event);
  const priority = n.priority ?? eventPriority(n.event);
  const subjectId = n.subjectId && n.subjectId !== n.actorId ? n.subjectId : null;
  const inAppIds = recipients.filter((id) => (prefs.get(id) ?? ALL_ON).inApp);
  if (inAppIds.length) {
    await db.notification.createMany({
      data: inAppIds.map((userId) => ({
        userId, actorId: n.actorId ?? null, subjectId, type: n.type, title: n.title,
        body: n.body ?? null, link: n.link ?? null, category, priority, groupKey: n.groupKey ?? null,
      })),
    });
  }
  // Web Push a cada uno que lo tenga activo y NO esté en silencio. Tag por groupKey → las
  // ráfagas del mismo canal se reemplazan en la bandeja en vez de apilarse.
  const tag = pushTag(n);
  await Promise.all(
    recipients
      .filter((id) => (prefs.get(id) ?? ALL_ON).push && !silencedSet.has(id))
      .map((userId) => sendPushToUser(userId, { title: n.title, body: n.body, url: n.link, icon: PUSH_ICON, tag })),
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
