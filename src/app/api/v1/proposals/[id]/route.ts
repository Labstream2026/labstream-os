import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { userCanAccessClient } from "@/lib/client-access";
import { logActivity } from "@/lib/activity";
import { readJson, str, isYmd, loadProposalAccess } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/proposals/:id — detalle (estado, cliente, bloques, visitas). Gate crear_cotizaciones + acceso.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  if (!hasPermission(ctx.session, "crear_cotizaciones")) return apiJson({ ok: false, error: "Sin permiso (crear_cotizaciones)." }, 403);
  const acc = await loadProposalAccess(id, ctx.session);
  if (acc instanceof NextResponse) return acc;
  const p = await db.proposal.findUnique({ where: { id }, select: { id: true, code: true, title: true, status: true, templateKey: true, views: true, expiresAt: true, blocks: true, answers: true, updatedAt: true, client: { select: { id: true, name: true } } } });
  if (!p) return apiJson({ ok: false, error: "Propuesta no encontrada." }, 404);
  return apiJson({ ok: true, proposal: { id: p.id, code: p.code, title: p.title, status: p.status, templateKey: p.templateKey, views: p.views, expiresAt: p.expiresAt ? p.expiresAt.toISOString().slice(0, 10) : null, client: p.client ? { id: p.client.id, name: p.client.name } : null, blocks: p.blocks, answers: p.answers, updatedAt: p.updatedAt.toISOString() } });
});

// PATCH /api/v1/proposals/:id  body { title?, expiresAt?, clientId? } — metadatos (crear_cotizaciones).
// Reasignar a un cliente exige acceso a ese cliente (desvincular con null se permite).
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  if (!hasPermission(ctx.session, "crear_cotizaciones")) return apiJson({ ok: false, error: "Sin permiso (crear_cotizaciones)." }, 403);
  const acc = await loadProposalAccess(id, ctx.session);
  if (acc instanceof NextResponse) return acc;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 160);
  if ("expiresAt" in body) {
    const v = str(body.expiresAt);
    if (!v) data.expiresAt = null;
    else if (isYmd(v)) data.expiresAt = new Date(`${v}T12:00:00.000Z`);
    else return apiJson({ ok: false, error: 'expiresAt debe ser "YYYY-MM-DD" o null.' }, 400);
  }
  if ("clientId" in body) {
    const clientId = str(body.clientId);
    if (clientId && !(await userCanAccessClient(clientId, ctx.session))) return apiJson({ ok: false, error: "Sin acceso al cliente destino." }, 403);
    data.clientId = clientId || null;
  }
  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar." }, 400);
  await db.proposal.update({ where: { id }, data });
  return apiJson({ ok: true });
});

// DELETE /api/v1/proposals/:id — borra la propuesta (crear_cotizaciones + acceso).
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  if (!hasPermission(ctx.session, "crear_cotizaciones")) return apiJson({ ok: false, error: "Sin permiso (crear_cotizaciones)." }, 403);
  const acc = await loadProposalAccess(id, ctx.session);
  if (acc instanceof NextResponse) return acc;
  await db.proposal.delete({ where: { id } });
  await logActivity({ action: "proposal.delete", summary: "eliminó una propuesta (vía API)", clientId: acc.clientId, entityType: "proposal", entityId: id }).catch(() => null);
  return apiJson({ ok: true });
});
