import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { canWriteTask, TASK_SELECT } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string; userId: string }> };

// DELETE /api/v1/tasks/:id/watchers/:userId — quita un seguidor (editar_tareas).
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id, userId } = await (routeCtx as RouteCtx).params;
  const task = await db.task.findUnique({ where: { id }, select: TASK_SELECT });
  if (!task || !canWriteTask(task, ctx.session, "editar_tareas")) return apiJson({ ok: false, error: "Sin permiso para editar esta tarea (editar_tareas)." }, 403);
  await db.taskWatcher.deleteMany({ where: { taskId: id, userId } });
  return apiJson({ ok: true });
});
