"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { verifyReviewToken } from "@/lib/review-token";

// Acciones del portal PÚBLICO de revisión. La autorización es el token firmado
// (no hay sesión); el deliverableId siempre se deriva del token, nunca del cliente.

// Comprueba que el entregable existe y su enlace no está revocado.
async function resolveDeliverable(token: string) {
  const deliverableId = verifyReviewToken(token);
  if (!deliverableId) throw new Error("Enlace inválido");
  const d = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { id: true, reviewRevokedAt: true } });
  if (!d || d.reviewRevokedAt) throw new Error("El enlace de revisión ya no está disponible");
  return d.id;
}

export async function addReviewComment(token: string, formData: FormData) {
  const deliverableId = await resolveDeliverable(token);

  const authorName = String(formData.get("authorName") ?? "").trim().slice(0, 80) || "Cliente";
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  const tcRaw = String(formData.get("timecode") ?? "").trim();
  const versionRaw = String(formData.get("versionNumber") ?? "").trim();
  const drawingRaw = String(formData.get("drawingData") ?? "").trim();
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
      timecode: tcRaw && Number.isFinite(Number(tcRaw)) ? Number(tcRaw) : null,
      versionNumber: versionRaw ? Number(versionRaw) : null,
      drawingData: (drawingData ?? undefined) as never,
      fromClient: true,
    },
  });
  revalidatePath(`/review/${token}`);
}

export async function setReviewDecision(token: string, decision: string, name?: string) {
  const deliverableId = await resolveDeliverable(token);
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
  revalidatePath(`/review/${token}`);
}
