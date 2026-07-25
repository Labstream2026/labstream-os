import { db } from "@/lib/db";
import { deliveryTeamIds } from "@/lib/delivery-data";
import { notifyMany } from "@/lib/notify";
import { emailButton, isEmailEnabled, sendEmail } from "@/lib/email";
import { signDeliveryToken } from "@/lib/delivery-token";
import { deliveryCountdownLabel, deliveryDaysLeft } from "@/lib/delivery-groups";
import { formatBogotaDate } from "@/lib/bogota-time";

// ── Recordatorio de vencimiento de la entrega ──
// Siete días antes de que expire el enlace de entrega de un proyecto: campana al equipo
// (¿el cliente ya descargó? ¿extendemos?) y, si la entrega se envió por correo, recordatorio
// al cliente con el mismo enlace. Mismo patrón que el barrido de discos: throttle por proceso
// + claim atómico sobre deliveryReminderAt (cambiar la vigencia lo resetea → puede volver a
// sonar con la fecha nueva). Corre colgado del poll de la campana.

const REMIND_WINDOW_DAYS = 7;
const SWEEP_THROTTLE_MS = 12 * 3_600_000;
let lastSweepAt = 0;

const BASE = (process.env.NEXTAUTH_URL || "https://os.labstreamsas.com").replace(/\/$/, "");

export async function sweepDeliveryReminders(opts?: { force?: boolean }): Promise<{ notified: number }> {
  const now = Date.now();
  if (!opts?.force && now - lastSweepAt < SWEEP_THROTTLE_MS) return { notified: 0 };
  lastSweepAt = now;

  const candidates = await db.project.findMany({
    where: {
      deliveryNonce: { not: null },
      deliveryRevokedAt: null,
      deliveryReminderAt: null, // aún sin recordar para ESTA fecha de corte
      deliveryExpiresAt: { gt: new Date(now), lte: new Date(now + REMIND_WINDOW_DAYS * 86_400_000) },
    },
    select: {
      id: true,
      name: true,
      leadId: true,
      deliveryNonce: true,
      deliveryExpiresAt: true,
      deliveryEmailTo: true,
      members: { select: { userId: true } },
    },
  });
  if (candidates.length === 0) return { notified: 0 };

  const emailOn = await isEmailEnabled();
  let notified = 0;

  for (const p of candidates) {
    // Claim atómico: si otra instancia/petición ya lo tomó, no duplicamos el aviso.
    const claimed = await db.project.updateMany({
      where: { id: p.id, deliveryReminderAt: null },
      data: { deliveryReminderAt: new Date() },
    });
    if (claimed.count !== 1) continue;

    const countdown = deliveryCountdownLabel(deliveryDaysLeft(p.deliveryExpiresAt)) ?? "expira pronto";
    const fecha = formatBogotaDate(p.deliveryExpiresAt!, { day: "numeric", month: "long" });

    const team = await deliveryTeamIds(p.id);
    if (team.length) {
      await notifyMany(team, {
        type: "delivery",
        event: "delivery_expiry",
        title: `La entrega de ${p.name} vence el ${fecha}`,
        body: `El enlace de entrega vence el ${fecha} (${countdown}). Revisa en la pestaña Entrega si el cliente ya descargó, o extiende la vigencia.`,
        link: `/proyectos/${p.id}?tab=entregables`,
        groupKey: `delivery-expiry:${p.id}`,
        projectId: p.id,
      });
    }

    // Recordatorio al CLIENTE solo si la entrega se envió por correo desde la app (ahí quedó
    // el destinatario). El enlace es el MISMO: extender la vigencia no lo cambia.
    if (emailOn && p.deliveryEmailTo && p.deliveryNonce) {
      const url = `${BASE}/entrega/${signDeliveryToken(p.id, p.deliveryNonce)}`;
      await sendEmail({
        to: p.deliveryEmailTo,
        subject: `Tu material de ${p.name} está disponible hasta el ${fecha}`,
        html: `
          <p>Hola,</p>
          <p>Un recordatorio amable: el material de <b>${p.name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</b> está disponible para descargar hasta el <b>${fecha}</b>.</p>
          <p>${emailButton("Descargar mi material", url)}</p>
          <p style="color:#666;font-size:12px">O copia este enlace: ${url}</p>
          <p style="color:#666;font-size:12px">Labstream Studio</p>`,
        text: `Recordatorio: el material de ${p.name} está disponible hasta el ${fecha}. Descárgalo aquí: ${url}`,
      }).catch(() => {});
    }

    notified++;
  }
  return { notified };
}
