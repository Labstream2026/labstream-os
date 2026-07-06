import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// DELETE /api/v1/library/:id — borra un recurso. Espejo de deleteLibraryAsset: gestionar_biblioteca
// O el propio dueño del recurso.
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const asset = await db.libraryAsset.findUnique({ where: { id }, select: { uploadedById: true } });
  if (!asset) return apiJson({ ok: true, alreadyGone: true });
  if (!hasPermission(ctx.session, "gestionar_biblioteca") && asset.uploadedById !== ctx.session.id) {
    return apiJson({ ok: false, error: "Solo quien gestiona la biblioteca o el dueño del recurso puede borrarlo." }, 403);
  }
  await db.libraryAsset.delete({ where: { id } });
  return apiJson({ ok: true });
});
