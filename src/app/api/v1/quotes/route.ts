import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { accessibleClientWhere, userCanAccessClient } from "@/lib/client-access";
import { composeQuoteTotals } from "@/lib/quote-compose";
import { getQuoteSettings } from "@/lib/services-catalog";
import { createWithSequentialCode, maxCodeFrom } from "@/lib/sequential-code";
import { readJson, str } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/quotes?status=APROBADA — cotizaciones de clientes accesibles. MISMO candado que la
// app y que el agente: ver_finanzas (NO ver_cotizaciones). Una key sin finanzas recibe 403.
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (!hasPermission(ctx.session, "ver_finanzas")) return apiJson({ ok: false, error: "Sin permiso para ver finanzas (ver_finanzas)." }, 403);
  const status = new URL(req.url).searchParams.get("status")?.toUpperCase();
  const filters: Record<string, unknown>[] = [{ client: accessibleClientWhere(ctx.session) }];
  if (status && ["BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA"].includes(status)) filters.push({ status });
  const rows = await db.quote.findMany({
    where: { AND: filters },
    take: 50,
    orderBy: { updatedAt: "desc" },
    select: { code: true, title: true, status: true, currency: true, taxRate: true, contingencyPct: true, validUntil: true, client: { select: { name: true } }, items: { select: { quantity: true, unitPrice: true } } },
  });
  return apiJson({
    ok: true,
    quotes: rows.map((qu) => ({
      code: qu.code,
      title: qu.title,
      client: qu.client?.name ?? null,
      status: qu.status,
      currency: qu.currency,
      total: composeQuoteTotals(qu.items, { taxRate: qu.taxRate, contingencyPct: qu.contingencyPct }).total,
      validUntil: qu.validUntil ? qu.validUntil.toISOString().slice(0, 10) : null,
    })),
  });
});

// POST /api/v1/quotes  body { clientId, title?, projectId?, recipientName? } — crea una cotización
// (código COT-#### secuencial; IVA/imprevisto por defecto de los ajustes). Espejo de createQuote:
// crear_cotizaciones + acceso al cliente.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  if (!hasPermission(ctx.session, "crear_cotizaciones")) return apiJson({ ok: false, error: "Sin permiso para crear cotizaciones (crear_cotizaciones)." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const clientId = str(body.clientId);
  if (!clientId) return apiJson({ ok: false, error: "clientId es obligatorio." }, 400);
  if (!(await userCanAccessClient(clientId, ctx.session))) return apiJson({ ok: false, error: "Sin acceso a ese cliente." }, 403);
  const settings = await getQuoteSettings();
  const quote = await createWithSequentialCode({
    prefix: "COT",
    findMaxCode: () => maxCodeFrom((args) => db.quote.findMany(args)),
    create: (code) => db.quote.create({
      data: {
        code,
        title: str(body.title).slice(0, 200) || "Cotización sin título",
        clientId,
        projectId: str(body.projectId) || null,
        recipientName: str(body.recipientName).slice(0, 160) || null,
        taxRate: settings.iva,
        contingencyPct: settings.contingencyPct,
        createdById: ctx.session.id,
      },
      select: { id: true, code: true, title: true, status: true },
    }),
  });
  return apiJson({ ok: true, quote: { id: quote.id, code: quote.code, title: quote.title, status: quote.status } }, 201);
});
