import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { validateAssignee } from "@/lib/task-assign";
import { completionTransition } from "@/lib/task-completion";
import { notifyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
import { readJson, str, isYmd, isHm, noon, shapeTask, canReadTask, canWriteTask, canEditTaskMetaApi, recalcProgress, loadProjectForWrite, TASK_SELECT } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

async function loadTask(id: string) {
  return db.task.findUnique({ where: { id }, select: TASK_SELECT });
}

// GET /api/v1/tasks/:id — detalle de la tarea (con checklist).
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const task = await loadTask(id);
  if (!task || !canReadTask(task, ctx.session)) return apiJson({ ok: false, error: "Tarea no encontrada." }, 404);
  const checklist = await db.checklistItem.findMany({ where: { taskId: id }, orderBy: { position: "asc" }, select: { id: true, label: true, done: true } });
  return apiJson({ ok: true, task: { ...shapeTask(task), checklist } });
});

// PATCH /api/v1/tasks/:id  body { title?, description?, status?, stage?, priority?, assigneeId?,
// startDate?, dueDate?, dueTime?, shootDate? } — edición parcial con las MISMAS compuertas por
// campo que los server actions: editar_tareas (con bypass si la tarea es mía) para texto/estado/
// fase; gestionar_cronograma + canEditTaskMeta para fechas y prioridad; responsable validado.
// Además { projectId } SOLO: mueve la tarea a otro proyecto (espejo de moveTaskToProject).
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  const task = await loadTask(id);
  if (!task || !canReadTask(task, ctx.session)) return apiJson({ ok: false, error: "Tarea no encontrada." }, 404);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  // ── Mover a OTRO proyecto (espejo de moveTaskToProject de la app) ──
  // Va solo (sin otros campos): el resto del PATCH razona sobre el proyecto ACTUAL de la
  // tarea (posición, enlaces, validación del responsable) y mezclarlos sería ambiguo.
  if ("projectId" in body) {
    if (Object.keys(body).length > 1) {
      return apiJson({ ok: false, error: "Para mover de proyecto envía SOLO { projectId } (sin otros campos en el mismo PATCH)." }, 400);
    }
    const targetId = str(body.projectId);
    if (!targetId) return apiJson({ ok: false, error: "projectId debe ser el id del proyecto destino." }, 400);
    if (targetId === task.projectId) return apiJson({ ok: true, task: shapeTask(task) });
    // Tan sensible como fechas/responsable: quien gestiona la tarea (misma compuerta de la app).
    if (!canWriteTask(task, ctx.session, "editar_tareas") || !canEditTaskMetaApi(task, ctx.session)) {
      return apiJson({ ok: false, error: "Solo quien gestiona la tarea (dueño, admin/productor o responsable del proyecto) puede moverla." }, 403);
    }
    const extra = await db.task.findUnique({ where: { id }, select: { equipmentPlan: { select: { id: true } } } });
    if (extra?.equipmentPlan) return apiJson({ ok: false, error: "La tarea es el espejo de un plan de equipos del proyecto y no se puede mover." }, 409);
    // Compuerta del destino = la de crear una tarea allí (incluye la excepción del portal cliente).
    const target = await loadProjectForWrite(targetId, ctx.session, "crear_tareas");
    if (target instanceof NextResponse) return target;
    const tgt = await db.project.findUnique({ where: { id: targetId }, select: { name: true, stages: true } });
    if (!tgt) return apiJson({ ok: false, error: "Proyecto destino no encontrado." }, 404);

    // La fase se conserva solo si el destino tiene una columna igual; la posición va al final;
    // el vínculo con un entregable del origen se corta; los archivos ligados migran sin carpeta.
    const stage = task.stage && tgt.stages.includes(task.stage) ? task.stage : null;
    const last = await db.task.findFirst({ where: { projectId: targetId }, orderBy: { position: "desc" }, select: { position: true } });
    await db.task.update({ where: { id }, data: { projectId: targetId, stage, position: (last?.position ?? 0) + 1, deliverableId: null } });
    await db.fileAsset.updateMany({ where: { taskId: id }, data: { projectId: targetId, folderId: null } });
    if (task.assigneeId) {
      await db.projectMember.upsert({
        where: { projectId_userId: { projectId: targetId, userId: task.assigneeId } },
        create: { projectId: targetId, userId: task.assigneeId },
        update: {},
      });
    }
    await recalcProgress(task.projectId);
    await recalcProgress(targetId);
    const sourceName = task.project?.name ?? "Mis tareas (personal)";
    // Una sola entrada de actividad (en el origen; si era personal, en el destino) para no
    // duplicar el aviso a quienes están en ambos proyectos. El responsable tiene aviso directo.
    await logActivity({
      action: "task.move",
      summary: `movió la tarea «${task.title}» de «${sourceName}» a «${tgt.name}» (vía API)`,
      projectId: task.projectId ?? targetId,
      entityType: "task",
      entityId: id,
      exclude: task.assigneeId && task.assigneeId !== ctx.session.id ? [task.assigneeId] : undefined,
    });
    if (task.assigneeId && task.assigneeId !== ctx.session.id) {
      await notifyAndEmail(task.assigneeId, {
        type: "task",
        event: "task_moved",
        title: `Tu tarea cambió de proyecto: ${task.title}`,
        body: `${ctx.session.name} la movió de «${sourceName}» a «${tgt.name}».`,
        link: `/proyectos/${targetId}?tab=tareas`,
        actorId: ctx.session.id,
      }).catch(() => null);
    }
    const moved = await loadTask(id);
    return apiJson({ ok: true, task: moved ? shapeTask(moved) : null });
  }

  const data: Record<string, unknown> = {};
  const wantsText = "title" in body || "description" in body || "status" in body || "stage" in body;
  const wantsDates = "startDate" in body || "dueDate" in body || "dueTime" in body || "shootDate" in body;
  const wantsPriority = "priority" in body;
  const wantsAssignee = "assigneeId" in body;

  if ((wantsText || wantsAssignee) && !canWriteTask(task, ctx.session, "editar_tareas")) {
    return apiJson({ ok: false, error: "Sin permiso para editar esta tarea (editar_tareas)." }, 403);
  }
  if (wantsDates && !canWriteTask(task, ctx.session, "gestionar_cronograma")) {
    return apiJson({ ok: false, error: "Sin permiso para cambiar fechas (gestionar_cronograma)." }, 403);
  }
  if ((wantsDates || wantsPriority) && !canEditTaskMetaApi(task, ctx.session)) {
    return apiJson({ ok: false, error: "Solo quien asignó la tarea (o gestiona el proyecto) cambia fechas y prioridad." }, 403);
  }
  if (wantsPriority && !canWriteTask(task, ctx.session, "editar_tareas")) {
    return apiJson({ ok: false, error: "Sin permiso para editar esta tarea (editar_tareas)." }, 403);
  }

  if (typeof body.title === "string") {
    const t = body.title.trim().slice(0, 200);
    if (!t) return apiJson({ ok: false, error: "El título no puede quedar vacío." }, 400);
    data.title = t;
  }
  if (typeof body.description === "string") data.description = clampText(body.description.trim()) || null;
  if (typeof body.stage === "string") data.stage = body.stage.trim() || null;
  if (typeof body.priority === "string" && body.priority.trim()) data.priority = body.priority.trim().slice(0, 20);

  // Estado: misma transición que la app (completedAt se conserva/limpia según el estado destino).
  let justCompleted = false;
  if (typeof body.status === "string" && body.status.trim()) {
    const status = body.status.trim();
    const tr = await completionTransition(status, task.completedAt);
    data.status = status;
    data.completedAt = tr.completedAt;
    justCompleted = tr.justCompleted;
  }

  // Fechas: "YYYY-MM-DD" (o null para limpiar); dueTime "HH:mm" (o null). Si se quita la fecha
  // de entrega, la hora deja de tener sentido y se limpia (igual que la app).
  for (const field of ["startDate", "dueDate", "shootDate"] as const) {
    if (field in body) {
      const v = body[field];
      if (v === null || v === "") data[field] = null;
      else if (typeof v === "string" && isYmd(v)) data[field] = noon(v);
      else return apiJson({ ok: false, error: `${field} debe ser "YYYY-MM-DD" o null.` }, 400);
    }
  }
  if ("dueTime" in body) {
    const v = body.dueTime;
    if (v === null || v === "") data.dueTime = null;
    else if (typeof v === "string" && isHm(v)) data.dueTime = v;
    else return apiJson({ ok: false, error: 'dueTime debe ser "HH:mm" o null.' }, 400);
  }
  if (data.dueDate === null) data.dueTime = null;

  // Responsable: validado igual que TODOS los caminos de asignación (nunca un cliente; si el
  // titular es un cliente, solo su equipo del proyecto). Notifica al anterior y al nuevo.
  const prevAssignee = task.assigneeId;
  let newAssignee: string | null = prevAssignee;
  if (wantsAssignee) {
    const raw = str(body.assigneeId);
    if (!raw) newAssignee = null;
    else {
      newAssignee = await validateAssignee(task.projectId, raw, ctx.session);
      if (!newAssignee) return apiJson({ ok: false, error: "assigneeId no es un responsable válido (activo, del equipo)." }, 400);
    }
    if (newAssignee !== prevAssignee) {
      data.assigneeId = newAssignee;
      data.assignedById = ctx.session.id;
    }
  }

  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar." }, 400);
  await db.task.update({ where: { id }, data });

  // Efectos colaterales idénticos a la app.
  if (wantsAssignee && newAssignee && newAssignee !== prevAssignee && task.projectId) {
    await db.projectMember.upsert({
      where: { projectId_userId: { projectId: task.projectId, userId: newAssignee } },
      create: { projectId: task.projectId, userId: newAssignee },
      update: {},
    });
  }
  const link = task.projectId ? `/proyectos/${task.projectId}?tab=tareas` : "/mis-tareas";
  if (wantsAssignee && newAssignee !== prevAssignee) {
    if (newAssignee && newAssignee !== ctx.session.id) {
      await notifyAndEmail(newAssignee, { type: "task", event: "task_assigned", title: `Te asignaron: ${task.title}`, body: task.project?.name ? `Proyecto «${task.project.name}».` : "Eres el nuevo responsable de esta tarea.", link, actorId: ctx.session.id }).catch(() => null);
    }
    if (prevAssignee && prevAssignee !== ctx.session.id) {
      await notifyAndEmail(prevAssignee, { type: "task", event: "task_unassigned", title: `Ya no eres responsable de: ${task.title}`, body: "La tarea se reasignó.", link, actorId: ctx.session.id }).catch(() => null);
    }
  }
  if ("status" in data) await recalcProgress(task.projectId);
  await logActivity({
    action: justCompleted ? "task.complete" : "task.update",
    summary: justCompleted ? `completó la tarea «${task.title}» (vía API)` : `editó la tarea «${task.title}» (vía API)`,
    projectId: task.projectId ?? undefined,
    entityType: "task",
    entityId: id,
  }).catch(() => null);

  const updated = await loadTask(id);
  return apiJson({ ok: true, task: updated ? shapeTask(updated) : null });
});

// DELETE /api/v1/tasks/:id — mismo gate que la app (eliminar_tareas, con bypass si es mía).
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const task = await loadTask(id);
  if (!task || !canReadTask(task, ctx.session)) return apiJson({ ok: false, error: "Tarea no encontrada." }, 404);
  if (!canWriteTask(task, ctx.session, "eliminar_tareas")) return apiJson({ ok: false, error: "Sin permiso para borrar esta tarea (eliminar_tareas)." }, 403);
  await db.task.delete({ where: { id } });
  await recalcProgress(task.projectId);
  await logActivity({ action: "task.delete", summary: `eliminó la tarea «${task.title}» (vía API)`, projectId: task.projectId ?? undefined, entityType: "task", entityId: id }).catch(() => null);
  return apiJson({ ok: true });
});
