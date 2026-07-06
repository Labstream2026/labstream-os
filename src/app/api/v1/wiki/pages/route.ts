import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { canSeeWiki } from "@/lib/wiki-access";
import { readJson, str, strArr } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const parseTags = (v: unknown): string[] =>
  [...new Set((Array.isArray(v) ? strArr(v) : str(v).split(",")).map((t) => t.trim()).filter(Boolean))].slice(0, 20);

// GET /api/v1/wiki/pages?q=&section= — páginas de la Wiki (solo equipo interno con ver_wiki).
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (!(await canSeeWiki(ctx.session))) return apiJson({ ok: false, error: "Sin acceso a la Wiki." }, 403);
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const section = url.searchParams.get("section")?.trim();
  const where: Record<string, unknown> = {};
  if (section) where.section = section;
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }];
  const rows = await db.wikiPage.findMany({ where, take: 100, orderBy: { updatedAt: "desc" }, select: { id: true, title: true, icon: true, section: true, tags: true, updatedAt: true, owner: { select: { name: true } } } });
  return apiJson({ ok: true, pages: rows.map((p) => ({ id: p.id, title: p.title, icon: p.icon, section: p.section, tags: p.tags, owner: p.owner?.name ?? null, updatedAt: p.updatedAt.toISOString() })) });
});

// POST /api/v1/wiki/pages  body { title?, icon?, content?, section?, tags? } — crea una página
// (canSeeWiki + editar_wiki). El dueño por defecto es el titular.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  if (!(await canSeeWiki(ctx.session))) return apiJson({ ok: false, error: "Sin acceso a la Wiki." }, 403);
  if (!hasPermission(ctx.session, "editar_wiki")) return apiJson({ ok: false, error: "Sin permiso para editar la Wiki (editar_wiki)." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const page = await db.wikiPage.create({
    data: {
      title: str(body.title).slice(0, 200) || "Página sin título",
      icon: str(body.icon).slice(0, 8) || null,
      content: clampText(str(body.content)),
      section: str(body.section).slice(0, 80) || null,
      tags: parseTags(body.tags),
      ownerId: ctx.session.id,
    },
    select: { id: true, title: true, section: true },
  });
  return apiJson({ ok: true, page }, 201);
});
