import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { canManageProject } from "@/lib/project-access";
import { notifyManyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
import { readJson, str, loadDeliverable } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/v1/deliverables/:id/decision  body { versionNumber, result: "APROBADO"|"CAMBIOS", note? }
// Decisión de PRE-APROBACIÓN INTERNA (compuerta del equipo antes de que llegue al cliente). Espejo de
// internalDecision: decide el gestor del proyecto con aprobar_entregables, O cualquier revisor
// asignado (nunca un usuario del portal cliente). Aprobar libera la versión al cliente; solicitar
// cambios deja el entregable en CORRECCIONES y sella los comentarios internos de esa versión.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const acc = await loadDeliverable(id);
  if (!acc || acc.project.archivedAt) return apiJson({ ok: false, error: "Entregable no encontrado." }, 404);
  const meta = await db.deliverable.findUnique({ where: { id }, select: { reviewerId: true } });
  const isReviewer = acc.reviewers.some((r) => r.userId === ctx.session.id) || (!!meta?.reviewerId && meta.reviewerId === ctx.session.id);
  const mayDecide =
    (canManageProject(acc.project, ctx.session) && hasPermission(ctx.session, "aprobar_entregables")) ||
    (ctx.session.role !== "cliente" && isReviewer);
  if (!mayDecide) return apiJson({ ok: false, error: "Solo el revisor asignado o quien gestiona el proyecto (con aprobar_entregables) puede decidir." }, 403);

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const versionNumber = Math.trunc(Number(body.versionNumber));
  if (!Number.isFinite(versionNumber) || versionNumber < 1) return apiJson({ ok: false, error: "versionNumber inválido." }, 400);
  const result = str(body.result).toUpperCase();
  if (result !== "APROBADO" && result !== "CAMBIOS") return apiJson({ ok: false, error: 'result debe ser "APROBADO" o "CAMBIOS".' }, 400);
  const note = clampText(str(body.note)).slice(0, 1000) || null;
  const exists = await db.deliverableVersion.findFirst({ where: { deliverableId: id, number: versionNumber }, select: { id: true } });
  if (!exists) return apiJson({ ok: false, error: `No existe la versión v${versionNumber}.` }, 404);

  // GUARDA DE ESTADO + VERSIÓN: solo se decide sobre la ÚLTIMA versión y solo mientras el entregable
  // está en REVISION_INTERNA. Sin esto, un revisor podía «aprobar» una versión vieja y REGRESAR un
  // entregable ya aprobado por el cliente a ENVIADO_CLIENTE, re-notificándolo.
  const state = await db.deliverable.findUnique({ where: { id }, select: { status: true, versions: { orderBy: { number: "desc" }, take: 1, select: { number: true } } } });
  const latest = state?.versions[0]?.number ?? 0;
  if (versionNumber !== latest) return apiJson({ ok: false, error: `Solo se puede decidir sobre la ÚLTIMA versión (v${latest}), no una anterior.` }, 409);
  if (state?.status !== "REVISION_INTERNA") return apiJson({ ok: false, error: `El entregable no está en revisión interna (estado ${state?.status}); no se puede decidir.` }, 409);

  await db.deliverableDecision.create({ data: { deliverableId: id, versionNumber, stage: "INTERNA", result, byUserId: ctx.session.id, note } });
  if (result === "APROBADO") {
    await db.deliverableVersion.updateMany({ where: { deliverableId: id, number: versionNumber }, data: { internalApproved: true, internalApprovedAt: new Date() } });
    await db.deliverable.update({ where: { id }, data: { status: "ENVIADO_CLIENTE" } });
    const clients = await db.projectMember.findMany({ where: { projectId: acc.projectId, user: { role: { key: "cliente" } } }, select: { userId: true } });
    if (clients.length) await notifyManyAndEmail(clients.map((m) => m.userId), { type: "review", event: "client_deliverable_ready", title: `Tu entregable está listo: ${acc.name}`, body: "Ya puedes verlo, comentarlo y aprobarlo desde tu portal.", link: `/mis-entregas/${acc.projectId}`, actorId: ctx.session.id }).catch(() => null);
  } else {
    await db.deliverable.update({ where: { id }, data: { status: "CORRECCIONES" } });
    await db.reviewComment.updateMany({ where: { deliverableId: id, versionNumber, fromClient: false, lockedAt: null }, data: { lockedAt: new Date() } });
  }
  await logActivity({ action: "deliverable.preapproval", summary: `${result === "APROBADO" ? "pre-aprobó" : "solicitó cambios en"} la v${versionNumber} de «${acc.name}» (vía API)`, projectId: acc.projectId, entityType: "deliverable", entityId: id }).catch(() => null);
  return apiJson({ ok: true, result });
});
