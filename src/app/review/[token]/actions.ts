"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { verifyReviewToken } from "@/lib/review-token";

// Acciones del portal PÚBLICO de revisión. La autorización es el token firmado
// (no hay sesión); el deliverableId siempre se deriva del token, nunca del cliente.
export async function addReviewComment(token: string, formData: FormData) {
  const deliverableId = verifyReviewToken(token);
  if (!deliverableId) throw new Error("Enlace inválido");

  const authorName = String(formData.get("authorName") ?? "").trim().slice(0, 80) || "Cliente";
  const body = String(formData.get("body") ?? "").trim().slice(0, 4000);
  const tcRaw = String(formData.get("timecode") ?? "").trim();
  const versionRaw = String(formData.get("versionNumber") ?? "").trim();
  if (!body) return;

  await db.reviewComment.create({
    data: {
      deliverableId,
      authorName,
      body,
      timecode: tcRaw && Number.isFinite(Number(tcRaw)) ? Number(tcRaw) : null,
      versionNumber: versionRaw ? Number(versionRaw) : null,
      fromClient: true,
    },
  });
  revalidatePath(`/review/${token}`);
}

export async function setReviewDecision(token: string, decision: string) {
  const deliverableId = verifyReviewToken(token);
  if (!deliverableId) throw new Error("Enlace inválido");
  const status = decision === "APROBADO" ? "APROBADO" : "CORRECCIONES";

  await db.deliverable.update({ where: { id: deliverableId }, data: { status: status as never } });
  await db.reviewComment.create({
    data: {
      deliverableId,
      authorName: String((decision === "APROBADO" ? "Cliente" : "Cliente")),
      body: status === "APROBADO" ? "✅ Aprobó el entregable." : "✏️ Solicitó cambios.",
      fromClient: true,
    },
  });
  revalidatePath(`/review/${token}`);
}
