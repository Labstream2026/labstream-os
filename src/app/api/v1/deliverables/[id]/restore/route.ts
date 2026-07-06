import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { canManageProject } from "@/lib/project-access";
import { logActivity } from "@/lib/activity";
import { loadDeliverable } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// POST /api/v1/deliverables/:id/restore — desarchiva el entregable. Espejo de setDeliverableArchived
// (canManageProject). El proyecto no puede estar archivado.
export const POST = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const acc = await loadDeliverable(id);
  if (!acc || acc.project.archivedAt) return apiJson({ ok: false, error: "Entregable no encontrado." }, 404);
  if (!canManageProject(acc.project, ctx.session)) return apiJson({ ok: false, error: "Sin permiso para gestionar este entregable." }, 403);
  if (!acc.archivedAt) return apiJson({ ok: true, alreadyActive: true });
  await db.deliverable.update({ where: { id }, data: { archivedAt: null } });
  await logActivity({ action: "deliverable.restore", summary: `desarchivó el entregable «${acc.name}» (vía API)`, projectId: acc.projectId, entityType: "deliverable", entityId: id }).catch(() => null);
  return apiJson({ ok: true });
});
