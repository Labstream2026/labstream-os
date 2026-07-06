import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/v1/clients/:id/restore — saca al cliente de la papelera. Solo administradores.
export const POST = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  if (ctx.session.role !== "admin") return apiJson({ ok: false, error: "Solo un administrador puede restaurar clientes." }, 403);
  const client = await db.client.findUnique({ where: { id }, select: { name: true, archivedAt: true } });
  if (!client) return apiJson({ ok: false, error: "Cliente no encontrado." }, 404);
  if (!client.archivedAt) return apiJson({ ok: true, alreadyActive: true });
  await db.client.update({ where: { id }, data: { archivedAt: null } });
  await logActivity({ action: "client.restore", summary: `restauró el cliente ${client.name} (vía API)`, clientId: id, entityType: "client", entityId: id }).catch(() => null);
  return apiJson({ ok: true });
});
