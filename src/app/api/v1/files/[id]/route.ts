import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { logActivity } from "@/lib/activity";
import { readJson, str, loadProjectForWrite } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// PATCH /api/v1/files/:id  body { name?, folderId? } — renombra o mueve el archivo/enlace de carpeta
// (folderId null = sin carpeta). Escritura en el proyecto + subir_archivos.
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const file = await db.fileAsset.findUnique({ where: { id }, select: { name: true, projectId: true } });
  if (!file?.projectId) return apiJson({ ok: false, error: "Archivo no encontrado." }, 404);
  const access = await loadProjectForWrite(file.projectId, ctx.session, "subir_archivos");
  if (access instanceof NextResponse) return access;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 200);
    if (!name) return apiJson({ ok: false, error: "El nombre no puede quedar vacío." }, 400);
    data.name = name;
  }
  if ("folderId" in body) {
    const folderId = str(body.folderId);
    if (!folderId) data.folderId = null;
    else {
      const folder = await db.projectFolder.findUnique({ where: { id: folderId }, select: { projectId: true } });
      if (!folder || folder.projectId !== file.projectId) return apiJson({ ok: false, error: "La carpeta no pertenece a este proyecto." }, 400);
      data.folderId = folderId;
    }
  }
  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar." }, 400);
  const updated = await db.fileAsset.update({ where: { id }, data, select: { id: true, name: true, folderId: true } });
  await logActivity({ action: "file.update", summary: `editó el archivo «${updated.name}» (vía API)`, projectId: file.projectId, entityType: "file", entityId: id }).catch(() => null);
  return apiJson({ ok: true, file: { id: updated.id, name: updated.name, folderId: updated.folderId } });
});

// DELETE /api/v1/files/:id — borra el archivo/enlace. Espejo de deleteFile: escritura + eliminar_archivos.
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const file = await db.fileAsset.findUnique({ where: { id }, select: { name: true, projectId: true } });
  if (!file?.projectId) return apiJson({ ok: false, error: "Archivo no encontrado." }, 404);
  const access = await loadProjectForWrite(file.projectId, ctx.session, "eliminar_archivos");
  if (access instanceof NextResponse) return access;
  await db.fileAsset.delete({ where: { id } });
  await logActivity({ action: "file.delete", summary: `eliminó el archivo «${file.name}» (vía API)`, projectId: file.projectId, entityType: "file", entityId: id }).catch(() => null);
  return apiJson({ ok: true });
});
