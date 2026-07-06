import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { canAccessProject, canWriteProject } from "@/lib/project-access";
import { safeExternalUrl } from "@/lib/url";
import { notifyManyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
import { readJson, str, loadDeliverable } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/deliverables/:id/versions — versiones del entregable (número, enlace, aprobación interna).
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const acc = await loadDeliverable(id);
  if (!acc || acc.project.archivedAt) return apiJson({ ok: false, error: "Entregable no encontrado." }, 404);
  if (!canAccessProject(acc.project, ctx.session)) return apiJson({ ok: false, error: "Sin acceso a este entregable." }, 403);
  const rows = await db.deliverableVersion.findMany({ where: { deliverableId: id }, orderBy: { number: "desc" }, select: { number: true, notes: true, fileUrl: true, durationSec: true, internalApproved: true, internalApprovedAt: true, createdAt: true, uploadedBy: { select: { name: true } } } });
  return apiJson({ ok: true, versions: rows.map((v) => ({ number: v.number, notes: v.notes, fileUrl: v.fileUrl, durationSec: v.durationSec, internalApproved: v.internalApproved, internalApprovedAt: v.internalApprovedAt ? v.internalApprovedAt.toISOString() : null, createdAt: v.createdAt.toISOString(), uploadedBy: v.uploadedBy?.name ?? null })) });
});

// POST /api/v1/deliverables/:id/versions  body { fileUrl, notes?, durationSec? } — sube una versión
// POR ENLACE (Drive/URL; la subida de binario es solo por la app). Espejo del núcleo de
// addDeliverableVersion: escritura en el proyecto + subir_archivos (o dueño del entregable). Si todos
// los revisores son del portal cliente, la versión va DIRECTA al cliente (queda aprobada internamente);
// si no, entra en revisión interna y avisa al revisor.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  const acc = await loadDeliverable(id);
  if (!acc || acc.project.archivedAt) return apiJson({ ok: false, error: "Entregable no encontrado." }, 404);
  if (!canWriteProject(acc.project, ctx.session)) return apiJson({ ok: false, error: "Sin permiso de escritura en este proyecto." }, 403);
  if (!hasPermission(ctx.session, "subir_archivos") && acc.ownerId !== ctx.session.id) return apiJson({ ok: false, error: "Subir una versión requiere subir_archivos (o ser dueño del entregable)." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const fileUrl = safeExternalUrl(str(body.fileUrl));
  if (!fileUrl) return apiJson({ ok: false, error: "fileUrl debe ser una URL http(s) válida." }, 400);
  const notes = clampText(str(body.notes)) || null;
  const durationSec = Number.isFinite(Number(body.durationSec)) && Number(body.durationSec) > 0 ? Math.round(Number(body.durationSec)) : null;

  const reviewers = await db.deliverableReviewer.findMany({ where: { deliverableId: id }, select: { userId: true, user: { select: { role: { select: { key: true } } } } } });
  const directToClient = reviewers.length > 0 && reviewers.every((r) => r.user.role?.key === "cliente");
  const last = await db.deliverableVersion.findFirst({ where: { deliverableId: id }, orderBy: { number: "desc" }, select: { number: true } });
  const number = (last?.number ?? 0) + 1;

  await db.deliverableVersion.create({ data: { deliverableId: id, number, notes, fileUrl, durationSec, uploadedById: ctx.session.id, internalApproved: directToClient, internalApprovedAt: directToClient ? new Date() : null } });
  await db.deliverable.update({ where: { id }, data: { status: directToClient ? "ENVIADO_CLIENTE" : "REVISION_INTERNA" } });

  const recipients = (reviewers.length ? reviewers.map((r) => r.userId) : [acc.project.leadId ?? acc.ownerId].filter(Boolean) as string[]).filter((u) => u !== ctx.session.id);
  if (recipients.length) {
    await notifyManyAndEmail(recipients, directToClient
      ? { type: "review", event: "client_deliverable_ready", title: `Nueva versión lista: ${acc.name}`, body: `El equipo subió la v${number}. Ya puedes verla, comentarla y aprobarla.`, link: `/mis-entregas/${acc.projectId}`, actorId: ctx.session.id }
      : { type: "review", event: "review_pending", title: `Revisión pendiente: ${acc.name}`, body: `Se subió la v${number} (vía API). Revísala y pre-apruébala o solicita cambios.`, link: `/revisiones/${id}`, actorId: ctx.session.id }).catch(() => null);
  }
  await logActivity({ action: "deliverable.version", summary: `subió la v${number} de «${acc.name}» (vía API)`, projectId: acc.projectId, entityType: "deliverable", entityId: id }).catch(() => null);
  return apiJson({ ok: true, version: { number, fileUrl, internalApproved: directToClient } }, 201);
});
