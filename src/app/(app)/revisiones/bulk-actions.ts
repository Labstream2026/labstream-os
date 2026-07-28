"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canManageProject } from "@/lib/project-access";
import { signReviewToken } from "@/lib/review-token";
import { isEmailEnabled, sendEmail } from "@/lib/email";
import { sendWhatsappText, toWhatsappNumber } from "@/lib/whatsapp/send";
import { logActivity } from "@/lib/activity";

// ── Trabajar con VARIAS piezas de una vez en la bandeja de revisiones ──
// Una campaña sale en tanda: 8 reels que se mandan juntos al cliente, se archivan juntos y se
// marcan publicados juntos. Estas acciones reciben los ids marcados con las casillas.
//
// El cliente manda la lista de ids, así que aquí NO se confía en nada: se vuelve a mirar quién
// gestiona cada proyecto y qué estado tiene cada entregable. Lo que no pase el filtro
// simplemente no se toca (y se cuenta como omitido), en vez de tumbar toda la operación.

const MAX = 60; // tope de seguridad: una tanda razonable, no la base entera

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
  archivedAt: true,
  finishedAt: true,
} as const;

export type BulkResult = { ok: boolean; error?: string; done?: number; skipped?: number };

function baseUrl() {
  return (process.env.NEXTAUTH_URL || "https://os.labstreamsas.com").replace(/\/$/, "");
}

// Entregables de la lista que esta persona puede gestionar de verdad.
async function mine(ids: string[]) {
  const session = await getSession();
  if (!session || session.role === "demo") return { session: null, rows: [] as never[] };
  const limpio = [...new Set(ids.filter(Boolean))].slice(0, MAX);
  if (!limpio.length) return { session, rows: [] as never[] };
  const rows = await db.deliverable.findMany({
    where: { id: { in: limpio } },
    select: {
      id: true,
      name: true,
      number: true,
      status: true,
      archivedAt: true,
      publishedAt: true,
      reviewRevokedAt: true,
      reviewExpiresAt: true,
      projectId: true,
      project: { select: { ...accessSelect, name: true, clientId: true } },
    },
  });
  return { session, rows: rows.filter((d) => canManageProject(d.project, session)) };
}

// ── Archivar / desarchivar en lote ──
// Archivar NO toca el enlace de revisión: la pieza sale de la bandeja pero el cliente sigue
// pudiendo abrir lo que le mandaron (igual que el botón de una sola fila).
export async function bulkSetArchived(ids: string[], archived: boolean): Promise<BulkResult> {
  const { session, rows } = await mine(ids);
  if (!session) return { ok: false, error: "No autorizado" };
  if (!rows.length) return { ok: false, error: "No hay nada que puedas gestionar en esa selección." };

  const cambian = rows.filter((d) => (d.archivedAt != null) !== archived);
  if (cambian.length) {
    await db.deliverable.updateMany({
      where: { id: { in: cambian.map((d) => d.id) } },
      data: { archivedAt: archived ? new Date() : null },
    });
    for (const d of cambian) {
      await logActivity({
        action: archived ? "deliverable.archive" : "deliverable.unarchive",
        summary: `${archived ? "archivó" : "desarchivó"} el entregable «${d.name}»`,
        projectId: d.projectId,
        entityType: "deliverable",
        entityId: d.id,
      }).catch(() => null);
    }
  }
  for (const pid of new Set(rows.map((d) => d.projectId))) revalidatePath(`/proyectos/${pid}`);
  revalidatePath("/revisiones");
  return { ok: true, done: cambian.length, skipped: ids.length - cambian.length };
}

// ── Marcar / quitar publicado en lote ──
// Mismas dos condiciones que el botón suelto: productor (gestiona + permiso de aprobar) y la
// pieza ya aprobada por el cliente. Lo que no cumpla se omite y se dice cuántas.
export async function bulkSetPublished(ids: string[], published: boolean): Promise<BulkResult> {
  const { session, rows } = await mine(ids);
  if (!session) return { ok: false, error: "No autorizado" };
  if (!hasPermission(session, "aprobar_entregables")) {
    return { ok: false, error: "Necesitas permiso para aprobar entregables." };
  }
  if (!rows.length) return { ok: false, error: "No hay nada que puedas gestionar en esa selección." };

  const cambian = published
    ? rows.filter((d) => !d.publishedAt && (d.status === "APROBADO" || d.status === "ENTREGADO"))
    : rows.filter((d) => d.publishedAt);
  if (!cambian.length) {
    return {
      ok: false,
      error: published
        ? "Solo se puede publicar lo que el cliente ya aprobó."
        : "Ninguna de las seleccionadas estaba publicada.",
    };
  }
  await db.deliverable.updateMany({
    where: { id: { in: cambian.map((d) => d.id) } },
    data: published ? { publishedAt: new Date(), publishedById: session.id } : { publishedAt: null, publishedById: null },
  });
  for (const d of cambian) {
    await logActivity({
      action: published ? "deliverable.published" : "deliverable.unpublished",
      summary: `${published ? "marcó como publicado" : "quitó el sello de publicado"} el entregable «${d.name}»`,
      projectId: d.projectId,
      entityType: "deliverable",
      entityId: d.id,
    }).catch(() => null);
  }
  for (const pid of new Set(rows.map((d) => d.projectId))) revalidatePath(`/proyectos/${pid}`);
  revalidatePath("/revisiones");
  return { ok: true, done: cambian.length, skipped: rows.length - cambian.length };
}

