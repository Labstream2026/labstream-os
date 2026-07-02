import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { shapeTask, taskPrivacyWhere, isYmd, noon, TASK_SELECT } from "@/lib/api-v1";

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
