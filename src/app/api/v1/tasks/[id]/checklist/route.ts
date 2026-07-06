import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { logActivity } from "@/lib/activity";
import { readJson, str, canReadTask, canWriteTask, TASK_SELECT } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/tasks/:id/checklist — ítems del checklist de la tarea.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const task = await db.task.findUnique({ where: { id }, select: TASK_SELECT });
  if (!task || !canReadTask(task, ctx.session)) return apiJson({ ok: false, error: "Tarea no encontrada." }, 404);
  const items = await db.checklistItem.findMany({ where: { taskId: id }, orderBy: { position: "asc" }, select: { id: true, label: true, done: true } });
  return apiJson({ ok: true, checklist: items });
});

// POST /api/v1/tasks/:id/checklist  body { label } — añade un ítem (editar_tareas, bypass si es mía).
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const task = await db.task.findUnique({ where: { id }, select: TASK_SELECT });
  if (!task || !canReadTask(task, ctx.session)) return apiJson({ ok: false, error: "Tarea no encontrada." }, 404);
  if (!canWriteTask(task, ctx.session, "editar_tareas")) return apiJson({ ok: false, error: "Sin permiso para editar esta tarea (editar_tareas)." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const label = str(body.label).slice(0, 300);
  if (!label) return apiJson({ ok: false, error: "label es obligatorio." }, 400);
  const count = await db.checklistItem.count({ where: { taskId: id } });
  const item = await db.checklistItem.create({ data: { taskId: id, label, position: count }, select: { id: true, label: true, done: true } });
  await logActivity({ action: "checklist.add", summary: `añadió «${label}» al checklist de «${task.title}» (vía API)`, projectId: task.projectId ?? undefined, entityType: "checklist", entityId: id }).catch(() => null);
  return apiJson({ ok: true, item }, 201);
});
