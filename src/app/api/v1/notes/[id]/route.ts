import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { shapeNote, NOTE_SELECT } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// Carga una nota verificando que el titular la pueda gestionar (es suya, o es admin). Si no procede,
// devuelve la NextResponse de error; si todo bien, devuelve la nota. (El llamador comprueba con
// instanceof NextResponse.)
async function loadOwned(id: string, ctx: ApiKeyContext) {
  const note = await db.note.findUnique({ where: { id }, select: { ...NOTE_SELECT, createdById: true } });
  if (!note) return apiJson({ ok: false, error: "Nota no encontrada." }, 404);
  if (note.createdById !== ctx.session.id && ctx.session.role !== "admin") {
    return apiJson({ ok: false, error: "No puedes acceder a una nota de otra persona." }, 403);
  }
  return note;
}

// GET /api/v1/notes/:id — lee una nota propia (admin: cualquiera).
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (!hasPermission(ctx.session, "ver_notas")) return apiJson({ ok: false, error: "Sin permiso para ver notas (ver_notas)." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const r = await loadOwned(id, ctx);
  if (r instanceof NextResponse) return r;
  return apiJson({ ok: true, note: shapeNote(r) });
});

// PATCH /api/v1/notes/:id  body { title?, content?, category? } — edita los campos dados (parcial).
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (!hasPermission(ctx.session, "editar_notas")) return apiJson({ ok: false, error: "Sin permiso para editar notas (editar_notas)." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  const r = await loadOwned(id, ctx);
  if (r instanceof NextResponse) return r;
  let body: { title?: unknown; content?: unknown; category?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiJson({ ok: false, error: "Cuerpo JSON inválido." }, 400);
  }
  const data: { title?: string; content?: string; category?: string | null } = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 200);
  if (typeof body.content === "string") {
    const c = clampText(body.content.trim());
    if (!c) return apiJson({ ok: false, error: "El contenido no puede quedar vacío." }, 400);
    data.content = c;
  }
  if (typeof body.category === "string") data.category = body.category.trim() ? body.category.trim().slice(0, 60) : null;
  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar (title, content o category)." }, 400);
  const note = await db.note.update({ where: { id }, data, select: NOTE_SELECT });
  await logActivity({ action: "note.update", summary: `editó la nota «${note.title}» (vía API)`, entityType: "note", entityId: note.id }).catch(() => null);
  return apiJson({ ok: true, note: shapeNote(note) });
});

// DELETE /api/v1/notes/:id — borra una nota propia (admin: cualquiera).
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (!hasPermission(ctx.session, "editar_notas")) return apiJson({ ok: false, error: "Sin permiso para editar notas (editar_notas)." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  const r = await loadOwned(id, ctx);
  if (r instanceof NextResponse) return r;
  await db.note.delete({ where: { id } });
  await logActivity({ action: "note.delete", summary: `borró la nota «${r.title}» (vía API)`, entityType: "note", entityId: id }).catch(() => null);
  return apiJson({ ok: true });
});
