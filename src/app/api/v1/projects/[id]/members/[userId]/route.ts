import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { isProjectRole } from "@/lib/enum-guards";
import { ensureProjectChannels } from "@/lib/project-chat";
import { logActivity } from "@/lib/activity";
import { readJson, str, loadProjectForManage } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string; userId: string }> };

// PATCH /api/v1/projects/:id/members/:userId  body { role } — cambia el rol del miembro
// (OWNER/MEMBER/GUEST). OWNER solo lo asigna admin o el líder; los usuarios cliente quedan en GUEST.
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id, userId } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForManage(id, ctx.session, "gestionar_miembros_proyecto");
  if (access instanceof NextResponse) return access;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
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
  await logActivity({ action: "member.role", summary: `cambió a ${target.name ?? "un miembro"} a ${finalRole} (vía API)`, projectId: id, entityType: "member", entityId: userId }).catch(() => null);
  await ensureProjectChannels(id).catch(() => null);
  return apiJson({ ok: true, member: { id: userId, name: target.name, role: finalRole } });
});

// DELETE /api/v1/projects/:id/members/:userId — quita al miembro del proyecto (y de su chat).
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id, userId } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForManage(id, ctx.session, "gestionar_miembros_proyecto");
  if (access instanceof NextResponse) return access;
  await db.projectMember.deleteMany({ where: { projectId: id, userId } });
  const member = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  await logActivity({ action: "member.remove", summary: `quitó a ${member?.name ?? "un miembro"} del proyecto (vía API)`, projectId: id, entityType: "member", entityId: userId }).catch(() => null);
  await ensureProjectChannels(id).catch(() => null);
  return apiJson({ ok: true });
});
