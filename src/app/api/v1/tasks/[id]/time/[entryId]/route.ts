import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string; entryId: string }> };

// DELETE /api/v1/tasks/:id/time/:entryId — borra un parte de horas. Espejo de deleteTimeEntry:
// solo el autor del parte o un admin.
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id, entryId } = await (routeCtx as RouteCtx).params;
  const entry = await db.timeEntry.findUnique({ where: { id: entryId }, select: { userId: true, taskId: true } });
  if (!entry || entry.taskId !== id) return apiJson({ ok: false, error: "Parte de horas no encontrado." }, 404);
  if (!(ctx.session.role === "admin" || entry.userId === ctx.session.id)) return apiJson({ ok: false, error: "Solo el autor del parte (o un admin) puede borrarlo." }, 403);
  await db.timeEntry.delete({ where: { id: entryId } });
  return apiJson({ ok: true });
});
