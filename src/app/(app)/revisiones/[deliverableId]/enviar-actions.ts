"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canManageProject } from "@/lib/project-access";
import { signReviewToken } from "@/lib/review-token";
import { isEmailEnabled, sendEmail } from "@/lib/email";
import { sendWhatsappText, toWhatsappNumber } from "@/lib/whatsapp/send";
import { logActivity } from "@/lib/activity";
import { textoWhatsapp, textoCorreo, asuntoCorreo, type PiezaCompartida } from "@/lib/review-share";

// ── Mandarle al cliente el enlace de UNA pieza, desde la sala de revisión ──────
// El envío en lote de /revisiones (bulk-actions) exige GESTIONAR el proyecto, y eso deja fuera
// justo a quien más lo necesita: un revisor asignado puede pre-aprobar —con lo que la pieza
// entra al portal del cliente— pero no podía mandarle el enlace y tenía que pedírselo a otro.
// Aquí la puerta es la MISMA que la de la pre-aprobación: si se te confía decidir, se te confía
// avisar. El texto lo arma lib/review-share, el mismo que ve en la vista previa quien envía.

export type EnvioResultado = { ok: boolean; error?: string };

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
  archivedAt: true,
  finishedAt: true,
} as const;

function baseUrl() {
  return (process.env.NEXTAUTH_URL || "https://os.labstreamsas.com").replace(/\/$/, "");
}

async function piezaSiPuedo(deliverableId: string) {
  const session = await getSession();
  if (!session || session.role === "demo" || session.role === "cliente") return { session: null, d: null };
  const d = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: {
      id: true,
      name: true,
      number: true,
      projectId: true,
      reviewRevokedAt: true,
      reviewExpiresAt: true,
      reviewerId: true,
      reviewers: { select: { userId: true } },
      project: { select: { ...accessSelect, name: true, clientId: true } },
    },
  });
  if (!d) return { session: null, d: null };
  const puede =
    (canManageProject(d.project, session) && hasPermission(session, "aprobar_entregables")) ||
    d.reviewers.some((r) => r.userId === session.id) ||
    (!!d.reviewerId && d.reviewerId === session.id);
  return puede ? { session, d } : { session: null, d: null };
}

// Contacto sugerido del cliente: el WhatsApp de su ficha y el correo de quien tenga cuenta en
// su portal. Es lo mismo que propone la barra de lote, pero con la puerta de arriba.
export async function contactoSugerido(deliverableId: string): Promise<{ email: string | null; phone: string | null }> {
  const { d } = await piezaSiPuedo(deliverableId);
  if (!d?.project.clientId) return { email: null, phone: null };
  const client = await db.client.findUnique({
    where: { id: d.project.clientId },
    select: { phone: true, members: { select: { user: { select: { email: true, active: true } } }, take: 5 } },
  });
  return {
    email: client?.members.find((m) => m.user?.active && m.user.email)?.user?.email ?? null,
    phone: client?.phone ?? null,
  };
}

export async function enviarEnlaceRevision(
  deliverableId: string,
  input: { channel: "email" | "whatsapp"; to: string; note?: string },
): Promise<EnvioResultado> {
  const { session, d } = await piezaSiPuedo(deliverableId);
  if (!session || !d) return { ok: false, error: "No autorizado" };
  // Un enlace muerto no se manda: el cliente abriría una puerta cerrada y llamaría preguntando.
  if (d.reviewRevokedAt || (d.reviewExpiresAt && d.reviewExpiresAt.getTime() <= Date.now())) {
    return { ok: false, error: "El enlace de esta pieza está revocado o vencido. Reactívalo antes de mandarlo." };
  }

  const piezas: PiezaCompartida[] = [
    {
      titulo: `${d.number ? `#${d.number} ` : ""}${d.name}`,
      proyecto: d.project.name,
      url: `${baseUrl()}/review/${signReviewToken(d.id)}`,
    },
  ];
  const nota = (input.note ?? "").trim().slice(0, 500);

  if (input.channel === "whatsapp") {
    const phone = toWhatsappNumber(input.to.trim());
    if (!phone) return { ok: false, error: "Número inválido. Escríbelo con indicativo, p. ej. 573001234567." };
    const r = await sendWhatsappText(phone, textoWhatsapp(piezas, nota));
    if (!r.ok) return { ok: false, error: r.error };
    // Recuerda el número para la próxima vez (igual que portadas y entregas).
    if (d.project.clientId) {
      await db.client.update({ where: { id: d.project.clientId }, data: { phone } }).catch(() => null);
    }
  } else {
    if (!(await isEmailEnabled())) return { ok: false, error: "El correo no está configurado (SMTP)." };
    const to = input.to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, error: "Correo del cliente inválido." };
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html =
      `<p>Hola,</p>` +
      `<p>${esc(session.name)} te comparte esta pieza de <b>${esc(d.project.name)}</b> para tu revisión.</p>` +
      (nota ? `<p>${esc(nota)}</p>` : "") +
      `<table style="border-collapse:collapse"><tr><td style="padding:6px 0"><b>${esc(piezas[0].titulo)}</b><br>` +
      `<a href="${piezas[0].url}" style="color:#4f46e5">Ver y comentar</a></td></tr></table>` +
      `<p style="color:#666;font-size:12px">Labstream Studio</p>`;
    const r = await sendEmail({
      to,
      from: session.email ? `${session.name} <${session.email}>` : undefined,
      replyTo: session.email,
      subject: asuntoCorreo(piezas),
      html,
      text: textoCorreo(piezas, session.name, nota),
    });
    if (!r.ok) return { ok: false, error: r.error };
  }

  await logActivity({
    action: "deliverable.share",
    summary: `envió al cliente el enlace de «${d.name}» por ${input.channel === "whatsapp" ? "WhatsApp" : "correo"}`,
    projectId: d.projectId,
    entityType: "deliverable",
    entityId: d.id,
  }).catch(() => null);
  revalidatePath("/revisiones");
  return { ok: true };
}
