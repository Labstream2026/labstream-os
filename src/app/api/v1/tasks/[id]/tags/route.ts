import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { TONE_MAP } from "@/lib/colors";
import { readJson, str, canReadTask, canWriteTask, TASK_SELECT } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/tasks/:id/tags — etiquetas de la tarea.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const task = await db.task.findUnique({ where: { id }, select: TASK_SELECT });
  if (!task || !canReadTask(task, ctx.session)) return apiJson({ ok: false, error: "Tarea no encontrada." }, 404);
  const tags = await db.taskTag.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" }, select: { id: true, label: true, color: true } });
  return apiJson({ ok: true, tags });
});

// POST /api/v1/tasks/:id/tags  body { label, color? } — añade una etiqueta (editar_tareas).
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const task = await db.task.findUnique({ where: { id }, select: TASK_SELECT });
  if (!task || !canReadTask(task, ctx.session)) return apiJson({ ok: false, error: "Tarea no encontrada." }, 404);
  if (!canWriteTask(task, ctx.session, "editar_tareas")) return apiJson({ ok: false, error: "Sin permiso para editar esta tarea (editar_tareas)." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const label = str(body.label).slice(0, 40);
  if (!label) return apiJson({ ok: false, error: "label es obligatorio." }, 400);
  const rawColor = str(body.color);
  const color = rawColor in TONE_MAP ? rawColor : "slate";
  const tag = await db.taskTag.create({ data: { taskId: id, label, color }, select: { id: true, label: true, color: true } });
  return apiJson({ ok: true, tag }, 201);
});
