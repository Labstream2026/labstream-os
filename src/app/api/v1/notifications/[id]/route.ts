import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// PATCH /api/v1/notifications/:id — marca como leída (solo del titular; nunca de otros).
export const PATCH = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const r = await db.notification.updateMany({ where: { id, userId: ctx.session.id }, data: { read: true } });
  if (r.count === 0) return apiJson({ ok: false, error: "Notificación no encontrada." }, 404);
  return apiJson({ ok: true });
});

// DELETE /api/v1/notifications/:id — borra una notificación del titular.
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  await db.notification.deleteMany({ where: { id, userId: ctx.session.id } });
  return apiJson({ ok: true });
});
