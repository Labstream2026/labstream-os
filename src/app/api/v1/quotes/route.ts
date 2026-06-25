import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { composeQuoteTotals } from "@/lib/quote-compose";

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
