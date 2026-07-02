import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { isProjectStatus } from "@/lib/enum-guards";
import { logActivity } from "@/lib/activity";
import { loadProjectForRead, loadProjectForWrite, readJson, str, ymd, isYmd, noon, taskPrivacyWhere } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/projects/:id — detalle COMPLETO del proyecto con el contenido de cada pestaña:
// resumen (brief), equipo, tareas, cronograma (fechas), entregables, archivos, calendario y
// actividad reciente. Todo acotado a lo que el titular vería en la app.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForRead(id, ctx.session);
  if (access instanceof NextResponse) return access;

  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  const [project, tasks, deliverables, folders, files, events, activity] = await Promise.all([
    db.project.findUnique({
      where: { id },
      select: {
        id: true, code: true, name: true, emoji: true, description: true, type: true, status: true,
        priority: true, progress: true, startDate: true, dueDate: true, stages: true, isPrivate: true,
        briefScope: true, briefDeliverables: true,
        lead: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        members: { select: { role: true, user: { select: { id: true, name: true } } } },
      },
    }),
    db.task.findMany({
      // Privacidad de tareas: mismas reglas que el tablero (fuera las privadas de otros).
      where: { projectId: id, ...taskPrivacyWhere(ctx.session) },
      orderBy: { position: "asc" },
      select: {
        id: true, title: true, status: true, stage: true, priority: true, startDate: true,
        dueDate: true, dueTime: true, shootDate: true, completedAt: true,
        assignee: { select: { id: true, name: true } },
      },
    }),
    db.deliverable.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, type: true, status: true, dueDate: true, reviewer: { select: { name: true } }, _count: { select: { versions: true } } },
    }),
    db.projectFolder.findMany({ where: { projectId: id }, orderBy: { position: "asc" }, select: { id: true, name: true, _count: { select: { files: true } } } }),
    db.fileAsset.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
      // No se expone `path` (ruta interna del NAS): para un LINK/DRIVE va la URL; para archivos
      // locales, el nombre y el tamaño (la descarga sigue siendo por la app con sesión).
      select: { id: true, name: true, kind: true, url: true, mime: true, size: true, folderId: true, createdAt: true },
    }),
    db.calendarEvent.findMany({
      where: { projectId: id, start: { gte: monthAgo } },
      orderBy: { start: "asc" },
      select: { id: true, title: true, start: true, end: true, allDay: true, location: true, attendees: { select: { user: { select: { id: true, name: true } } } } },
    }),
    db.activityLog.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, action: true, summary: true, createdAt: true, user: { select: { name: true } }, actorName: true },
    }),
  ]);
  if (!project) return apiJson({ ok: false, error: "Proyecto no encontrado." }, 404);

  return apiJson({
    ok: true,
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
      emoji: project.emoji,
      description: project.description,
      type: project.type,
      status: project.status,
      priority: project.priority,
      progress: project.progress,
      startDate: ymd(project.startDate),
      dueDate: ymd(project.dueDate),
      stages: project.stages,
      isPrivate: project.isPrivate,
      brief: { scope: project.briefScope, deliverables: project.briefDeliverables },
      lead: project.lead ? { id: project.lead.id, name: project.lead.name } : null,
      client: project.client ? { id: project.client.id, name: project.client.name } : null,
      members: project.members.map((m) => ({ id: m.user.id, name: m.user.name, role: m.role })),
    },
    tabs: {
      tareas: tasks.map((t) => ({
        id: t.id, title: t.title, status: t.status, stage: t.stage, priority: t.priority,
        startDate: ymd(t.startDate), dueDate: ymd(t.dueDate), dueTime: t.dueTime,
        shootDate: ymd(t.shootDate), done: !!t.completedAt,
        assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
      })),
      entregables: deliverables.map((d) => ({
        id: d.id, name: d.name, type: d.type, status: d.status, dueDate: ymd(d.dueDate),
        reviewer: d.reviewer?.name ?? null, versions: d._count.versions,
      })),
      archivos: {
        folders: folders.map((f) => ({ id: f.id, name: f.name, fileCount: f._count.files })),
        files: files.map((f) => ({ id: f.id, name: f.name, kind: f.kind, url: f.url, mime: f.mime, size: f.size, folderId: f.folderId, createdAt: f.createdAt.toISOString() })),
      },
      calendario: events.map((e) => ({
        id: e.id, title: e.title, start: e.start.toISOString(), end: e.end ? e.end.toISOString() : null,
        allDay: e.allDay, location: e.location, attendees: e.attendees.map((a) => ({ id: a.user.id, name: a.user.name })),
      })),
      actividad: activity.map((a) => ({ id: a.id, action: a.action, summary: a.summary, by: a.user?.name ?? a.actorName ?? null, at: a.createdAt.toISOString() })),
    },
  });
});

// PATCH /api/v1/projects/:id  body { name?, description?, status?, priority?, startDate?, dueDate?,
// briefScope?, briefDeliverables?, leadId? } — edición parcial (mismos gates que la app:
// editar_proyectos + escritura en el proyecto). Fechas "YYYY-MM-DD" o null para limpiar.
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForWrite(id, ctx.session, "editar_proyectos");
  if (access instanceof NextResponse) return access;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 160);
    if (!name) return apiJson({ ok: false, error: "El nombre no puede quedar vacío." }, 400);
    data.name = name;
  }
  if (typeof body.description === "string") data.description = clampText(body.description.trim()) || null;
  if (typeof body.status === "string") {
    if (!isProjectStatus(body.status)) return apiJson({ ok: false, error: `status inválido (${body.status}).` }, 400);
    data.status = body.status;
  }
  if (typeof body.priority === "string" && body.priority.trim()) data.priority = body.priority.trim().slice(0, 20);
  for (const field of ["startDate", "dueDate"] as const) {
    if (field in body) {
      const v = body[field];
      if (v === null || v === "") data[field] = null;
      else if (typeof v === "string" && isYmd(v)) data[field] = noon(v);
      else return apiJson({ ok: false, error: `${field} debe ser "YYYY-MM-DD" o null.` }, 400);
    }
  }
  if (typeof body.briefScope === "string") data.briefScope = clampText(body.briefScope.trim()) || null;
  if (typeof body.briefDeliverables === "string") data.briefDeliverables = clampText(body.briefDeliverables.trim()) || null;
  if ("leadId" in body) {
    const rawLead = str(body.leadId);
    if (!rawLead) data.leadId = null;
    else {
      const u = await db.user.findUnique({ where: { id: rawLead }, select: { active: true, role: { select: { key: true } } } });
      if (!u?.active || u.role?.key === "cliente") return apiJson({ ok: false, error: "leadId no es un usuario válido del equipo." }, 400);
      data.leadId = rawLead;
    }
  }
  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar." }, 400);

  const project = await db.project.update({ where: { id }, data, select: { id: true, code: true, name: true, status: true, priority: true, startDate: true, dueDate: true } });
  await logActivity({ action: "project.update", summary: `editó el proyecto «${project.name}» (vía API)`, projectId: id, entityType: "project", entityId: id }).catch(() => null);
  return apiJson({ ok: true, project: { id: project.id, code: project.code, name: project.name, status: project.status, priority: project.priority, startDate: ymd(project.startDate), dueDate: ymd(project.dueDate) } });
});
