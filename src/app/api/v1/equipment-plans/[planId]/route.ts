import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { canWriteProject } from "@/lib/project-access";
import { readJson, str, isYmd, noon, loadEquipmentPlan } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ planId: string }> };

// PATCH /api/v1/equipment-plans/:planId  body { title?, shootDate?, status? } — edita la grabación
// (escritura en su proyecto). status libre (planeando/listo/entregado/devuelto).
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { planId } = await (routeCtx as RouteCtx).params;
  const plan = await loadEquipmentPlan(planId);
  if (!plan || plan.project.archivedAt) return apiJson({ ok: false, error: "Grabación no encontrada." }, 404);
  if (!canWriteProject(plan.project, ctx.session)) return apiJson({ ok: false, error: "Sin permiso de escritura en este proyecto." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const data: Record<string, unknown> = {};
  if ("title" in body) data.title = str(body.title).slice(0, 160) || null;
  if ("status" in body && str(body.status)) data.status = str(body.status).slice(0, 24);
  if ("shootDate" in body) {
    const v = str(body.shootDate);
    if (!isYmd(v)) return apiJson({ ok: false, error: 'shootDate debe ser "YYYY-MM-DD".' }, 400);
    data.shootDate = noon(v);
  }
  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar." }, 400);
  await db.equipmentPlan.update({ where: { id: planId }, data });
  return apiJson({ ok: true });
});

// DELETE /api/v1/equipment-plans/:planId — borra la grabación (y su tarea espejo si tenía).
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { planId } = await (routeCtx as RouteCtx).params;
  const plan = await loadEquipmentPlan(planId);
  if (!plan || plan.project.archivedAt) return apiJson({ ok: false, error: "Grabación no encontrada." }, 404);
  if (!canWriteProject(plan.project, ctx.session)) return apiJson({ ok: false, error: "Sin permiso de escritura en este proyecto." }, 403);
  if (plan.taskId) await db.task.delete({ where: { id: plan.taskId } }).catch(() => null);
  await db.equipmentPlan.delete({ where: { id: planId } });
  return apiJson({ ok: true });
});
