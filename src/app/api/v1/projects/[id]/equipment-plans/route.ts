import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { logActivity } from "@/lib/activity";
import { readJson, str, ymd, isYmd, noon, loadProjectForRead, loadProjectForWrite } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/projects/:id/equipment-plans — grabaciones (planes de equipos) del proyecto, con sus reservas.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForRead(id, ctx.session);
  if (access instanceof NextResponse) return access;
  const plans = await db.equipmentPlan.findMany({
    where: { projectId: id }, orderBy: { shootDate: "asc" },
    select: { id: true, title: true, shootDate: true, status: true, assignee: { select: { id: true, name: true } }, items: { select: { id: true, rowId: true, quantity: true, packed: true, note: true } } },
  });
  return apiJson({ ok: true, plans: plans.map((p) => ({ id: p.id, title: p.title, shootDate: ymd(p.shootDate), status: p.status, assignee: p.assignee ? { id: p.assignee.id, name: p.assignee.name } : null, reservations: p.items.map((r) => ({ id: r.id, rowId: r.rowId, quantity: r.quantity, packed: r.packed, note: r.note })) })) });
});

// POST /api/v1/projects/:id/equipment-plans  body { shootDate, title? } — crea una grabación
// (escritura en el proyecto). shootDate "YYYY-MM-DD" (granularidad de día).
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForWrite(id, ctx.session);
  if (access instanceof NextResponse) return access;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const dateRaw = str(body.shootDate);
  if (!isYmd(dateRaw)) return apiJson({ ok: false, error: 'shootDate debe ser "YYYY-MM-DD".' }, 400);
  const title = str(body.title).slice(0, 160) || null;
  const plan = await db.equipmentPlan.create({ data: { projectId: id, title, shootDate: noon(dateRaw), createdById: ctx.session.id }, select: { id: true, title: true, shootDate: true, status: true } });
  await logActivity({ action: "equipos.create", summary: `creó una grabación de equipos${title ? ` «${title}»` : ""} (vía API)`, projectId: id, entityType: "equipos", entityId: plan.id }).catch(() => null);
  return apiJson({ ok: true, plan: { id: plan.id, title: plan.title, shootDate: ymd(plan.shootDate), status: plan.status } }, 201);
});
