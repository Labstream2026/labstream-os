import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { safeExternalUrl } from "@/lib/url";
import { readJson, str } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/library?q=&category= — recursos de la biblioteca del equipo (ver_biblioteca).
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (!hasPermission(ctx.session, "ver_biblioteca")) return apiJson({ ok: false, error: "Sin permiso para ver la biblioteca (ver_biblioteca)." }, 403);
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const category = url.searchParams.get("category")?.trim();
  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (q) where.name = { contains: q, mode: "insensitive" };
  const rows = await db.libraryAsset.findMany({ where, take: 100, orderBy: { createdAt: "desc" }, select: { id: true, name: true, kind: true, url: true, category: true, createdAt: true, uploadedBy: { select: { name: true } } } });
  return apiJson({ ok: true, assets: rows.map((a) => ({ id: a.id, name: a.name, kind: a.kind, url: a.url, category: a.category, uploadedBy: a.uploadedBy?.name ?? null, createdAt: a.createdAt.toISOString() })) });
});

// POST /api/v1/library  body { name, url? , path?, category? } — añade un recurso: enlace (url http/s)
// o ruta de NAS (path \\servidor\… / smb:// / X:\). Espejo de addLibraryAsset/addLibraryNasPath:
// gestionar_biblioteca.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (!hasPermission(ctx.session, "gestionar_biblioteca")) return apiJson({ ok: false, error: "Sin permiso para gestionar la biblioteca (gestionar_biblioteca)." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const name = str(body.name).slice(0, 200);
  if (!name) return apiJson({ ok: false, error: "name es obligatorio." }, 400);
  const category = str(body.category).slice(0, 60) || null;
  const rawPath = str(body.path);
  if (rawPath) {
    const ok = /^(\\\\|smb:\/\/|[a-zA-Z]:\\)/.test(rawPath) && !/^(https?:|javascript:)/i.test(rawPath);
    if (!ok) return apiJson({ ok: false, error: "Ruta de NAS no válida (usa \\\\servidor\\carpeta, smb:// o X:\\)." }, 400);
    const asset = await db.libraryAsset.create({ data: { name, url: rawPath, category: category ?? "NAS", kind: "NAS", uploadedById: ctx.session.id }, select: { id: true, name: true, kind: true } });
    return apiJson({ ok: true, asset }, 201);
  }
  const url = safeExternalUrl(str(body.url));
  if (!url) return apiJson({ ok: false, error: "Indica una url http(s) válida o una ruta de NAS (path)." }, 400);
  const kind = url.includes("drive.google.com") ? "DRIVE" : "LINK";
  const asset = await db.libraryAsset.create({ data: { name, url, category, kind, uploadedById: ctx.session.id }, select: { id: true, name: true, kind: true } });
  return apiJson({ ok: true, asset }, 201);
});
