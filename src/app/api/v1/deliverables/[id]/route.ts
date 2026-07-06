import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { canAccessProject, canWriteProject, canManageProject } from "@/lib/project-access";
import { isDeliverableStatus, isDeliverableType } from "@/lib/enum-guards";
import { logActivity } from "@/lib/activity";
import { readJson, str, ymd, isYmd, loadDeliverable } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/deliverables/:id — detalle del entregable: versiones, revisores, decisiones y conteos.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const acc = await loadDeliverable(id);
  if (!acc || acc.project.archivedAt) return apiJson({ ok: false, error: "Entregable no encontrado." }, 404);
  if (!canAccessProject(acc.project, ctx.session)) return apiJson({ ok: false, error: "Sin acceso a este entregable." }, 403);

  const d = await db.deliverable.findUnique({
    where: { id },
    select: {
      id: true, name: true, type: true, status: true, dueDate: true, archivedAt: true,
      copy: true, hashtags: true, reviewExpiresAt: true, reviewAllowDrawings: true, reviewVisits: true,
      owner: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
      reviewers: { select: { user: { select: { id: true, name: true } } } },
      versions: { orderBy: { number: "desc" }, select: { number: true, notes: true, fileUrl: true, durationSec: true, internalApproved: true, internalApprovedAt: true, createdAt: true, uploadedBy: { select: { name: true } } } },
      decisions: { orderBy: { createdAt: "desc" }, take: 20, select: { versionNumber: true, stage: true, result: true, byName: true, note: true, createdAt: true } },
      _count: { select: { photos: true, reviewComments: true } },
    },
  });
  if (!d) return apiJson({ ok: false, error: "Entregable no encontrado." }, 404);
  return apiJson({
    ok: true,
    deliverable: {
      id: d.id, name: d.name, type: d.type, status: d.status, dueDate: ymd(d.dueDate),
      archived: !!d.archivedAt, copy: d.copy, hashtags: d.hashtags,
      reviewExpiresAt: d.reviewExpiresAt ? d.reviewExpiresAt.toISOString() : null,
      allowDrawings: d.reviewAllowDrawings, reviewVisits: d.reviewVisits,
      owner: d.owner ? { id: d.owner.id, name: d.owner.name } : null,
      reviewer: d.reviewer ? { id: d.reviewer.id, name: d.reviewer.name } : null,
      reviewers: d.reviewers.map((r) => ({ id: r.user.id, name: r.user.name })),
      versions: d.versions.map((v) => ({ number: v.number, notes: v.notes, fileUrl: v.fileUrl, durationSec: v.durationSec, internalApproved: v.internalApproved, internalApprovedAt: v.internalApprovedAt ? v.internalApprovedAt.toISOString() : null, createdAt: v.createdAt.toISOString(), uploadedBy: v.uploadedBy?.name ?? null })),
      decisions: d.decisions.map((x) => ({ versionNumber: x.versionNumber, stage: x.stage, result: x.result, by: x.byName, note: x.note, at: x.createdAt.toISOString() })),
      photoCount: d._count.photos, commentCount: d._count.reviewComments,
    },
  });
});

// PATCH /api/v1/deliverables/:id  body { name?, status?, type?, dueDate?, copy?, hashtags?, reviewExpiresAt? }
// Compuertas por campo (espejo de los server actions):
//  - status/type/copy/hashtags → escritura en el proyecto (canWriteProject)
//  - dueDate → escritura + gestionar_cronograma (o dueño del entregable)
//  - name/reviewExpiresAt → gestión del proyecto (canManageProject)
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  const acc = await loadDeliverable(id);
  if (!acc || acc.project.archivedAt) return apiJson({ ok: false, error: "Entregable no encontrado." }, 404);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const canWrite = canWriteProject(acc.project, ctx.session);
  const canManage = canManageProject(acc.project, ctx.session);
  const data: Record<string, unknown> = {};

  if ("name" in body) {
    if (!canManage) return apiJson({ ok: false, error: "Renombrar un entregable requiere gestionar el proyecto." }, 403);
    const name = str(body.name).slice(0, 200);
    if (!name) return apiJson({ ok: false, error: "El nombre no puede quedar vacío." }, 400);
    data.name = name;
  }
  if ("status" in body || "type" in body || "copy" in body || "hashtags" in body) {
    if (!canWrite) return apiJson({ ok: false, error: "Sin permiso de escritura en este proyecto." }, 403);
  }
  if (typeof body.status === "string") {
    if (!isDeliverableStatus(body.status)) return apiJson({ ok: false, error: `status inválido (${body.status}).` }, 400);
    data.status = body.status;
  }
  if (typeof body.type === "string") {
    if (!isDeliverableType(body.type)) return apiJson({ ok: false, error: `type inválido (${body.type}).` }, 400);
    data.type = body.type;
  }
  if (typeof body.copy === "string") data.copy = clampText(body.copy.trim()).slice(0, 5000) || null;
  if (typeof body.hashtags === "string") data.hashtags = body.hashtags.trim().slice(0, 5000) || null;
  if ("dueDate" in body) {
    if (!canWrite || !(hasPermission(ctx.session, "gestionar_cronograma") || acc.ownerId === ctx.session.id)) {
      return apiJson({ ok: false, error: "Cambiar la entrega requiere gestionar_cronograma (o ser dueño del entregable)." }, 403);
    }
    const v = str(body.dueDate);
    if (!v) data.dueDate = null;
    else if (isYmd(v)) data.dueDate = new Date(`${v}T12:00:00.000Z`);
    else return apiJson({ ok: false, error: 'dueDate debe ser "YYYY-MM-DD" o null.' }, 400);
  }
  if ("reviewExpiresAt" in body) {
    if (!canManage) return apiJson({ ok: false, error: "Cambiar la caducidad del enlace requiere gestionar el proyecto." }, 403);
    const v = str(body.reviewExpiresAt);
    if (!v) data.reviewExpiresAt = null;
    else if (isYmd(v)) data.reviewExpiresAt = new Date(`${v}T23:59:59.000Z`);
    else return apiJson({ ok: false, error: 'reviewExpiresAt debe ser "YYYY-MM-DD" o null.' }, 400);
  }
  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar (o sin permiso para los campos enviados)." }, 400);

  await db.deliverable.update({ where: { id }, data });
  await logActivity({ action: "deliverable.update", summary: `editó el entregable «${acc.name}» (vía API)`, projectId: acc.projectId, entityType: "deliverable", entityId: id }).catch(() => null);
  return apiJson({ ok: true });
});

// DELETE /api/v1/deliverables/:id — ARCHIVA el entregable (lo saca del inbox de gestión pero NO
// toca el enlace de entrega, que sigue vivo; reversible con POST /restore). Espejo de
// setDeliverableArchived: canManageProject. El borrado físico no se expone por API.
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const acc = await loadDeliverable(id);
  if (!acc || acc.project.archivedAt) return apiJson({ ok: false, error: "Entregable no encontrado." }, 404);
  if (!canManageProject(acc.project, ctx.session)) return apiJson({ ok: false, error: "Sin permiso para gestionar este entregable." }, 403);
  await db.deliverable.update({ where: { id }, data: { archivedAt: new Date() } });
  await logActivity({ action: "deliverable.archive", summary: `archivó el entregable «${acc.name}» (vía API)`, projectId: acc.projectId, entityType: "deliverable", entityId: id }).catch(() => null);
  return apiJson({ ok: true });
});
