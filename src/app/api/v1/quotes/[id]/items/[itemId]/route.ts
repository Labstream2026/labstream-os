import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { readJson, str, loadQuoteForWrite } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string; itemId: string }> };

async function loadItem(id: string, itemId: string) {
  const item = await db.quoteItem.findUnique({ where: { id: itemId }, select: { quoteId: true } });
  return item && item.quoteId === id ? item : null;
}

// PATCH /api/v1/quotes/:id/items/:itemId — edita una línea (crear_cotizaciones; no si está APROBADA).
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id, itemId } = await (routeCtx as RouteCtx).params;
  const gate = await loadQuoteForWrite(id, ctx.session, true);
  if (gate instanceof NextResponse) return gate;
  if (!(await loadItem(id, itemId))) return apiJson({ ok: false, error: "Línea no encontrada en esta cotización." }, 404);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const data: Record<string, unknown> = {};
  if (typeof body.description === "string") data.description = body.description.slice(0, 500);
  if ("section" in body) data.section = str(body.section).slice(0, 60) || null;
  if ("unit" in body) data.unit = str(body.unit).slice(0, 24) || null;
  if ("quantity" in body) data.quantity = Math.max(0, Number.isFinite(Number(body.quantity)) ? Number(body.quantity) : 0);
  if ("unitPrice" in body) data.unitPrice = Math.max(0, Number.isFinite(Number(body.unitPrice)) ? Number(body.unitPrice) : 0);
  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar." }, 400);
  const item = await db.quoteItem.update({ where: { id: itemId }, data, select: { id: true, section: true, description: true, unit: true, quantity: true, unitPrice: true } });
  return apiJson({ ok: true, item });
});

// DELETE /api/v1/quotes/:id/items/:itemId — borra una línea (crear_cotizaciones; no si está APROBADA).
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id, itemId } = await (routeCtx as RouteCtx).params;
  const gate = await loadQuoteForWrite(id, ctx.session, true);
  if (gate instanceof NextResponse) return gate;
  if (!(await loadItem(id, itemId))) return apiJson({ ok: false, error: "Línea no encontrada en esta cotización." }, 404);
  await db.quoteItem.delete({ where: { id: itemId } });
  return apiJson({ ok: true });
});
