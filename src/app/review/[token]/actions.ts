"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { verifyReviewToken } from "@/lib/review-token";
import { logActivity } from "@/lib/activity";
import { notifyManyAndEmail } from "@/lib/notify";

// Equipo del proyecto a avisar (responsable + miembros) cuando el cliente actúa.
async function projectTeamIds(projectId: string): Promise<string[]> {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { leadId: true, members: { select: { userId: true } } } });
  if (!p) return [];
  return [p.leadId, ...p.members.map((m) => m.userId)].filter((id): id is string => Boolean(id));
}

// Acciones del portal PÚBLICO de revisión. La autorización es el token firmado
// (no hay sesión); el deliverableId siempre se deriva del token, nunca del cliente.

// Comprueba que el entregable existe y su enlace no está revocado.
async function resolveDeliverable(token: string) {
  const deliverableId = verifyReviewToken(token);
  if (!deliverableId) throw new Error("Enlace inválido");
  const d = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { id: true, name: true, projectId: true, reviewRevokedAt: true } });
  if (!d || d.reviewRevokedAt) throw new Error("El enlace de revisión ya no está disponible");
  return d;
}

export async function addReviewComment(token: string, formData: FormData) {
  const { id: deliverableId, name, projectId } = await resolveDeliverable(token);

  const authorName = String(formData.get("authorName") ?? "").trim().slice(0, 80) || "Cliente";
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  const tcRaw = String(formData.get("timecode") ?? "").trim();
  const versionRaw = String(formData.get("versionNumber") ?? "").trim();
  const drawingRaw = String(formData.get("drawingData") ?? "").trim();
  // Nota general: comentario suelto, sin captura ni timecode (sección «Notas»).
  const isNote = formData.get("isNote") === "true" || formData.get("isNote") === "on";
  // Un comentario debe tener texto o un dibujo (anotación).
  if (!body && !drawingRaw) return;

  let drawingData: unknown = undefined;
  if (drawingRaw) {
    try {
      const parsed = JSON.parse(drawingRaw);
      // Límite de tamaño defensivo (captura + trazos) para no abusar de la BD.
      if (drawingRaw.length <= 400_000) drawingData = parsed;
    } catch {
      /* ignora dibujos malformados */
    }
  }

  await db.reviewComment.create({
    data: {
      deliverableId,
      authorName,
      body: body || "(anotación)",
      timecode: isNote ? null : tcRaw && Number.isFinite(Number(tcRaw)) ? Number(tcRaw) : null,
      versionNumber: versionRaw ? Number(versionRaw) : null,
      drawingData: isNote ? undefined : ((drawingData ?? undefined) as never),
      isNote,
      fromClient: true,
    },
  });
  // Avisa al equipo del proyecto (y admins) que el cliente comentó.
  await logActivity({
    action: "deliverable.client_comment",
    summary: `comentó la revisión de «${name}»`,
    projectId,
    entityType: "deliverable",
    entityId: deliverableId,
    actorName: `${authorName} (cliente)`,
  });
  // No revalidamos la página: el comentario se muestra de forma optimista en el cliente
  // (ReviewStage) para que el reproductor de video NO se reinicie al comentar.
}

export async function setReviewDecision(token: string, decision: string, name?: string) {
  const { id: deliverableId, name: delName, projectId } = await resolveDeliverable(token);
  const approved = decision === "APROBADO";
  const status = approved ? "APROBADO" : "CORRECCIONES";
  const who = (name ?? "").trim().slice(0, 80) || "Cliente";

  // Solo se decide sobre material que el equipo ya aprobó internamente.
  const latestApproved = await db.deliverableVersion.findFirst({
    where: { deliverableId, internalApproved: true },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  if (!latestApproved) throw new Error("Aún no hay una versión disponible para decidir");

  await db.deliverable.update({ where: { id: deliverableId }, data: { status: status as never } });
  await db.deliverableDecision.create({
    data: { deliverableId, versionNumber: latestApproved.number, stage: "CLIENTE", result: approved ? "APROBADO" : "CAMBIOS", byName: who },
  });
  await db.reviewComment.create({
    data: {
      deliverableId,
      authorName: who,
      body: approved ? "✅ Aprobó el entregable." : "✏️ Solicitó cambios.",
      versionNumber: latestApproved.number,
      fromClient: true,
    },
  });
  // Avisa al equipo del proyecto (y admins) de la decisión del cliente.
  await logActivity({
    action: approved ? "deliverable.client_approved" : "deliverable.client_changes",
    summary: approved ? `aprobó la revisión de «${delName}»` : `solicitó cambios en «${delName}»`,
    projectId,
    entityType: "deliverable",
    entityId: deliverableId,
    actorName: `${who} (cliente)`,
  });
  // Aviso DIRIGIDO (in-app + correo) a todo el equipo del proyecto.
  await notifyManyAndEmail(await projectTeamIds(projectId), {
    type: "review",
    title: approved ? `Cliente aprobó: ${delName}` : `Cliente pidió cambios: ${delName}`,
    body: approved ? `${who} aprobó el entregable.` : `${who} solicitó cambios. Revisa sus comentarios.`,
    link: `/revisiones/${deliverableId}`,
  });
  revalidatePath(`/review/${token}`);
}
