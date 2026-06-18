"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { userCanManageProject } from "@/lib/project-access";
import { emailEnabled, sendEmail } from "@/lib/email";
import { buildIcs } from "@/lib/ics";
import { signReviewToken } from "@/lib/review-token";

export type ActionResult = { ok: boolean; error?: string };

function baseUrl() {
  return (process.env.NEXTAUTH_URL || "https://os.labstreamsas.com").replace(/\/$/, "");
}

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// Envía al cliente (por correo Synology) el enlace del portal de revisión de un entregable.
export async function emailReviewLink(deliverableId: string, formData: FormData): Promise<ActionResult> {
  if (!emailEnabled) return { ok: false, error: "Correo no configurado (SMTP)." };
  const session = await getSession();
  const to = String(formData.get("to") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!isEmail(to)) return { ok: false, error: "Correo del cliente inválido." };

  const d = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { name: true, projectId: true, project: { select: { name: true, client: { select: { name: true } } } } },
  });
  if (!d) return { ok: false, error: "Entregable no encontrado." };
  // Generar y enviar un token de revisión externo es compartir con el cliente:
  // exige permiso de GESTIÓN del proyecto (no basta con poder verlo), igual que la
  // invitación de calendario de abajo.
  if (!(await userCanManageProject(d.projectId, session))) {
    return { ok: false, error: "Necesitas permiso de gestión del proyecto para compartir con el cliente." };
  }

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const url = `${baseUrl()}/review/${signReviewToken(deliverableId)}`;
  const html = `
    <p>Hola,</p>
    <p>${esc(session?.name ?? "El equipo de Labstream")} te comparte <b>${esc(d.name)}</b>${
      d.project?.name ? ` del proyecto <b>${esc(d.project.name)}</b>` : ""
    } para tu revisión.</p>
    ${note ? `<p>${note.replace(/</g, "&lt;")}</p>` : ""}
    <p><a href="${url}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Ver y comentar</a></p>
    <p style="color:#666;font-size:12px">O copia este enlace: ${url}</p>
    <p style="color:#666;font-size:12px">Labstream Studio</p>`;

  const r = await sendEmail({
    to,
    from: session?.email ? `${session.name} <${session.email}>` : undefined,
    replyTo: session?.email,
    subject: `Revisión: ${d.name}`,
    html,
    text: `${session?.name ?? "Labstream"} te comparte ${d.name} para revisión: ${url}`,
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// Envía al cliente una INVITACIÓN de calendario (.ics) por correo. Solo acción explícita;
// nunca se crea automáticamente en el calendario del cliente.
export async function emailClientInvite(projectId: string, formData: FormData): Promise<ActionResult> {
  if (!emailEnabled) return { ok: false, error: "Correo no configurado (SMTP)." };
  const session = await getSession();
  if (!(await userCanManageProject(projectId, session))) return { ok: false, error: "Sin permiso." };

  const to = String(formData.get("to") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const startRaw = String(formData.get("start") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!isEmail(to)) return { ok: false, error: "Correo inválido." };
  if (!title) return { ok: false, error: "Falta el título." };
  const start = new Date(startRaw);
  if (isNaN(start.getTime())) return { ok: false, error: "Fecha/hora inválida." };

  const uid = `inv-${projectId}-${start.getTime()}@labstreamsas.com`;
  const ics = buildIcs({
    uid,
    title,
    start,
    description: note || undefined,
    organizerName: session?.name,
    organizerEmail: session?.email ?? undefined,
    attendeeEmail: to,
    method: "REQUEST",
  });

  const r = await sendEmail({
    to,
    from: session?.email ? `${session.name} <${session.email}>` : undefined,
    replyTo: session?.email,
    subject: `Invitación: ${title}`,
    html: `<p>Te invitamos a <b>${title.replace(/</g, "&lt;")}</b>.</p>${
      note ? `<p>${note.replace(/</g, "&lt;")}</p>` : ""
    }<p>Adjuntamos la invitación de calendario (.ics) para que la agregues a tu calendario.</p><p style="color:#666;font-size:12px">Labstream Studio</p>`,
    text: `Invitación: ${title}. Adjuntamos un .ics para tu calendario.`,
    attachments: [{ filename: "invitacion.ics", content: ics, contentType: "text/calendar; method=REQUEST" }],
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
