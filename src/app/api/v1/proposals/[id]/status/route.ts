import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { isProposalStatus } from "@/lib/enum-guards";
import { readJson, str, loadProposalAccess } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/v1/proposals/:id/status  body { status } — cambia el estado (BORRADOR/ENVIADA/ACEPTADA/
// VENCIDA). Espejo de setProposalStatus: ACEPTADA exige aprobar_cotizaciones; el resto,
// crear_cotizaciones. Una ACEPTADA solo la revierte quien tiene aprobar_cotizaciones.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const status = str(body.status).toUpperCase();
  if (!isProposalStatus(status)) return apiJson({ ok: false, error: "status inválido (BORRADOR, ENVIADA, ACEPTADA, VENCIDA)." }, 400);
  const permKey = status === "ACEPTADA" ? "aprobar_cotizaciones" : "crear_cotizaciones";
  if (!hasPermission(ctx.session, permKey)) return apiJson({ ok: false, error: `Falta el permiso ${permKey}.` }, 403);
  const acc = await loadProposalAccess(id, ctx.session);
  if (acc instanceof NextResponse) return acc;
  if (acc.status === "ACEPTADA" && status !== "ACEPTADA" && !hasPermission(ctx.session, "aprobar_cotizaciones")) {
    return apiJson({ ok: false, error: "Revertir una propuesta aceptada requiere aprobar_cotizaciones." }, 403);
  }
  await db.proposal.update({ where: { id }, data: { status } });
  return apiJson({ ok: true, status });
});
