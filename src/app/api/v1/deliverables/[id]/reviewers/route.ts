import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { canManageProject } from "@/lib/project-access";
import { notifyManyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
import { readJson, strArr, loadDeliverable } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/deliverables/:id/reviewers — revisores (pre-aprobadores) actuales.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const acc = await loadDeliverable(id);
  if (!acc || acc.project.archivedAt) return apiJson({ ok: false, error: "Entregable no encontrado." }, 404);
  if (!canManageProject(acc.project, ctx.session)) return apiJson({ ok: false, error: "Sin permiso para gestionar este entregable." }, 403);
  const rows = await db.deliverableReviewer.findMany({ where: { deliverableId: id }, select: { user: { select: { id: true, name: true } } } });
  return apiJson({ ok: true, reviewers: rows.map((r) => ({ id: r.user.id, name: r.user.name })) });
});

// PUT /api/v1/deliverables/:id/reviewers  body { userIds: [] } — fija el CONJUNTO de revisores
// internos (reemplaza el anterior). Espejo (subconjunto seguro) de setDeliverableReviewers: solo
// gestores del proyecto; cada revisor debe ser miembro/líder del EQUIPO del proyecto (no del portal
// cliente — la revisión directa de cliente se gestiona desde la app). Notifica a los nuevos.
export const PUT = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const acc = await loadDeliverable(id);
  if (!acc || acc.project.archivedAt) return apiJson({ ok: false, error: "Entregable no encontrado." }, 404);
  if (!canManageProject(acc.project, ctx.session)) return apiJson({ ok: false, error: "Sin permiso para gestionar este entregable." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const requested = [...new Set(strArr(body.userIds))];
  const eligible = new Set([acc.project.leadId, ...acc.project.members.map((m) => m.userId)].filter(Boolean) as string[]);
  const valid: string[] = [];
  if (requested.length) {
    const users = await db.user.findMany({ where: { id: { in: requested }, active: true }, select: { id: true, role: { select: { key: true } } } });
    for (const u of users) if (eligible.has(u.id) && u.role?.key !== "cliente") valid.push(u.id);
    const bad = requested.filter((r) => !valid.includes(r));
    if (bad.length) return apiJson({ ok: false, error: `Estos usuarios no son revisores válidos del equipo del proyecto: ${bad.join(", ")}.` }, 400);
  }

  const before = new Set((await db.deliverableReviewer.findMany({ where: { deliverableId: id }, select: { userId: true } })).map((r) => r.userId));
  await db.deliverableReviewer.deleteMany({ where: { deliverableId: id, userId: { notIn: valid.length ? valid : ["__none__"] } } });
  if (valid.length) await db.deliverableReviewer.createMany({ data: valid.map((userId) => ({ deliverableId: id, userId })), skipDuplicates: true });
  await db.deliverable.update({ where: { id }, data: { reviewerId: valid[0] ?? null } });

  const added = valid.filter((u) => !before.has(u) && u !== ctx.session.id);
  if (added.length) {
    await notifyManyAndEmail(added, { type: "review", event: "review_reviewer", title: `Eres revisor de: ${acc.name}`, body: "Te asignaron como revisor: puedes pre-aprobar o solicitar cambios en este entregable.", link: `/revisiones/${id}`, actorId: ctx.session.id }).catch(() => null);
  }
  await logActivity({ action: "deliverable.reviewers", summary: `actualizó los revisores de «${acc.name}» (vía API)`, projectId: acc.projectId, entityType: "deliverable", entityId: id }).catch(() => null);
  return apiJson({ ok: true, reviewers: valid });
});
