import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { logActivity } from "@/lib/activity";
import { readJson, str, isYmd, noon, canReadTask, canWriteTask, TASK_SELECT } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/tasks/:id/time — partes de horas de la tarea.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const task = await db.task.findUnique({ where: { id }, select: TASK_SELECT });
  if (!task || !canReadTask(task, ctx.session)) return apiJson({ ok: false, error: "Tarea no encontrada." }, 404);
  const rows = await db.timeEntry.findMany({ where: { taskId: id }, orderBy: { spentOn: "desc" }, select: { id: true, minutes: true, note: true, spentOn: true, user: { select: { id: true, name: true } } } });
  return apiJson({ ok: true, entries: rows.map((r) => ({ id: r.id, minutes: r.minutes, note: r.note, spentOn: r.spentOn.toISOString().slice(0, 10), user: r.user ? { id: r.user.id, name: r.user.name } : null, mine: r.user?.id === ctx.session.id })) });
});

// POST /api/v1/tasks/:id/time  body { minutes | hours, note?, spentOn? } — registra horas (registrar_horas).
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const task = await db.task.findUnique({ where: { id }, select: TASK_SELECT });
  if (!task || !canReadTask(task, ctx.session)) return apiJson({ ok: false, error: "Tarea no encontrada." }, 404);
  if (!canWriteTask(task, ctx.session, "registrar_horas")) return apiJson({ ok: false, error: "Sin permiso para registrar horas (registrar_horas)." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  let minutes = Number.isFinite(Number(body.minutes)) ? Math.round(Number(body.minutes)) : 0;
  if (!minutes && Number.isFinite(Number(body.hours))) minutes = Math.round(Number(body.hours) * 60);
  if (!minutes || minutes <= 0) return apiJson({ ok: false, error: "Indica minutes (o hours) > 0." }, 400);
  const note = str(body.note).slice(0, 300) || null;
  const dayRaw = str(body.spentOn);
  if (dayRaw && !isYmd(dayRaw)) return apiJson({ ok: false, error: 'spentOn debe ser "YYYY-MM-DD".' }, 400);
  const spentOn = dayRaw ? noon(dayRaw) : noon(new Date().toISOString().slice(0, 10));
  const entry = await db.timeEntry.create({ data: { taskId: id, userId: ctx.session.id, minutes, note, spentOn }, select: { id: true, minutes: true } });
  await logActivity({ action: "task.time", summary: `registró ${(minutes / 60).toFixed(2)} h en «${task.title}» (vía API)`, projectId: task.projectId ?? undefined, entityType: "task", entityId: id }).catch(() => null);
  return apiJson({ ok: true, entry }, 201);
});
