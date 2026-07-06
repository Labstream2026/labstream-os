import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { userCanAccessClient } from "@/lib/client-access";
import { isQuoteStatus } from "@/lib/enum-guards";
import { readJson, str } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/v1/quotes/:id/status  body { status } — cambia el estado. Espejo de setQuoteStatus:
// BORRADOR → crear_cotizaciones · ENVIADA → enviar_cotizaciones · APROBADA/RECHAZADA →
// aprobar_cotizaciones. Una APROBADA solo la revierte quien tiene aprobar_cotizaciones. Al aprobar,
// si hay proyecto ligado, copia alcance/entregables al brief.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const status = str(body.status).toUpperCase();
  if (!isQuoteStatus(status)) return apiJson({ ok: false, error: "status inválido (BORRADOR, ENVIADA, APROBADA, RECHAZADA)." }, 400);

  const needsApproval = status === "APROBADA" || status === "RECHAZADA";
  const permKey = needsApproval ? "aprobar_cotizaciones" : status === "ENVIADA" ? "enviar_cotizaciones" : "crear_cotizaciones";
  if (!hasPermission(ctx.session, permKey)) return apiJson({ ok: false, error: `Falta el permiso ${permKey}.` }, 403);

  const q = await db.quote.findUnique({ where: { id }, select: { clientId: true, status: true, projectId: true, scope: true, deliverables: true } });
  if (!q) return apiJson({ ok: false, error: "Cotización no encontrada." }, 404);
  if (!(await userCanAccessClient(q.clientId, ctx.session))) return apiJson({ ok: false, error: "Sin acceso a esta cotización." }, 403);
  // Inmutabilidad: revertir una APROBADA exige aprobar_cotizaciones.
  if (q.status === "APROBADA" && status !== "APROBADA" && !needsApproval && !hasPermission(ctx.session, "aprobar_cotizaciones")) {
    return apiJson({ ok: false, error: "Revertir una cotización aprobada requiere aprobar_cotizaciones." }, 403);
  }
  await db.quote.update({ where: { id }, data: { status, approvedById: status === "APROBADA" ? ctx.session.id : null, approvedAt: status === "APROBADA" ? new Date() : null } });
  if (status === "APROBADA" && q.projectId && (q.scope || q.deliverables)) {
    await db.project.update({ where: { id: q.projectId }, data: { briefScope: q.scope, briefDeliverables: q.deliverables } }).catch(() => null);
  }
  return apiJson({ ok: true, status });
});
