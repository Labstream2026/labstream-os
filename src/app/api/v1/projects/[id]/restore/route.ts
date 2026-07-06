import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { loadProjectForManage } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/v1/projects/:id/restore — saca el proyecto de la papelera. Igual que la app: exige
// ver_papelera Y poder gestionar ese proyecto concreto (no restaurar proyectos ajenos).
export const POST = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  if (!hasPermission(ctx.session, "ver_papelera")) return apiJson({ ok: false, error: "Sin permiso para la papelera (ver_papelera)." }, 403);
  const access = await loadProjectForManage(id, ctx.session, undefined, true);
  if (access instanceof NextResponse) return access;
  if (!access.archivedAt) return apiJson({ ok: true, alreadyActive: true });
  await db.project.update({ where: { id }, data: { archivedAt: null } });
  await logActivity({ action: "project.restore", summary: `restauró el proyecto «${access.name}» de la papelera (vía API)`, projectId: id, entityType: "project", entityId: id }).catch(() => null);
  return apiJson({ ok: true });
});
