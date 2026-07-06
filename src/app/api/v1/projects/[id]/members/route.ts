import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { isProjectRole } from "@/lib/enum-guards";
import { ensureProjectChannels } from "@/lib/project-chat";
import { logActivity } from "@/lib/activity";
import { readJson, str, loadProjectForRead, loadProjectForManage } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/projects/:id/members — miembros del proyecto (OWNER/MEMBER/GUEST) + el líder.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForRead(id, ctx.session);
  if (access instanceof NextResponse) return access;
  const [project, members] = await Promise.all([
    db.project.findUnique({ where: { id }, select: { lead: { select: { id: true, name: true } } } }),
    db.projectMember.findMany({ where: { projectId: id }, select: { role: true, user: { select: { id: true, name: true, role: { select: { key: true } } } } } }),
  ]);
  return apiJson({
    ok: true,
    lead: project?.lead ? { id: project.lead.id, name: project.lead.name } : null,
    members: members.map((m) => ({ id: m.user.id, name: m.user.name, role: m.role, userRole: m.user.role?.key ?? null })),
  });
});

// POST /api/v1/projects/:id/members  body { userId, role? } — añade un miembro. Espejo de
// addProjectMember: gestiona el proyecto + gestionar_miembros_proyecto; OWNER solo lo asigna admin o
// el líder; los usuarios del portal cliente entran SIEMPRE como GUEST (solo lectura). Sincroniza el chat.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForManage(id, ctx.session, "gestionar_miembros_proyecto");
  if (access instanceof NextResponse) return access;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const userId = str(body.userId);
  if (!userId) return apiJson({ ok: false, error: "userId es obligatorio." }, 400);
  const roleRaw = str(body.role);
  const safeRole = isProjectRole(roleRaw) ? roleRaw : "MEMBER";
  if (safeRole === "OWNER" && !(ctx.session.role === "admin" || access.leadId === ctx.session.id)) {
    return apiJson({ ok: false, error: "Solo un administrador o el responsable puede asignar OWNER." }, 403);
  }
  const target = await db.user.findUnique({ where: { id: userId }, select: { active: true, name: true, role: { select: { key: true } } } });
  if (!target?.active) return apiJson({ ok: false, error: "Usuario inexistente o inactivo." }, 400);
  const finalRole = target.role?.key === "cliente" ? "GUEST" : safeRole;
  await db.projectMember.upsert({
    where: { projectId_userId: { projectId: id, userId } },
    create: { projectId: id, userId, role: finalRole },
    update: { role: finalRole },
  });
  await logActivity({ action: "member.add", summary: `añadió a ${target.name ?? "un miembro"} como ${finalRole} (vía API)`, projectId: id, entityType: "member", entityId: userId }).catch(() => null);
  await ensureProjectChannels(id).catch(() => null);
  return apiJson({ ok: true, member: { id: userId, name: target.name, role: finalRole } }, 201);
});
