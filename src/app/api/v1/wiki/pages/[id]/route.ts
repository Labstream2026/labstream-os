import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { canSeeWiki } from "@/lib/wiki-access";
import { readJson, str, strArr } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };
const parseTags = (v: unknown): string[] =>
  [...new Set((Array.isArray(v) ? strArr(v) : str(v).split(",")).map((t) => t.trim()).filter(Boolean))].slice(0, 20);

// GET /api/v1/wiki/pages/:id — página completa (contenido markdown). Solo equipo con ver_wiki.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  if (!(await canSeeWiki(ctx.session))) return apiJson({ ok: false, error: "Sin acceso a la Wiki." }, 403);
  const p = await db.wikiPage.findUnique({ where: { id }, select: { id: true, title: true, icon: true, content: true, section: true, tags: true, updatedAt: true, lastReviewedAt: true, owner: { select: { id: true, name: true } } } });
  if (!p) return apiJson({ ok: false, error: "Página no encontrada." }, 404);
  return apiJson({ ok: true, page: { id: p.id, title: p.title, icon: p.icon, content: p.content, section: p.section, tags: p.tags, owner: p.owner ? { id: p.owner.id, name: p.owner.name } : null, lastReviewedAt: p.lastReviewedAt ? p.lastReviewedAt.toISOString() : null, updatedAt: p.updatedAt.toISOString() } });
});

// PATCH /api/v1/wiki/pages/:id  body { title?, icon?, content?, section?, tags? } — edita (editar_wiki).
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  if (!(await canSeeWiki(ctx.session))) return apiJson({ ok: false, error: "Sin acceso a la Wiki." }, 403);
  if (!hasPermission(ctx.session, "editar_wiki")) return apiJson({ ok: false, error: "Sin permiso para editar la Wiki (editar_wiki)." }, 403);
  const exists = await db.wikiPage.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return apiJson({ ok: false, error: "Página no encontrada." }, 404);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title.trim().slice(0, 200) || "Página sin título";
  if ("icon" in body) data.icon = str(body.icon).slice(0, 8) || null;
  if (typeof body.content === "string") data.content = clampText(body.content);
  if ("section" in body) data.section = str(body.section).slice(0, 80) || null;
  if ("tags" in body) data.tags = parseTags(body.tags);
  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar." }, 400);
  await db.wikiPage.update({ where: { id }, data });
  return apiJson({ ok: true });
});

// DELETE /api/v1/wiki/pages/:id — borra la página (editar_wiki).
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  if (!(await canSeeWiki(ctx.session))) return apiJson({ ok: false, error: "Sin acceso a la Wiki." }, 403);
  if (!hasPermission(ctx.session, "editar_wiki")) return apiJson({ ok: false, error: "Sin permiso para editar la Wiki (editar_wiki)." }, 403);
  const exists = await db.wikiPage.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return apiJson({ ok: true, alreadyGone: true });
  await db.wikiPage.delete({ where: { id } });
  return apiJson({ ok: true });
});
