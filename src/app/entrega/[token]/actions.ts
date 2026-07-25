"use server";

import { db } from "@/lib/db";
import { parseDeliveryToken } from "@/lib/delivery-token";
import { deliveryTeamIds } from "@/lib/delivery-data";
import { notifyMany } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

// El cliente pide reactivar una entrega VENCIDA desde la propia página del enlace, sin cuenta.
// Autorización: el mismo token firmado — el nonce debe coincidir con el vigente (una URL
// revocada no puede pedir nada). Solo avisa al equipo por campana; extender la vigencia sigue
// siendo decisión del equipo en la pestaña Entrega, y el MISMO enlace vuelve a funcionar.
export async function requestDeliveryReactivation(token: string): Promise<{ ok: boolean; error?: string }> {
  const parsed = parseDeliveryToken(token);
  if (!parsed) return { ok: false, error: "Enlace inválido." };
  const p = await db.project.findUnique({
    where: { id: parsed.projectId },
    select: { name: true, deliveryNonce: true, deliveryRevokedAt: true },
  });
  if (!p || !p.deliveryNonce || p.deliveryNonce !== parsed.nonce || p.deliveryRevokedAt) {
    return { ok: false, error: "Este enlace ya no es válido. Pide uno nuevo a tu productor." };
  }
  // Tope de ritmo: si alguien insiste, el equipo ya fue avisado hace poco — respondemos «listo»
  // sin duplicar campanas.
  if (!rateLimit(`delivery-reactivate:${parsed.projectId}`, 1, 6 * 3_600_000)) return { ok: true };

  const team = await deliveryTeamIds(parsed.projectId);
  if (team.length) {
    await notifyMany(team, {
      type: "delivery",
      event: "client_request",
      title: `Piden reactivar la entrega: ${p.name}`,
      body: "El cliente abrió el enlace de entrega vencido y pidió reactivarlo. Extiende la vigencia en la pestaña Entrega — el mismo enlace vuelve a funcionar.",
      link: `/proyectos/${parsed.projectId}?tab=entregables`,
      groupKey: `delivery-reactivate:${parsed.projectId}`,
      projectId: parsed.projectId,
    });
  }
  return { ok: true };
}
