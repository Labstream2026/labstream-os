"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { verifyCoversToken } from "@/lib/review-token";
import { notifyManyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
import { rateLimit } from "@/lib/rate-limit";

// Acciones del enlace PÚBLICO del banco de portadas (/portadas/[token]). La autorización es
// el token firmado por PROYECTO; el coverId siempre se valida contra ese proyecto. Mismo
// patrón que las acciones de /review/[token].

async function rlKey(token: string): Promise<string> {
  let ip = "";
  try {
    const h = await headers();
    ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "";
  } catch { /* sin headers */ }
  return `${token}:${ip}`;
}

async function resolveProject(token: string) {
  const projectId = verifyCoversToken(token);
  if (!projectId) throw new Error("Enlace inválido");
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, leadId: true, coversRevokedAt: true, archivedAt: true, members: { select: { userId: true } } },
  });
  if (!p || p.coversRevokedAt || p.archivedAt) throw new Error("El enlace de portadas ya no está disponible");
  return p;
}

function teamIds(p: { leadId: string | null; members: { userId: string }[] }): string[] {
  return [p.leadId, ...p.members.map((m) => m.userId)].filter((id): id is string => Boolean(id));
}

// Mejora 9 · un solo estado de portada: cuando el cliente decide en el BANCO y esa portada
// está vinculada a un video, se escribe también la decisión de la portada DEL VIDEO. Sin esto,
// la sala del reel seguía diciendo «pendiente de tu revisión» sobre una portada ya aprobada.
async function syncDeliverableCoverDecision(
  deliverableId: string | null,
  fileAssetId: string,
  decision: "APROBADA" | "CAMBIOS",
  who: string,
  note: string | null,
) {
  if (!deliverableId) return;
  await db.deliverable
    .update({
      where: { id: deliverableId },
      data: {
        ...(decision === "APROBADA" ? { coverFileAssetId: fileAssetId } : {}),
        coverDecisionFor: fileAssetId,
        coverDecision: decision,
        coverDecisionBy: who,
        coverDecisionAt: new Date(),
        coverDecisionNote: note,
      },
    })
    .catch(() => {});
}

// Anotación del cliente sobre UNA portada: nota escrita y/o dibujo encima de la imagen. No
// cambia la decisión — es feedback para el diseñador, y puede haber varias por portada.
// El dibujo llega como data URL; se valida el prefijo (misma allowlist que las correcciones
// de video) y se acota el tamaño para no engordar la fila.
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_DRAWING = 700_000;

export async function addCoverNote(
  token: string,
  coverId: string,
  input: { body?: string; drawing?: string | null; name?: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!rateLimit(`covers-note:${await rlKey(token)}`, 30, 60_000)) {
    return { ok: false, message: "Demasiadas notas seguidas. Espera un momento." };
  }
  let project: Awaited<ReturnType<typeof resolveProject>>;
  try {
    project = await resolveProject(token);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Enlace no disponible." };
  }
  const cover = await db.projectCover.findUnique({
    where: { id: coverId },
    select: { projectId: true, name: true, deliverable: { select: { name: true } } },
  });
  if (!cover || cover.projectId !== project.id) return { ok: false, message: "Esta portada ya no existe. Recarga la página." };

  const who = (input.name ?? "").trim().slice(0, 80) || "Cliente";
  const body = (input.body ?? "").trim().slice(0, 1000) || null;
  const raw = input.drawing ?? null;
  const drawing = raw && DATA_URL.test(raw) && raw.length <= MAX_DRAWING ? raw : null;
  if (!body && !drawing) return { ok: false, message: "Escribe una nota o dibuja algo sobre la portada." };

  await db.coverNote.create({ data: { coverId, authorName: who, fromClient: true, body, drawing } });
  // La portada queda marcada como «con cambios pedidos» para que el equipo la vea en su bandeja.
  await db.projectCover.update({ where: { id: coverId }, data: { decision: "CAMBIOS", decisionBy: who, decisionAt: new Date(), decisionNote: body } });

  await logActivity({
    action: "cover.client_note",
    summary: `anotó la portada «${cover.name}»${drawing ? " (con dibujo)" : ""}`,
    projectId: project.id,
    entityType: "project",
    entityId: project.id,
    actorName: `${who} (cliente)`,
  });
  const recipients = teamIds(project);
  if (recipients.length) {
    await notifyManyAndEmail(recipients, {
      type: "review",
      event: "review_client",
      title: `${drawing ? "✏️ Anotación" : "Nota"} en portada: ${cover.name}`,
      body: `${who}${cover.deliverable ? ` en «${cover.deliverable.name}»` : ""}: ${body ?? "marcó los cambios sobre la imagen."}`,
      link: `/proyectos/${project.id}?tab=entregables`,
    });
  }
  revalidatePath(`/portadas/${token}`);
  return { ok: true };
}

// Mejora 3 · deshacer la decisión: aprobar o descartar deja de ser una puerta sin retorno
// mientras el enlace siga vivo. Si la portada era la oficial del video, se suelta también.
export async function undoCoverDecision(token: string, coverId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!rateLimit(`covers-undo:${await rlKey(token)}`, 30, 60_000)) {
    return { ok: false, message: "Demasiadas acciones seguidas. Espera un momento." };
  }
  let project: Awaited<ReturnType<typeof resolveProject>>;
  try {
    project = await resolveProject(token);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Enlace no disponible." };
  }
  const cover = await db.projectCover.findUnique({
    where: { id: coverId },
    select: { projectId: true, fileAssetId: true, deliverableId: true },
  });
  if (!cover || cover.projectId !== project.id) return { ok: false, message: "Esta portada ya no existe. Recarga la página." };

  await db.projectCover.update({
    where: { id: coverId },
    data: { decision: null, decisionBy: null, decisionAt: null, decisionNote: null },
  });
  // Si era la portada oficial del video, el video vuelve a quedarse sin portada decidida.
  if (cover.deliverableId) {
    await db.deliverable
      .updateMany({
        where: { id: cover.deliverableId, coverFileAssetId: cover.fileAssetId },
        data: { coverFileAssetId: null, coverDecision: null, coverDecisionFor: null, coverDecisionBy: null, coverDecisionAt: null, coverDecisionNote: null },
      })
      .catch(() => {});
  }
  revalidatePath(`/portadas/${token}`);
  return { ok: true };
}

