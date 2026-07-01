"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { verifyReviewToken } from "@/lib/review-token";
import { logActivity } from "@/lib/activity";
import { notifyManyAndEmail } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

// Construye una clave de rate-limit a partir del token (autorización del portal) y, si está
// disponible, la IP del cliente. Así un token filtrado no puede usarse para inundar la BD
// ni spamear al equipo.
async function rlKey(token: string): Promise<string> {
  let ip = "";
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "";
  } catch {
    /* headers() no disponible: usamos solo el token */
  }
  return `${token}:${ip}`;
}

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
  const d = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { id: true, name: true, projectId: true, reviewRevokedAt: true, reviewExpiresAt: true } });
  if (!d || d.reviewRevokedAt) throw new Error("El enlace de revisión ya no está disponible");
  if (d.reviewExpiresAt && d.reviewExpiresAt.getTime() < Date.now()) throw new Error("El enlace de revisión ha caducado");
  return d;
}

export async function addReviewComment(token: string, formData: FormData) {
  // Comentar es lo más abusable (escribe en BD + avisa al equipo): límite más estricto.
  if (!rateLimit(`review-comment:${await rlKey(token)}`, 10, 60_000)) {
    throw new Error("Demasiados comentarios seguidos. Espera un momento e inténtalo de nuevo.");
  }
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
      if (drawingRaw.length <= 400_000) {
        // El dibujo se renderiza luego como <img src={drawingData.image}> en la sesión
        // del equipo. Solo aceptamos imágenes data: (png/jpeg/webp); cualquier otro
        // esquema (http(s):, javascript:, …) se descarta para evitar balizas de rastreo
        // o cargas externas que se disparen en la sesión interna del staff.
        if (parsed && typeof parsed === "object" && "image" in parsed) {
          const img = (parsed as { image?: unknown }).image;
          const okImage = typeof img === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(img);
          if (!okImage) delete (parsed as { image?: unknown }).image;
        }
        drawingData = parsed;
      }
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

// El cliente marca una foto de la galería: ME_GUSTA / NO_ME_GUSTA / PENDIENTE (toggle) + nota
// opcional. Límite generoso porque el cliente puede recorrer muchas fotos seguidas. No revalida
// la página (la galería actualiza de forma optimista); el valor queda guardado para el equipo.
export async function setPhotoPick(token: string, photoId: string, pick: string, note?: string) {
  if (!rateLimit(`review-pick:${await rlKey(token)}`, 200, 60_000)) {
    throw new Error("Demasiadas acciones seguidas. Espera un momento e inténtalo de nuevo.");
  }
  const { id: deliverableId } = await resolveDeliverable(token);
  const photo = await db.deliverablePhoto.findUnique({ where: { id: photoId }, select: { deliverableId: true } });
  if (!photo || photo.deliverableId !== deliverableId) throw new Error("Foto no encontrada");
  const value = pick === "ME_GUSTA" || pick === "NO_ME_GUSTA" ? pick : "PENDIENTE";
  await db.deliverablePhoto.update({
    where: { id: photoId },
    data: { pick: value as never, clientNote: (note ?? "").trim().slice(0, 1000) || null, pickedAt: new Date() },
  });
}

export async function setReviewDecision(token: string, decision: string, name?: string) {
  if (!rateLimit(`review-decision:${await rlKey(token)}`, 20, 60_000)) {
    throw new Error("Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.");
  }
  const { id: deliverableId, name: delName, projectId } = await resolveDeliverable(token);
  const approved = decision === "APROBADO";
  const status = approved ? "APROBADO" : "CORRECCIONES";
  const who = (name ?? "").trim().slice(0, 80) || "Cliente";

  // Solo se decide sobre un entregable abierto a revisión del cliente. Si ya está
  // APROBADO o ENTREGADO, el cliente no puede reabrirlo pidiendo cambios.
  const current = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { status: true } });
  if (!current || (current.status !== "ENVIADO_CLIENTE" && current.status !== "CORRECCIONES")) {
    throw new Error("Este entregable ya no está disponible para decidir");
  }

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
    event: "review_client",
    title: approved ? `Cliente aprobó: ${delName}` : `Cliente pidió cambios: ${delName}`,
    body: approved ? `${who} aprobó el entregable.` : `${who} solicitó cambios. Revisa sus comentarios.`,
    link: `/revisiones/${deliverableId}`,
  });
  revalidatePath(`/review/${token}`);
}

// Decisión del cliente sobre la PORTADA del reel (la imagen que acompaña al video): APROBADA o
// CAMBIOS. Independiente de la decisión sobre el video. Se ata al archivo de portada actual, así
// una portada nueva del equipo vuelve a quedar pendiente. Deja una nota en el hilo y avisa al equipo.
export async function setCoverDecision(token: string, decision: string, name?: string, note?: string) {
  if (!rateLimit(`cover-decision:${await rlKey(token)}`, 20, 60_000)) {
    throw new Error("Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.");
  }
  const { id: deliverableId, name: delName, projectId } = await resolveDeliverable(token);
  const d = await db.deliverable.findUnique({ where: { id: deliverableId }, select: { coverFileAssetId: true } });
  if (!d?.coverFileAssetId) throw new Error("Este entregable no tiene una portada para revisar");

  const approved = decision === "APROBADA";
  const who = (name ?? "").trim().slice(0, 80) || "Cliente";
  const noteClean = approved ? null : ((note ?? "").trim().slice(0, 1000) || null);

  await db.deliverable.update({
    where: { id: deliverableId },
    data: {
      coverDecisionFor: d.coverFileAssetId,
      coverDecision: approved ? "APROBADA" : "CAMBIOS",
      coverDecisionBy: who,
      coverDecisionAt: new Date(),
      coverDecisionNote: noteClean,
    },
  });
  // Nota en el hilo para que el equipo lo vea junto al resto de comentarios del cliente.
  await db.reviewComment.create({
    data: {
      deliverableId,
      authorName: who,
      body: approved ? "✅ Aprobó la portada del reel." : `✏️ Portada — pidió cambios${noteClean ? `: ${noteClean}` : "."}`,
      fromClient: true,
    },
  });
  await logActivity({
    action: approved ? "deliverable.cover_approved" : "deliverable.cover_changes",
    summary: approved ? `aprobó la portada de «${delName}»` : `pidió cambios en la portada de «${delName}»`,
    projectId,
    entityType: "deliverable",
    entityId: deliverableId,
    actorName: `${who} (cliente)`,
  });
  await notifyManyAndEmail(await projectTeamIds(projectId), {
    type: "review",
    event: "review_client",
    title: approved ? `Cliente aprobó la portada: ${delName}` : `Cliente pidió cambios en la portada: ${delName}`,
    body: approved ? `${who} aprobó la portada del reel.` : `${who} pidió cambios en la portada${noteClean ? `: ${noteClean}` : "."}`,
    link: `/revisiones/${deliverableId}`,
  });
  revalidatePath(`/review/${token}`);
}
