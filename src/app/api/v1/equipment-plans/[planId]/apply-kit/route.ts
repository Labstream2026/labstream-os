import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { canWriteProject } from "@/lib/project-access";
import { readJson, str, loadEquipmentPlan } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ planId: string }> };

// POST /api/v1/equipment-plans/:planId/apply-kit  body { kitId } — vuelca los items de un kit
// guardado como reservas de la grabación (upsert). Espejo de applyKit: escritura en el proyecto.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { planId } = await (routeCtx as RouteCtx).params;
  const plan = await loadEquipmentPlan(planId);
  if (!plan || plan.project.archivedAt) return apiJson({ ok: false, error: "Grabación no encontrada." }, 404);
  if (!canWriteProject(plan.project, ctx.session)) return apiJson({ ok: false, error: "Sin permiso de escritura en este proyecto." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const kitId = str(body.kitId);
  const kit = await db.equipmentKit.findUnique({ where: { id: kitId }, select: { items: { select: { rowId: true, quantity: true } } } });
  if (!kit) return apiJson({ ok: false, error: "Kit no encontrado." }, 404);
  for (const it of kit.items) {
    await db.equipmentReservation.upsert({
      where: { planId_rowId: { planId, rowId: it.rowId } },
      create: { planId, rowId: it.rowId, quantity: it.quantity },
      update: { quantity: it.quantity },
    });
  }
  return apiJson({ ok: true, applied: kit.items.length });
});
