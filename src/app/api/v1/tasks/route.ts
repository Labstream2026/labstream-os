import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { notifyAndEmail } from "@/lib/notify";
import { logActivity } from "@/lib/activity";
import { bogotaNoon } from "@/lib/today";
import { readJson, str, shapeTask, taskPrivacyWhere, isYmd, isHm, noon, TASK_SELECT } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/tasks?q=&project=&assignee=me|<id>&scope=open|done&dueBefore=YYYY-MM-DD&take=50
// Tareas que el titular puede ver EN TODA LA APP: las de sus proyectos accesibles y sus tareas
// personales (sin proyecto). Privadas de otros excluidas. Mismo alcance que la app.
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const projectId = url.searchParams.get("project")?.trim();
  const assignee = url.searchParams.get("assignee")?.trim();
  const scope = url.searchParams.get("scope")?.trim();
  const dueBefore = url.searchParams.get("dueBefore")?.trim();
  const take = Math.min(Math.max(Number(url.searchParams.get("take") ?? 50) || 50, 1), 100);

  const and: Record<string, unknown>[] = [
    // Alcance: proyectos accesibles ∪ tareas personales propias (dueño o responsable).
    {
      OR: [
        { project: accessibleProjectWhere(ctx.session) },
        { projectId: null, OR: [{ ownerId: ctx.session.id }, { assigneeId: ctx.session.id }] },
      ],
    },
    taskPrivacyWhere(ctx.session),
  ];
  if (q) and.push({ title: { contains: q, mode: "insensitive" } });
  if (projectId) and.push({ projectId });
  if (assignee === "me") and.push({ assigneeId: ctx.session.id });
  else if (assignee) and.push({ assigneeId: assignee });
  if (scope === "open") and.push({ completedAt: null });
  if (scope === "done") and.push({ completedAt: { not: null } });
  if (dueBefore && isYmd(dueBefore)) and.push({ dueDate: { lte: noon(dueBefore) } });

  const tasks = await db.task.findMany({
    where: { AND: and },
    orderBy: [{ dueDate: "asc" }, { position: "asc" }],
    take,
    select: TASK_SELECT,
  });
  return apiJson({ ok: true, tasks: tasks.map(shapeTask) });
});

// POST /api/v1/tasks  body { title, description?, assigneeId?, priority?, startDate?, dueDate?,
// dueTime?, isPrivate? } — tarea PERSONAL/suelta (sin proyecto), p. ej. «ponle esta tarea a
// Fulano»: aparece en «Mis tareas» del responsable con aviso app+correo. Mismo núcleo que la app
// (mis-tareas/actions.ts): el responsable debe ser del equipo (activo, ni cliente ni demo ni bot);
// el titular rol cliente solo se crea tareas a sí mismo. Para tareas DE PROYECTO usa
// POST /api/v1/projects/:id/tasks (valida el equipo del proyecto y recalcula progreso).
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (!hasPermission(ctx.session, "crear_tareas")) return apiJson({ ok: false, error: "Sin permiso para crear tareas (crear_tareas)." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const body = await readJson(req);
  if (body instanceof Response) return body;

  const title = str(body.title).slice(0, 200);
  if (!title) return apiJson({ ok: false, error: "Falta title." }, 400);

  let assigneeId = str(body.assigneeId) || ctx.session.id;
  if (ctx.session.role === "cliente") {
    assigneeId = ctx.session.id; // el portal cliente no asigna a otros
  } else if (assigneeId !== ctx.session.id) {
    const target = await db.user.findUnique({
      where: { id: assigneeId },
      select: { active: true, isSystemBot: true, role: { select: { key: true } } },
    });
    if (!target?.active || target.isSystemBot || target.role?.key === "cliente" || target.role?.key === "demo") {
      return apiJson({ ok: false, error: "assigneeId no es una persona válida del equipo (activa, ni cliente ni demo)." }, 400);
    }
  }

  const dueRaw = str(body.dueDate);
  const startRaw = str(body.startDate);
  if (dueRaw && !isYmd(dueRaw)) return apiJson({ ok: false, error: 'dueDate debe ser "YYYY-MM-DD".' }, 400);
  if (startRaw && !isYmd(startRaw)) return apiJson({ ok: false, error: 'startDate debe ser "YYYY-MM-DD".' }, 400);
  const dueTimeRaw = str(body.dueTime);
  if (dueTimeRaw && !isHm(dueTimeRaw)) return apiJson({ ok: false, error: 'dueTime debe ser "HH:mm".' }, 400);

  const task = await db.task.create({
    data: {
      projectId: null,
      title,
      description: clampText(str(body.description)) || null,
      assigneeId,
      ownerId: ctx.session.id,
      assignedById: assigneeId !== ctx.session.id ? ctx.session.id : null,
      priority: str(body.priority) || "MEDIA",
      // Toda tarea lleva inicio y fin (hoy por defecto) y hora de entrega (9:00) — igual que la app.
      startDate: startRaw ? noon(startRaw) : bogotaNoon(),
      dueDate: dueRaw ? noon(dueRaw) : bogotaNoon(),
      dueTime: dueTimeRaw || "09:00",
      isPrivate: !!body.isPrivate,
    },
    select: TASK_SELECT,
  });

  if (assigneeId !== ctx.session.id) {
    await notifyAndEmail(assigneeId, {
      type: "task",
      event: "task_assigned",
      title: `Nueva tarea: ${title}`,
      body: `${ctx.session.name} te asignó una tarea${dueRaw ? ` (entrega ${dueRaw})` : ""}.`,
      link: "/mis-tareas",
      actorId: ctx.session.id,
    }).catch(() => null);
    await logActivity({ action: "task.create", summary: `asignó la tarea «${title}» (vía API)`, entityType: "task", entityId: task.id }).catch(() => null);
  }
  return apiJson({ ok: true, task: shapeTask(task) }, 201);
});
