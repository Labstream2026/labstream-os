import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { canWriteProject } from "@/lib/project-access";
import { readJson, str, loadEquipmentPlan } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ planId: string }> };

// POST /api/v1/equipment-plans/:planId/reservations  body { rowId, quantity?, note? } — reserva un
// item del inventario (rowId = fila de sys:inventario; ver GET /api/v1/inventory). Upsert por (plan,row).
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { planId } = await (routeCtx as RouteCtx).params;
  const plan = await loadEquipmentPlan(planId);
  if (!plan || plan.project.archivedAt) return apiJson({ ok: false, error: "Grabación no encontrada." }, 404);
  if (!canWriteProject(plan.project, ctx.session)) return apiJson({ ok: false, error: "Sin permiso de escritura en este proyecto." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const rowId = str(body.rowId);
  if (!rowId) return apiJson({ ok: false, error: "rowId es obligatorio (fila de sys:inventario)." }, 400);
  const row = await db.dataRow.findUnique({ where: { id: rowId }, select: { table: { select: { key: true } } } });
  if (!row || row.table?.key !== "sys:inventario") return apiJson({ ok: false, error: "rowId no es un item válido del inventario." }, 400);
  const quantity = Math.max(1, Number.isFinite(Number(body.quantity)) ? Math.round(Number(body.quantity)) : 1);
  const note = str(body.note).slice(0, 200) || null;
  const res = await db.equipmentReservation.upsert({
    where: { planId_rowId: { planId, rowId } },
    create: { planId, rowId, quantity, note },
    update: { quantity, ...(note ? { note } : {}) },
    select: { id: true, rowId: true, quantity: true, packed: true, note: true },
  });
  return apiJson({ ok: true, reservation: res }, 201);
});
