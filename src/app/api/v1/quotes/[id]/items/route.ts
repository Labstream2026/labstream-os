import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { readJson, str, loadQuoteForWrite } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/v1/quotes/:id/items  body { description, section?, unit?, quantity?, unitPrice? } — añade
// una línea. crear_cotizaciones + acceso al cliente; no editable si está APROBADA.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const gate = await loadQuoteForWrite(id, ctx.session, true);
  if (gate instanceof NextResponse) return gate;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const description = str(body.description).slice(0, 500);
  const section = str(body.section).slice(0, 60) || null;
  const unit = str(body.unit).slice(0, 24) || null;
  const quantity = Math.max(0, Number.isFinite(Number(body.quantity)) ? Number(body.quantity) : 1);
  const unitPrice = Math.max(0, Number.isFinite(Number(body.unitPrice)) ? Number(body.unitPrice) : 0);
  const count = await db.quoteItem.count({ where: { quoteId: id } });
  const item = await db.quoteItem.create({ data: { quoteId: id, section, description, unit, quantity, unitPrice, position: count }, select: { id: true, section: true, description: true, unit: true, quantity: true, unitPrice: true } });
  return apiJson({ ok: true, item }, 201);
});
