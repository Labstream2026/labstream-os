import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { logActivity } from "@/lib/activity";
import { readJson, str, loadProjectForWrite } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string; folderId: string }> };

// PATCH /api/v1/projects/:id/folders/:folderId  body { name?, icon?, color? } — renombra/reestiliza.
// Espejo de updateFolder: escritura en el proyecto + subir_archivos.
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id, folderId } = await (routeCtx as RouteCtx).params;
  const folder = await db.projectFolder.findUnique({ where: { id: folderId }, select: { projectId: true, name: true } });
  if (!folder || folder.projectId !== id) return apiJson({ ok: false, error: "Carpeta no encontrada en este proyecto." }, 404);
  const access = await loadProjectForWrite(id, ctx.session, "subir_archivos");
  if (access instanceof NextResponse) return access;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim().slice(0, 120) || folder.name;
  if ("icon" in body) data.icon = str(body.icon).slice(0, 8) || null;
  if ("color" in body) data.color = str(body.color).slice(0, 24) || null;
  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar." }, 400);
  try {
    const updated = await db.projectFolder.update({ where: { id: folderId }, data, select: { id: true, name: true, icon: true, color: true } });
    await logActivity({ action: "folder.update", summary: `editó la carpeta «${updated.name}» (vía API)`, projectId: id, entityType: "folder", entityId: folderId }).catch(() => null);
    return apiJson({ ok: true, folder: { id: updated.id, name: updated.name, icon: updated.icon, color: updated.color } });
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return apiJson({ ok: false, error: "Ya existe una carpeta con ese nombre." }, 409);
    throw e;
  }
});

// DELETE /api/v1/projects/:id/folders/:folderId — borra la carpeta (sus archivos quedan sin
// carpeta, no se borran). Espejo de deleteFolder: escritura + eliminar_archivos.
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id, folderId } = await (routeCtx as RouteCtx).params;
  const folder = await db.projectFolder.findUnique({ where: { id: folderId }, select: { projectId: true, name: true } });
  if (!folder || folder.projectId !== id) return apiJson({ ok: false, error: "Carpeta no encontrada en este proyecto." }, 404);
  const access = await loadProjectForWrite(id, ctx.session, "eliminar_archivos");
  if (access instanceof NextResponse) return access;
  await db.projectFolder.delete({ where: { id: folderId } });
  await logActivity({ action: "folder.delete", summary: `eliminó la carpeta «${folder.name}» (vía API)`, projectId: id, entityType: "folder", entityId: folderId }).catch(() => null);
  return apiJson({ ok: true });
});
