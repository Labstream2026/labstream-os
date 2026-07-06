import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { accessibleClientWhere } from "@/lib/client-access";
import { loadProjectForRead, loadClientForRead } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/activity?project=&client=&take= — registro de actividad (auditoría). Requiere
// ver_actividad. Con project/client, el de ese recurso (verificando acceso). Sin filtro, el de los
// proyectos/clientes que el titular puede ver (+ sus propias acciones); el admin ve todo.
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (!hasPermission(ctx.session, "ver_actividad")) return apiJson({ ok: false, error: "Sin permiso para ver actividad (ver_actividad)." }, 403);
  const url = new URL(req.url);
  const projectId = url.searchParams.get("project")?.trim();
  const clientId = url.searchParams.get("client")?.trim();
  const take = Math.min(100, Math.max(1, parseInt(url.searchParams.get("take") ?? "50", 10) || 50));

  let where: Record<string, unknown>;
  if (projectId) {
    const access = await loadProjectForRead(projectId, ctx.session);
    if (access instanceof NextResponse) return access;
    where = { projectId };
  } else if (clientId) {
    const access = await loadClientForRead(clientId, ctx.session);
    if (access instanceof NextResponse) return access;
    where = { clientId };
  } else if (ctx.session.role === "admin") {
    where = {};
  } else {
    where = { OR: [{ project: accessibleProjectWhere(ctx.session) }, { client: accessibleClientWhere(ctx.session) }, { userId: ctx.session.id }] };
  }

  const rows = await db.activityLog.findMany({
    where, take, orderBy: { createdAt: "desc" },
    select: { id: true, action: true, summary: true, entityType: true, entityId: true, createdAt: true, user: { select: { id: true, name: true } }, actorName: true, project: { select: { id: true, name: true } }, client: { select: { id: true, name: true } } },
  });
  return apiJson({
    ok: true,
    activity: rows.map((a) => ({
      id: a.id, action: a.action, summary: a.summary, entityType: a.entityType, entityId: a.entityId,
      by: a.user ? { id: a.user.id, name: a.user.name } : (a.actorName ? { id: null, name: a.actorName } : null),
      project: a.project ? { id: a.project.id, name: a.project.name } : null,
      client: a.client ? { id: a.client.id, name: a.client.name } : null,
      at: a.createdAt.toISOString(),
    })),
  });
});
