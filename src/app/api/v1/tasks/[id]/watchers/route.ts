import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { readJson, str, canReadTask, canWriteTask, TASK_SELECT } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/tasks/:id/watchers — seguidores de la tarea (reciben sus avisos).
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const task = await db.task.findUnique({ where: { id }, select: TASK_SELECT });
  if (!task || !canReadTask(task, ctx.session)) return apiJson({ ok: false, error: "Tarea no encontrada." }, 404);
  const rows = await db.taskWatcher.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" }, select: { user: { select: { id: true, name: true } } } });
  return apiJson({ ok: true, watchers: rows.map((w) => ({ id: w.user.id, name: w.user.name })) });
});

// POST /api/v1/tasks/:id/watchers  body { userId } — añade un seguidor (editar_tareas).
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const task = await db.task.findUnique({ where: { id }, select: TASK_SELECT });
  if (!task || !canReadTask(task, ctx.session)) return apiJson({ ok: false, error: "Tarea no encontrada." }, 404);
  if (!canWriteTask(task, ctx.session, "editar_tareas")) return apiJson({ ok: false, error: "Sin permiso para editar esta tarea (editar_tareas)." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const userId = str(body.userId);
  if (!userId) return apiJson({ ok: false, error: "userId es obligatorio." }, 400);
  const user = await db.user.findUnique({ where: { id: userId }, select: { active: true, name: true } });
  if (!user?.active) return apiJson({ ok: false, error: "Usuario inexistente o inactivo." }, 400);
  await db.taskWatcher.upsert({ where: { taskId_userId: { taskId: id, userId } }, create: { taskId: id, userId }, update: {} });
  return apiJson({ ok: true, watcher: { id: userId, name: user.name } }, 201);
});
