import { db } from "@/lib/db";
import { plusBusinessHours } from "@/lib/business-time";

// ── Sellar «se le envió al cliente» ─────────────────────────────────────────
// Lo llama TODO camino por el que sale un enlace de revisión: correo, WhatsApp del estudio
// (Evolution API) y WhatsApp personal (wa.me desde el computador de cada quien). Un solo
// sello para todos, porque la bandeja hace UNA pregunta: ¿esto se mandó o no?
//
// El plazo de respuesta son 3 días HÁBILES desde el envío (72 h de negocio con la lib que ya
// usa la pre-aprobación): mandar un viernes por la tarde no puede vencer el sábado. Reenviar
// re-arma plazo y recordatorio — un reenvío ES una nueva espera.

export type ViaEnvio = "correo" | "whatsapp" | "whatsapp-personal";

export async function sellarEnvioCliente(ids: string[], via: ViaEnvio, to: string, now = new Date()): Promise<void> {
  if (!ids.length) return;
  await db.deliverable.updateMany({
    where: { id: { in: ids } },
    data: {
      sentToClientAt: now,
      sentToClientVia: via,
      sentToClientTo: to.slice(0, 200),
      clientReviewDueAt: plusBusinessHours(now, 72),
      clientRemindedAt: null,
    },
  });
}
