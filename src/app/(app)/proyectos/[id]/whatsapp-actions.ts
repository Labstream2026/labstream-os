"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { userCanManageProject } from "@/lib/project-access";
import { signCoversToken } from "@/lib/review-token";
import { signDeliveryToken } from "@/lib/delivery-token";
import { sendWhatsappText, toWhatsappNumber } from "@/lib/whatsapp/send";
import { logActivity } from "@/lib/activity";

// Mandar al cliente el enlace de sus PORTADAS o de su ENTREGA por WhatsApp, usando la misma
// instancia de Evolution API (la del QR) que ya usa Marcebot. El número se recuerda en
// Client.phone para no volver a escribirlo.

export type WhatsappLinkKind = "portadas" | "entrega";
export type WhatsappActionResult = { ok: boolean; error?: string };

function baseUrl() {
  return (process.env.NEXTAUTH_URL || "https://os.labstreamsas.com").replace(/\/$/, "");
}

export async function sendProjectLinkWhatsapp(
  projectId: string,
  kind: WhatsappLinkKind,
  formData: FormData,
): Promise<WhatsappActionResult> {
  const session = await getSession();
  if (!session || !(await userCanManageProject(projectId, session))) {
    return { ok: false, error: "Necesitas permiso de gestión del proyecto para enviar el enlace." };
  }
  const rawPhone = String(formData.get("phone") ?? "").trim();
  const extra = String(formData.get("note") ?? "").trim().slice(0, 400);
  const phone = toWhatsappNumber(rawPhone);
  if (!phone) return { ok: false, error: "Número inválido. Escríbelo con indicativo, p. ej. 573001234567." };

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { name: true, clientId: true, coversRevokedAt: true, deliveryNonce: true, deliveryRevokedAt: true },
  });
  if (!project) return { ok: false, error: "Proyecto no encontrado." };

  let url: string;
  let text: string;
  if (kind === "portadas") {
    if (project.coversRevokedAt) return { ok: false, error: "El enlace de portadas está revocado. Reactívalo antes de enviarlo." };
    url = `${baseUrl()}/portadas/${signCoversToken(projectId)}`;
    text = `Hola 👋 Te comparto las portadas de «${project.name}» para que las revises.\n\nÁbrelas en grande, elige la que más te guste o dibuja encima lo que quieras cambiar:\n${url}`;
  } else {
    // Entrega: si no hay enlace activo, se genera uno (sin caducidad) para poder enviarlo.
    let nonce = project.deliveryNonce;
    if (!nonce || project.deliveryRevokedAt) {
      nonce = crypto.randomUUID();
      await db.project.update({ where: { id: projectId }, data: { deliveryNonce: nonce, deliveryRevokedAt: null } });
    }
    url = `${baseUrl()}/entrega/${signDeliveryToken(projectId, nonce)}`;
    text = `Hola 👋 Ya está listo el material de «${project.name}».\n\nDescárgalo aquí:\n${url}`;
  }
  if (extra) text += `\n\n${extra}`;

  const r = await sendWhatsappText(phone, text);
  if (!r.ok) return r;

  // Recuerda el número del cliente para la próxima vez.
  if (project.clientId) {
    await db.client.update({ where: { id: project.clientId }, data: { phone } }).catch(() => {});
  }
  await logActivity({
    action: kind === "portadas" ? "cover.whatsapp" : "delivery.whatsapp",
    summary: `envió por WhatsApp el enlace de ${kind === "portadas" ? "portadas" : "entrega"}`,
    projectId,
    entityType: "project",
    entityId: projectId,
  });
  revalidatePath(`/proyectos/${projectId}`);
  return { ok: true };
}
