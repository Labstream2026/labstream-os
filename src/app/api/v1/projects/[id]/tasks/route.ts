import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { validateAssignee } from "@/lib/task-assign";
import { notifyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
import { bogotaNoon } from "@/lib/today";
import { loadProjectForRead, loadProjectForWrite, readJson, str, isYmd, isHm, noon, shapeTask, recalcProgress, taskPrivacyWhere, TASK_SELECT } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/projects/:id/tasks — tareas del proyecto (privadas de otros excluidas).
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForRead(id, ctx.session);
  if (access instanceof NextResponse) return access;
  const tasks = await db.task.findMany({
    where: { projectId: id, ...taskPrivacyWhere(ctx.session) },
    orderBy: { position: "asc" },
    select: TASK_SELECT,
  });
  return apiJson({ ok: true, tasks: tasks.map(shapeTask) });
});

// POST /api/v1/projects/:id/tasks  body { title, description?, assigneeId?, priority?, stage?,
// startDate?, dueDate?, dueTime? } — crea la tarea con los mismos efectos que la app: responsable
// validado (nunca un cliente; el cliente solo a su equipo), se le garantiza acceso al proyecto,
// notificación y progreso recalculado.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForWrite(id, ctx.session, "crear_tareas");
  if (access instanceof NextResponse) return access;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const title = str(body.title).slice(0, 200);
  if (!title) return apiJson({ ok: false, error: "Falta title." }, 400);
  const assigneeId = await validateAssignee(id, str(body.assigneeId) || null, ctx.session);
  if (str(body.assigneeId) && !assigneeId) return apiJson({ ok: false, error: "assigneeId no es un responsable válido (activo, del equipo)." }, 400);

  const dueRaw = str(body.dueDate);
  const startRaw = str(body.startDate);
  if (dueRaw && !isYmd(dueRaw)) return apiJson({ ok: false, error: 'dueDate debe ser "YYYY-MM-DD".' }, 400);
  if (startRaw && !isYmd(startRaw)) return apiJson({ ok: false, error: 'startDate debe ser "YYYY-MM-DD".' }, 400);
  const dueTimeRaw = str(body.dueTime);
  if (dueTimeRaw && !isHm(dueTimeRaw)) return apiJson({ ok: false, error: 'dueTime debe ser "HH:mm".' }, 400);

  const count = await db.task.count({ where: { projectId: id } });
  const task = await db.task.create({
    data: {
      projectId: id,
      title,
      description: clampText(str(body.description)) || null,
      assigneeId,
      priority: str(body.priority) || "MEDIA",
      stage: str(body.stage) || null,
      position: count,
      // Toda tarea lleva inicio y fin (hoy por defecto) y hora de entrega (9:00) — igual que la app.
      startDate: startRaw ? noon(startRaw) : bogotaNoon(),
      dueDate: dueRaw ? noon(dueRaw) : bogotaNoon(),
      dueTime: dueTimeRaw || "09:00",
      ownerId: ctx.session.id,
      assignedById: assigneeId ? ctx.session.id : null,
    },
    select: TASK_SELECT,
  });

  // El responsable debe poder abrir el proyecto aunque sea privado.
  if (assigneeId) {
    await db.projectMember.upsert({
      where: { projectId_userId: { projectId: id, userId: assigneeId } },
      create: { projectId: id, userId: assigneeId },
      update: {},
    });
    if (assigneeId !== ctx.session.id) {
      await notifyAndEmail(assigneeId, {
        type: "task",
        event: "task_assigned",
        title: `Nueva tarea: ${title}`,
        body: `Proyecto «${access.name}».${dueRaw ? `\nEntrega: ${dueRaw}` : ""}`,
        link: `/proyectos/${id}?tab=tareas`,
        actorId: ctx.session.id,
      }).catch(() => null);
    }
  }
  await logActivity({ action: "task.create", summary: `creó la tarea «${title}» (vía API)`, projectId: id, entityType: "task", entityId: task.id }).catch(() => null);
  await recalcProgress(id);
  return apiJson({ ok: true, task: shapeTask(task) }, 201);
});
