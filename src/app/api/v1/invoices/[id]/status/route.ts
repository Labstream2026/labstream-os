import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { userCanAccessClient } from "@/lib/client-access";
import { isInvoiceStatus } from "@/lib/enum-guards";
import { logActivity } from "@/lib/activity";
import { readJson, str } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/v1/invoices/:id/status  body { status } — cambia el estado (BORRADOR/ENVIADA/PAGADA/
// VENCIDA/ANULADA). Espejo de setInvoiceStatus: aprobar_cotizaciones + acceso al cliente; PAGADA fija paidAt.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  if (!hasPermission(ctx.session, "aprobar_cotizaciones")) return apiJson({ ok: false, error: "Sin permiso (aprobar_cotizaciones)." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const status = str(body.status).toUpperCase();
  if (!isInvoiceStatus(status)) return apiJson({ ok: false, error: "status inválido (BORRADOR, ENVIADA, PAGADA, VENCIDA, ANULADA)." }, 400);
  const inv = await db.invoice.findUnique({ where: { id }, select: { code: true, clientId: true } });
  if (!inv) return apiJson({ ok: false, error: "Factura no encontrada." }, 404);
  if (!(await userCanAccessClient(inv.clientId, ctx.session))) return apiJson({ ok: false, error: "Sin acceso a esta factura." }, 403);
  await db.invoice.update({ where: { id }, data: { status, paidAt: status === "PAGADA" ? new Date() : null } });
  await logActivity({ action: "invoice.status", summary: `marcó la factura ${inv.code} como ${status.toLowerCase()} (vía API)`, clientId: inv.clientId, entityType: "invoice", entityId: id }).catch(() => null);
  return apiJson({ ok: true, status });
});
