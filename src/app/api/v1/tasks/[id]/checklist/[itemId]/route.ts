import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { logActivity } from "@/lib/activity";
import { readJson, str, canWriteTask, TASK_SELECT } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string; itemId: string }> };

// PATCH /api/v1/tasks/:id/checklist/:itemId  body { done?, label? } — marca/renombra un ítem.
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id, itemId } = await (routeCtx as RouteCtx).params;
  const item = await db.checklistItem.findUnique({ where: { id: itemId }, select: { taskId: true } });
  if (!item || item.taskId !== id) return apiJson({ ok: false, error: "Ítem no encontrado en esta tarea." }, 404);
  const task = await db.task.findUnique({ where: { id }, select: TASK_SELECT });
  if (!task || !canWriteTask(task, ctx.session, "editar_tareas")) return apiJson({ ok: false, error: "Sin permiso para editar esta tarea (editar_tareas)." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const data: Record<string, unknown> = {};
  if (typeof body.done === "boolean") data.done = body.done;
  if (typeof body.label === "string") {
    const label = str(body.label).slice(0, 300);
    if (!label) return apiJson({ ok: false, error: "label no puede quedar vacío." }, 400);
    data.label = label;
  }
  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar." }, 400);
  const updated = await db.checklistItem.update({ where: { id: itemId }, data, select: { id: true, label: true, done: true } });
  await logActivity({ action: "checklist.toggle", summary: `actualizó un ítem del checklist de «${task.title}» (vía API)`, projectId: task.projectId ?? undefined, entityType: "checklist", entityId: id }).catch(() => null);
  return apiJson({ ok: true, item: updated });
});

// DELETE /api/v1/tasks/:id/checklist/:itemId — borra un ítem del checklist.
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id, itemId } = await (routeCtx as RouteCtx).params;
  const item = await db.checklistItem.findUnique({ where: { id: itemId }, select: { taskId: true } });
  if (!item || item.taskId !== id) return apiJson({ ok: false, error: "Ítem no encontrado en esta tarea." }, 404);
  const task = await db.task.findUnique({ where: { id }, select: TASK_SELECT });
  if (!task || !canWriteTask(task, ctx.session, "editar_tareas")) return apiJson({ ok: false, error: "Sin permiso para editar esta tarea (editar_tareas)." }, 403);
  await db.checklistItem.delete({ where: { id: itemId } });
  return apiJson({ ok: true });
});
