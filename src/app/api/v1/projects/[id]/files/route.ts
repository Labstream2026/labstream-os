import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { safeExternalUrl } from "@/lib/url";
import { logActivity } from "@/lib/activity";
import { loadProjectForRead, loadProjectForWrite, readJson, str } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/projects/:id/files — carpetas y archivos del proyecto (permiso ver_archivos).
// No se expone la ruta interna del NAS: para enlaces (LINK/DRIVE) va la URL; los archivos locales
// se descargan por la app con sesión.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (!hasPermission(ctx.session, "ver_archivos")) return apiJson({ ok: false, error: "Sin permiso para ver archivos (ver_archivos)." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForRead(id, ctx.session);
  if (access instanceof NextResponse) return access;
  const [folders, files] = await Promise.all([
    db.projectFolder.findMany({ where: { projectId: id }, orderBy: { position: "asc" }, select: { id: true, name: true, _count: { select: { files: true } } } }),
    db.fileAsset.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, name: true, kind: true, url: true, mime: true, size: true, folderId: true, createdAt: true, uploadedBy: { select: { name: true } } },
    }),
  ]);
  return apiJson({
    ok: true,
    folders: folders.map((f) => ({ id: f.id, name: f.name, fileCount: f._count.files })),
    files: files.map((f) => ({ id: f.id, name: f.name, kind: f.kind, url: f.url, mime: f.mime, size: f.size, folderId: f.folderId, uploadedBy: f.uploadedBy?.name ?? null, createdAt: f.createdAt.toISOString() })),
  });
});

// POST /api/v1/projects/:id/files  body { name, url, folderId? } — registra un archivo por ENLACE
// (Drive/URL externa) en la pestaña Archivos, con el permiso de subida de la app (subir_archivos).
// La subida binaria de archivos locales sigue siendo por la app (multipart con sesión).
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForWrite(id, ctx.session, "subir_archivos");
  if (access instanceof NextResponse) return access;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const name = str(body.name).slice(0, 200);
  const url = safeExternalUrl(str(body.url));
  if (!name || !url) return apiJson({ ok: false, error: "Faltan name y url (http/https)." }, 400);

  // La carpeta (opcional) debe ser de ESTE proyecto.
  let folderId: string | null = null;
  const rawFolder = str(body.folderId);
  if (rawFolder) {
    const folder = await db.projectFolder.findUnique({ where: { id: rawFolder }, select: { projectId: true } });
    if (folder?.projectId !== id) return apiJson({ ok: false, error: "folderId no pertenece a este proyecto." }, 400);
    folderId = rawFolder;
  }

  const isDrive = /(^https?:\/\/)(drive|docs)\.google\.com\//.test(url);
  const file = await db.fileAsset.create({
    data: { projectId: id, name, kind: isDrive ? "DRIVE" : "LINK", url, folderId, uploadedById: ctx.session.id },
    select: { id: true, name: true, kind: true, url: true, folderId: true },
  });
  await logActivity({ action: "file.link", summary: `añadió el enlace «${name}» a Archivos (vía API)`, projectId: id, entityType: "file", entityId: file.id }).catch(() => null);
  return apiJson({ ok: true, file }, 201);
});
