import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { composeQuoteTotals } from "@/lib/quote-compose";
import { readJson, str, isYmd, loadQuoteForRead, loadQuoteForWrite } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/quotes/:id — detalle con líneas y totales calculados (ver_finanzas + acceso al cliente).
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const gate = await loadQuoteForRead(id, ctx.session);
  if (gate instanceof NextResponse) return gate;
  const q = await db.quote.findUnique({
    where: { id },
    select: {
      id: true, code: true, title: true, status: true, currency: true, taxRate: true, contingencyPct: true,
      notes: true, recipientName: true, recipientCity: true, intro: true, scope: true, deliverables: true, validUntil: true,
      client: { select: { id: true, name: true } }, project: { select: { id: true, name: true } },
      items: { orderBy: { position: "asc" }, select: { id: true, section: true, description: true, unit: true, quantity: true, unitPrice: true } },
    },
  });
  if (!q) return apiJson({ ok: false, error: "Cotización no encontrada." }, 404);
  return apiJson({
    ok: true,
    quote: {
      id: q.id, code: q.code, title: q.title, status: q.status, currency: q.currency, taxRate: q.taxRate, contingencyPct: q.contingencyPct,
      notes: q.notes, recipientName: q.recipientName, recipientCity: q.recipientCity, intro: q.intro, scope: q.scope, deliverables: q.deliverables,
      validUntil: q.validUntil ? q.validUntil.toISOString().slice(0, 10) : null,
      client: q.client ? { id: q.client.id, name: q.client.name } : null,
      project: q.project ? { id: q.project.id, name: q.project.name } : null,
      items: q.items,
      totals: composeQuoteTotals(q.items, { taxRate: q.taxRate, contingencyPct: q.contingencyPct }),
    },
  });
});

// PATCH /api/v1/quotes/:id — edita metadatos (crear_cotizaciones; no editable si está APROBADA).
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  const gate = await loadQuoteForWrite(id, ctx.session, true);
  if (gate instanceof NextResponse) return gate;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 200);
  if ("taxRate" in body) data.taxRate = Math.max(0, Math.min(100, parseInt(String(body.taxRate), 10) || 0));
  if ("contingencyPct" in body) data.contingencyPct = Math.max(0, Math.min(100, parseFloat(String(body.contingencyPct)) || 0));
  if (typeof body.notes === "string") data.notes = clampText(body.notes.trim()) || null;
  if (typeof body.recipientName === "string") data.recipientName = body.recipientName.trim().slice(0, 160) || null;
  if (typeof body.recipientCity === "string") data.recipientCity = body.recipientCity.trim().slice(0, 120) || null;
  if (typeof body.intro === "string") data.intro = clampText(body.intro.trim()) || null;
  if (typeof body.scope === "string") data.scope = clampText(body.scope.trim()) || null;
  if (typeof body.deliverables === "string") data.deliverables = clampText(body.deliverables.trim()) || null;
  if ("validUntil" in body) {
    const v = str(body.validUntil);
    if (!v) data.validUntil = null;
    else if (isYmd(v)) data.validUntil = new Date(`${v}T12:00:00.000Z`);
    else return apiJson({ ok: false, error: 'validUntil debe ser "YYYY-MM-DD" o null.' }, 400);
  }
  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar." }, 400);
  await db.quote.update({ where: { id }, data });
  return apiJson({ ok: true });
});
