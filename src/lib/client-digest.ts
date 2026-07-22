import { db } from "@/lib/db";
import { sendEmail, isEmailEnabled, emailButton } from "@/lib/email";
import { APP_TZ, bogotaMinutesOfDay, formatBogota } from "@/lib/bogota-time";

// ── Resumen semanal del portal del cliente ──
// Correo del VIERNES («Esta semana en tus proyectos») para usuarios con rol cliente: sus
// novedades de los últimos 7 días (versiones nuevas, aprobaciones, respuestas) + citas próximas.
// Corre colgado del cron de recordatorios (sin cron nuevo): la marca User.clientDigestAt evita
// duplicados aunque el cron pase muchas veces el mismo viernes.

const APP_URL = (process.env.NEXTAUTH_URL || "https://os.labstreamsas.com").replace(/\/$/, "");

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sweepClientDigest(): Promise<{ sent: number; skipped?: string }> {
  if (!(await isEmailEnabled())) return { sent: 0, skipped: "correo no configurado" };

  const now = new Date();
  // Solo los viernes, desde las 8 am de Bogotá (que llegue en horario laboral, no de madrugada).
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, weekday: "short" }).format(now);
  if (weekday !== "Fri") return { sent: 0, skipped: "no es viernes" };
  if (bogotaMinutesOfDay(now) < 8 * 60) return { sent: 0, skipped: "antes de las 8 am" };

  const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 3600 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const in7d = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  const users = await db.user.findMany({
    where: {
      active: true,
      isSystemBot: false,
      role: { key: "cliente" },
      email: { contains: "@" },
      passwordHash: { not: null }, // aún no ha aceptado la invitación → no tiene nada que resumir
      OR: [{ clientDigestAt: null }, { clientDigestAt: { lt: sixDaysAgo } }],
    },
    select: { id: true, name: true, email: true },
    take: 200,
  });

  let sent = 0;
  for (const u of users) {
    // La marca se pone SIEMPRE (haya o no correo): así cada viernes se evalúa una sola vez.
    await db.user.update({ where: { id: u.id }, data: { clientDigestAt: now } }).catch(() => {});

    const [notifications, events] = await Promise.all([
      db.notification.findMany({
        where: { userId: u.id, createdAt: { gte: sevenDaysAgo } },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { title: true, createdAt: true },
      }),
      db.calendarEvent.findMany({
        where: {
          start: { gte: now, lte: in7d },
          project: {
            archivedAt: null,
            OR: [{ leadId: u.id }, { members: { some: { userId: u.id } } }],
          },
        },
        orderBy: { start: "asc" },
        take: 5,
        select: { title: true, start: true, project: { select: { name: true } } },
      }),
    ]);
    if (notifications.length === 0 && events.length === 0) continue; // semana sin novedades → sin correo

    const firstName = u.name.split(" ")[0] || u.name;
    const items = notifications
      .map(
        (n) =>
          `<li style="margin:0 0 8px;color:#444;font-size:14px;line-height:1.5">${esc(n.title)} <span style="color:#9a9a9a;font-size:12px">· ${esc(formatBogota(n.createdAt, { day: "numeric", month: "short" }))}</span></li>`,
      )
      .join("");
    const agenda = events
      .map(
        (e) =>
          `<li style="margin:0 0 8px;color:#444;font-size:14px;line-height:1.5"><strong>${esc(formatBogota(e.start, { day: "numeric", month: "short" }))}</strong> · ${esc(e.title)}${e.project ? ` — ${esc(e.project.name)}` : ""}</li>`,
      )
      .join("");

    const html = `<p style="margin:0 0 6px;color:#6b6b6b;font-size:14px">Hola ${esc(firstName)},</p>
      <h1 style="margin:0 0 14px;font-size:19px;font-weight:700;color:#111;line-height:1.35">Esta semana en tus proyectos</h1>
      ${items ? `<p style="margin:0 0 6px;color:#111;font-size:14px;font-weight:600">Lo que pasó</p><ul style="margin:0 0 16px;padding-left:18px">${items}</ul>` : ""}
      ${agenda ? `<p style="margin:0 0 6px;color:#111;font-size:14px;font-weight:600">Próximos días</p><ul style="margin:0 0 16px;padding-left:18px">${agenda}</ul>` : ""}
      ${emailButton("Abrir mi portal  →", `${APP_URL}/inicio`)}`;

    const r = await sendEmail({
      to: u.email,
      subject: "Esta semana en tus proyectos · Labstream",
      html,
      text: `Esta semana en tus proyectos:\n${notifications.map((n) => `- ${n.title}`).join("\n")}\n${APP_URL}/inicio`,
    }).catch(() => ({ ok: false }));
    if (r.ok) sent += 1;
  }

  return { sent };
}
