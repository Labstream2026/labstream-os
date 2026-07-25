"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { userCanManageProject } from "@/lib/project-access";
import { signDeliveryToken } from "@/lib/delivery-token";

export type DeliveryActionResult = { ok: boolean; error?: string; url?: string };

function baseUrl() {
  return (process.env.NEXTAUTH_URL || "https://os.labstreamsas.com").replace(/\/$/, "");
}

// Compartir el paquete de entrega es gestión del proyecto, igual que los enlaces de subida
// y de revisión: no basta con poder verlo.
async function ensureManage(projectId: string) {
  const session = await getSession();
  if (!session || !(await userCanManageProject(projectId, session))) return null;
  return session;
}

// Vigencia → instante de corte. `days` null = sin límite; `date` (YYYY-MM-DD) gana sobre days y
// corta al FINAL de ese día en Bogotá (el cliente entiende «hasta el 24 de agosto» inclusive).
function expiryFrom(input: { days?: number | null; date?: string | null }): Date | null {
  if (input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date)) return new Date(`${input.date}T23:59:59-05:00`);
  if (input.days && input.days > 0) return new Date(Date.now() + input.days * 86_400_000);
  return null;
}

// Activa (o reactiva) el enlace de entrega del proyecto y devuelve su URL. Genera nonce nuevo:
// si había un enlace anterior (incluso revocado), el viejo queda muerto y este es el vigente.
export async function createProjectDeliveryLink(
  projectId: string,
  input: { days?: number | null; date?: string | null },
): Promise<DeliveryActionResult> {
  const session = await ensureManage(projectId);
  if (!session) return { ok: false, error: "Necesitas permiso de gestión del proyecto para compartir la entrega." };
  const nonce = crypto.randomUUID();
  await db.project.update({
    where: { id: projectId },
    data: { deliveryNonce: nonce, deliveryRevokedAt: null, deliveryExpiresAt: expiryFrom(input), deliveryReminderAt: null },
  });
  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true, url: `${baseUrl()}/entrega/${signDeliveryToken(projectId, nonce)}` };
}

// Cambia la vigencia SIN reemitir el enlace (la fecha vive en BD, no en el token): extender una
// entrega ya enviada no obliga a reenviar nada. Resetea el claim del recordatorio para que el
// aviso de «expira pronto» pueda volver a sonar con la fecha nueva.
export async function setDeliveryExpiry(
  projectId: string,
  input: { days?: number | null; date?: string | null },
): Promise<DeliveryActionResult> {
  const session = await ensureManage(projectId);
  if (!session) return { ok: false, error: "Sin permiso." };
  await db.project.update({
    where: { id: projectId },
    data: { deliveryExpiresAt: expiryFrom(input), deliveryReminderAt: null },
  });
  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true };
}

// Revoca el enlace: marca la revocación Y rota el nonce → cualquier URL que ya circule queda
// muerta para siempre, aunque luego se genere una entrega nueva (llevará otro nonce).
export async function revokeProjectDeliveryLink(projectId: string): Promise<DeliveryActionResult> {
  const session = await ensureManage(projectId);
  if (!session) return { ok: false, error: "Sin permiso." };
  await db.project.update({
    where: { id: projectId },
    data: { deliveryRevokedAt: new Date(), deliveryNonce: crypto.randomUUID() },
  });
  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true };
}

// Saca/regresa una pieza del paquete (checklist del equipo). Por defecto TODO lo aprobado
// entra; esto excluye la excepción — p. ej. un documento interno que no es para el cliente.
export async function toggleDeliveryExcluded(deliverableId: string): Promise<DeliveryActionResult> {
  const d = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { projectId: true, deliveryExcluded: true },
  });
  if (!d) return { ok: false, error: "Entregable no encontrado." };
  const session = await ensureManage(d.projectId);
  if (!session) return { ok: false, error: "Sin permiso." };
  await db.deliverable.update({ where: { id: deliverableId }, data: { deliveryExcluded: !d.deliveryExcluded } });
  revalidatePath(`/proyectos/${d.projectId}`);
  return { ok: true };
}
