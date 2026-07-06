import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { canWriteProject } from "@/lib/project-access";
import { readJson, str, loadEquipmentPlan } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ planId: string; reservationId: string }> };

async function gate(planId: string, reservationId: string, ctx: ApiKeyContext) {
  const res = await db.equipmentReservation.findUnique({ where: { id: reservationId }, select: { planId: true } });
  if (!res || res.planId !== planId) return apiJson({ ok: false, error: "Reserva no encontrada." }, 404);
  const plan = await loadEquipmentPlan(planId);
  if (!plan || plan.project.archivedAt) return apiJson({ ok: false, error: "Grabación no encontrada." }, 404);
  if (!canWriteProject(plan.project, ctx.session)) return apiJson({ ok: false, error: "Sin permiso de escritura en este proyecto." }, 403);
  return null;
}

// PATCH /api/v1/equipment-plans/:planId/reservations/:reservationId  body { quantity?, packed?, note? }
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { planId, reservationId } = await (routeCtx as RouteCtx).params;
  const bad = await gate(planId, reservationId, ctx);
  if (bad) return bad;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const data: Record<string, unknown> = {};
  if ("quantity" in body) data.quantity = Math.max(1, Number.isFinite(Number(body.quantity)) ? Math.round(Number(body.quantity)) : 1);
  if (typeof body.packed === "boolean") data.packed = body.packed;
  if ("note" in body) data.note = str(body.note).slice(0, 200) || null;
  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar." }, 400);
  const res = await db.equipmentReservation.update({ where: { id: reservationId }, data, select: { id: true, rowId: true, quantity: true, packed: true, note: true } });
  return apiJson({ ok: true, reservation: res });
});

// DELETE /api/v1/equipment-plans/:planId/reservations/:reservationId
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { planId, reservationId } = await (routeCtx as RouteCtx).params;
  const bad = await gate(planId, reservationId, ctx);
  if (bad) return bad;
  await db.equipmentReservation.delete({ where: { id: reservationId } });
  return apiJson({ ok: true });
});
