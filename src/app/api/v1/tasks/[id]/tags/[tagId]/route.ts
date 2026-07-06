import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { canWriteTask, TASK_SELECT } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string; tagId: string }> };

// DELETE /api/v1/tasks/:id/tags/:tagId — quita una etiqueta (editar_tareas).
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id, tagId } = await (routeCtx as RouteCtx).params;
  const tag = await db.taskTag.findUnique({ where: { id: tagId }, select: { taskId: true } });
  if (!tag || tag.taskId !== id) return apiJson({ ok: false, error: "Etiqueta no encontrada en esta tarea." }, 404);
  const task = await db.task.findUnique({ where: { id }, select: TASK_SELECT });
  if (!task || !canWriteTask(task, ctx.session, "editar_tareas")) return apiJson({ ok: false, error: "Sin permiso para editar esta tarea (editar_tareas)." }, 403);
  await db.taskTag.delete({ where: { id: tagId } });
  return apiJson({ ok: true });
});
