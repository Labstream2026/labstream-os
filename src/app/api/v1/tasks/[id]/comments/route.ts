import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { notify } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
import { readJson, canReadTask, canWriteTask, TASK_SELECT } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/tasks/:id/comments — comentarios de la tarea (con acceso de lectura).
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const task = await db.task.findUnique({ where: { id }, select: TASK_SELECT });
  if (!task || !canReadTask(task, ctx.session)) return apiJson({ ok: false, error: "Tarea no encontrada." }, 404);
  const rows = await db.taskComment.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true } } },
  });
  return apiJson({
    ok: true,
    comments: rows.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt.toISOString(), author: c.author ? { id: c.author.id, name: c.author.name } : null })),
  });
});

// POST /api/v1/tasks/:id/comments  body { body } — comenta la tarea (permiso "comentar", con
// bypass si la tarea es mía) y avisa al dueño/responsable, igual que la app.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  const task = await db.task.findUnique({ where: { id }, select: TASK_SELECT });
  if (!task || !canReadTask(task, ctx.session)) return apiJson({ ok: false, error: "Tarea no encontrada." }, 404);
  if (!canWriteTask(task, ctx.session, "comentar")) return apiJson({ ok: false, error: "Sin permiso para comentar (comentar)." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const text = typeof body.body === "string" ? clampText(body.body.trim()).slice(0, 4000) : "";
  if (!text) return apiJson({ ok: false, error: "Falta body (el texto del comentario)." }, 400);

  const c = await db.taskComment.create({
    data: { taskId: id, authorId: ctx.session.id, body: text },
    include: { author: { select: { id: true, name: true } } },
  });
  const link = task.projectId ? `/proyectos/${task.projectId}?tab=tareas` : "/mis-tareas";
  const recipients = new Set<string>();
  if (task.ownerId) recipients.add(task.ownerId);
  if (task.assigneeId) recipients.add(task.assigneeId);
  recipients.delete(ctx.session.id);
  for (const userId of recipients) {
    await notify(userId, { type: "task", event: "task_comment", title: `Comentario en «${task.title}»`, body: text.slice(0, 140), link, actorId: ctx.session.id }).catch(() => null);
  }
  await logActivity({ action: "task.comment", summary: `comentó en «${task.title}» (vía API)`, projectId: task.projectId ?? undefined, entityType: "task", entityId: id }).catch(() => null);
  return apiJson({ ok: true, comment: { id: c.id, body: c.body, createdAt: c.createdAt.toISOString(), author: c.author ? { id: c.author.id, name: c.author.name } : null } }, 201);
});