// Decide sobre UNA portada: APROBADA o CAMBIOS (con nota). Si la portada está vinculada a un
// video y queda APROBADA, se convierte en su portada oficial (coverFileAssetId) — alimenta la
// sala del reel y Entregas finales sin más pasos.
export async function decideBankCover(
  token: string,
  coverId: string,
  decision: string,
  name?: string,
  note?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!rateLimit(`covers-decision:${await rlKey(token)}`, 60, 60_000)) {
    return { ok: false, message: "Demasiadas acciones seguidas. Espera un momento." };
  }
  let project: Awaited<ReturnType<typeof resolveProject>>;
  try {
    project = await resolveProject(token);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Enlace no disponible." };
  }
  const value = decision === "APROBADA" ? "APROBADA" : "CAMBIOS";
  const who = (name ?? "").trim().slice(0, 80) || "Cliente";
  const noteClean = value === "CAMBIOS" ? ((note ?? "").trim().slice(0, 1000) || null) : null;

  const cover = await db.projectCover.findUnique({
    where: { id: coverId },
    select: { projectId: true, name: true, fileAssetId: true, deliverableId: true, deliverable: { select: { name: true } } },
  });
  if (!cover || cover.projectId !== project.id) return { ok: false, message: "Esta portada ya no existe. Recarga la página." };

  await db.projectCover.update({
    where: { id: coverId },
    data: { decision: value, decisionBy: who, decisionAt: new Date(), decisionNote: noteClean },
  });
  await syncDeliverableCoverDecision(cover.deliverableId, cover.fileAssetId, value, who, noteClean);

  await logActivity({
    action: value === "APROBADA" ? "cover.client_approved" : "cover.client_changes",
    summary: value === "APROBADA" ? `aprobó la portada «${cover.name}»` : `pidió cambios en la portada «${cover.name}»`,
    projectId: project.id,
    entityType: "project",
    entityId: project.id,
    actorName: `${who} (cliente)`,
  });
  const recipients = teamIds(project);
  if (recipients.length) {
    await notifyManyAndEmail(recipients, {
      type: "review",
      event: "review_client",
      title: value === "APROBADA" ? `Portada aprobada: ${cover.name}` : `Cambios en portada: ${cover.name}`,
      body:
        value === "APROBADA"
          ? `${who} aprobó la portada${cover.deliverable ? ` de «${cover.deliverable.name}»` : ""}.`
          : `${who} pidió cambios${noteClean ? `: ${noteClean.slice(0, 200)}` : "."}`,
      link: `/proyectos/${project.id}?tab=entregables`,
    });
  }
  revalidatePath(`/portadas/${token}`);
  return { ok: true };
}

// Grupo A/B: el cliente elige LA ganadora entre las portadas vinculadas al mismo video. La
// ganadora queda APROBADA (y como portada oficial del video); sus hermanas, DESCARTADA.
export async function chooseCoverWinner(
  token: string,
  coverId: string,
  name?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!rateLimit(`covers-winner:${await rlKey(token)}`, 30, 60_000)) {
    return { ok: false, message: "Demasiadas acciones seguidas. Espera un momento." };
  }
  let project: Awaited<ReturnType<typeof resolveProject>>;
  try {
    project = await resolveProject(token);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Enlace no disponible." };
  }
  const who = (name ?? "").trim().slice(0, 80) || "Cliente";

  const cover = await db.projectCover.findUnique({
    where: { id: coverId },
    select: { projectId: true, name: true, fileAssetId: true, deliverableId: true, deliverable: { select: { name: true } } },
  });
  if (!cover || cover.projectId !== project.id) return { ok: false, message: "Esta portada ya no existe. Recarga la página." };
  if (!cover.deliverableId) return { ok: false, message: "Esta portada no está vinculada a un video." };

  const now = new Date();
  await db.projectCover.update({
    where: { id: coverId },
    data: { decision: "APROBADA", decisionBy: who, decisionAt: now, decisionNote: null },
  });
  await db.projectCover.updateMany({
    where: { deliverableId: cover.deliverableId, id: { not: coverId } },
    data: { decision: "DESCARTADA", decisionBy: who, decisionAt: now, decisionNote: null },
  });
  await syncDeliverableCoverDecision(cover.deliverableId, cover.fileAssetId, "APROBADA", who, null);

  await logActivity({
    action: "cover.client_winner",
    summary: `eligió «${cover.name}» como portada de «${cover.deliverable?.name ?? "?"}»`,
    projectId: project.id,
    entityType: "project",
    entityId: project.id,
    actorName: `${who} (cliente)`,
  });
  const recipients = teamIds(project);
  if (recipients.length) {
    await notifyManyAndEmail(recipients, {
      type: "review",
      event: "review_client",
      title: `Portada elegida: ${cover.deliverable?.name ?? cover.name}`,
      body: `${who} eligió «${cover.name}» como la portada ganadora.`,
      link: `/proyectos/${project.id}?tab=entregables`,
    });
  }
  revalidatePath(`/portadas/${token}`);
  return { ok: true };
}
