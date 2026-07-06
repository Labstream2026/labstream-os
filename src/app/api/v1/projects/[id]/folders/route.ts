import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { readJson, str, loadProjectForRead, loadProjectForWrite } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/projects/:id/folders — carpetas del proyecto (con conteo de archivos). Requiere ver_archivos.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForRead(id, ctx.session);
  if (access instanceof NextResponse) return access;
  if (!hasPermission(ctx.session, "ver_archivos")) return apiJson({ ok: false, error: "Sin permiso para ver archivos (ver_archivos)." }, 403);
  const folders = await db.projectFolder.findMany({ where: { projectId: id }, orderBy: { position: "asc" }, select: { id: true, name: true, icon: true, color: true, _count: { select: { files: true } } } });
  return apiJson({ ok: true, folders: folders.map((f) => ({ id: f.id, name: f.name, icon: f.icon, color: f.color, fileCount: f._count.files })) });
});

// POST /api/v1/projects/:id/folders  body { name, icon?, color? } — crea una carpeta. Espejo de
// createFolder: escritura en el proyecto + subir_archivos. Nombre único por proyecto (idempotente).
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForWrite(id, ctx.session, "subir_archivos");
  if (access instanceof NextResponse) return access;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const name = str(body.name).slice(0, 120);
  if (!name) return apiJson({ ok: false, error: "El nombre es obligatorio." }, 400);
  const count = await db.projectFolder.count({ where: { projectId: id } });
  try {
    const folder = await db.projectFolder.create({
      data: { projectId: id, name, icon: str(body.icon).slice(0, 8) || null, color: str(body.color).slice(0, 24) || null, position: count },
      select: { id: true, name: true, icon: true, color: true },
    });
    await logActivity({ action: "folder.create", summary: `creó la carpeta «${name}» (vía API)`, projectId: id, entityType: "folder", entityId: folder.id }).catch(() => null);
    return apiJson({ ok: true, folder: { id: folder.id, name: folder.name, icon: folder.icon, color: folder.color } }, 201);
  } catch (e) {
    if ((e as { code?: string })?.code === "P2002") return apiJson({ ok: false, error: "Ya existe una carpeta con ese nombre." }, 409);
    throw e;
  }
});