// ── A quién mandarlo ──
// Se propone el contacto del cliente para no escribirlo cada vez: el WhatsApp guardado en la
// ficha y el correo de quien tenga cuenta en el portal de ese cliente.
export async function suggestedRecipients(ids: string[]): Promise<{ email: string | null; phone: string | null }> {
  const { session, rows } = await mine(ids);
  if (!session || !rows.length) return { email: null, phone: null };
  const clientIds = [...new Set(rows.map((d) => d.project.clientId).filter((c): c is string => Boolean(c)))];
  if (!clientIds.length) return { email: null, phone: null };
  const client = await db.client.findFirst({
    where: { id: { in: clientIds } },
    select: {
      phone: true,
      members: { select: { user: { select: { email: true, active: true } } }, take: 5 },
    },
  });
  const email = client?.members.find((m) => m.user?.active && m.user.email)?.user?.email ?? null;
  return { email, phone: client?.phone ?? null };
}

// ── Mandarle los enlaces al cliente ──
// Un solo mensaje con TODAS las piezas marcadas: es lo que el productor escribiría a mano.
// Solo salen las que tienen el enlace vivo (ni revocado ni caducado); si no queda ninguna, se
// dice y no se manda nada a medias.
export async function bulkSendReviewLinks(
  ids: string[],
  input: { channel: "email" | "whatsapp"; to: string; note?: string },
): Promise<BulkResult> {
  const { session, rows } = await mine(ids);
  if (!session) return { ok: false, error: "No autorizado" };
  if (!rows.length) return { ok: false, error: "No hay nada que puedas gestionar en esa selección." };

  const ahora = Date.now();
  const vivos = rows.filter((d) => !d.reviewRevokedAt && (!d.reviewExpiresAt || d.reviewExpiresAt.getTime() > ahora));
  if (!vivos.length) return { ok: false, error: "Ninguna de las seleccionadas tiene el enlace activo." };

  const nota = (input.note ?? "").trim().slice(0, 500);
  const piezas = vivos.map((d) => ({
    titulo: `${d.number ? `#${d.number} ` : ""}${d.name}`,
    proyecto: d.project.name,
    url: `${baseUrl()}/review/${signReviewToken(d.id)}`,
  }));
  // Con piezas de un solo proyecto se nombra; con varias se dice el proyecto en cada línea.
  const unProyecto = new Set(vivos.map((d) => d.projectId)).size === 1 ? vivos[0].project.name : null;

  if (input.channel === "whatsapp") {
    const phone = toWhatsappNumber(input.to.trim());
    if (!phone) return { ok: false, error: "Número inválido. Escríbelo con indicativo, p. ej. 573001234567." };
    const cabecera =
      piezas.length === 1
        ? `Hola 👋 Te comparto «${piezas[0].titulo}»${unProyecto ? ` de «${unProyecto}»` : ""} para tu revisión.`
        : `Hola 👋 Te comparto ${piezas.length} piezas${unProyecto ? ` de «${unProyecto}»` : ""} para tu revisión.`;
    const cuerpo = piezas
      .map((p) => `• ${p.titulo}${unProyecto ? "" : ` (${p.proyecto})`}\n${p.url}`)
      .join("\n\n");
    const r = await sendWhatsappText(phone, `${cabecera}\n\n${cuerpo}${nota ? `\n\n${nota}` : ""}`);
    if (!r.ok) return { ok: false, error: r.error };
    // Recuerda el número para la próxima (igual que los enlaces de portadas y entrega).
    const clientId = vivos.find((d) => d.project.clientId)?.project.clientId;
    if (clientId) await db.client.update({ where: { id: clientId }, data: { phone } }).catch(() => null);
  } else {
    if (!(await isEmailEnabled())) return { ok: false, error: "El correo no está configurado (SMTP)." };
    const to = input.to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, error: "Correo del cliente inválido." };
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lista = piezas
      .map(
        (p) =>
          `<tr><td style="padding:6px 0"><b>${esc(p.titulo)}</b>${unProyecto ? "" : ` <span style="color:#666">· ${esc(p.proyecto)}</span>`}<br>` +
          `<a href="${p.url}" style="color:#4f46e5">Ver y comentar</a></td></tr>`,
      )
      .join("");
    const html =
      `<p>Hola,</p>` +
      `<p>${esc(session.name)} te comparte ${piezas.length === 1 ? "esta pieza" : `estas ${piezas.length} piezas`}` +
      `${unProyecto ? ` de <b>${esc(unProyecto)}</b>` : ""} para tu revisión.</p>` +
      (nota ? `<p>${esc(nota)}</p>` : "") +
      `<table style="border-collapse:collapse">${lista}</table>` +
      `<p style="color:#666;font-size:12px">Labstream Studio</p>`;
    const texto = `${session.name} te comparte ${piezas.length === 1 ? "una pieza" : `${piezas.length} piezas`} para revisión:\n\n${piezas
      .map((p) => `${p.titulo}: ${p.url}`)
      .join("\n")}${nota ? `\n\n${nota}` : ""}`;
    const r = await sendEmail({
      to,
      from: session.email ? `${session.name} <${session.email}>` : undefined,
      replyTo: session.email,
      subject: piezas.length === 1 ? `Revisión: ${piezas[0].titulo}` : `Revisión: ${piezas.length} piezas${unProyecto ? ` de ${unProyecto}` : ""}`,
      html,
      text: texto,
    });
    if (!r.ok) return { ok: false, error: r.error };
  }

  for (const d of vivos) {
    await logActivity({
      action: "deliverable.share",
      summary: `envió al cliente el enlace de «${d.name}» por ${input.channel === "whatsapp" ? "WhatsApp" : "correo"}`,
      projectId: d.projectId,
      entityType: "deliverable",
      entityId: d.id,
    }).catch(() => null);
  }
  revalidatePath("/revisiones");
  return { ok: true, done: vivos.length, skipped: rows.length - vivos.length };
}
