import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Notas vía REST. Las notas son PERSONALES del titular de la AppKey (admin ve todas). No hay un
// permiso específico de notas (cualquier key válida gestiona las suyas); las keys de SOLO LECTURA
// no pueden crear/editar. El formato de salida coincide con /api/v1/notes/[id].
export type NoteRow = {
  id: string; title: string; content: string; category: string | null; pinned: boolean; source: string;
  createdAt: Date; updatedAt: Date; project: { id: string; name: string } | null;
};
export function shapeNote(n: NoteRow) {
  return {
    id: n.id, title: n.title, content: n.content, category: n.category, pinned: n.pinned, source: n.source,
    createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString(),
    project: n.project ? { id: n.project.id, name: n.project.name } : null,
  };
}
export const NOTE_SELECT = {
  id: true, title: true, content: true, category: true, pinned: true, source: true,
  createdAt: true, updatedAt: true, project: { select: { id: true, name: true } },
} as const;

// GET /api/v1/notes?q=texto&projectId=...  — lista las notas del titular (admin: todas).
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const projectId = url.searchParams.get("projectId")?.trim();
  const where: Record<string, unknown>[] = [];
  if (ctx.session.role !== "admin") where.push({ createdById: ctx.session.id });
  if (q) where.push({ OR: [{ title: { contains: q, mode: "insensitive" as const } }, { content: { contains: q, mode: "insensitive" as const } }] });
  if (projectId) where.push({ projectId });
  const rows = await db.note.findMany({
    where: where.length ? { AND: where } : {},
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    take: 100,
    select: NOTE_SELECT,
  });
  return apiJson({ ok: true, notes: rows.map(shapeNote) });
});

// POST /api/v1/notes  body { content (req), title?, category?, projectId? } — crea una nota del titular.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  let body: { title?: unknown; content?: unknown; category?: unknown; projectId?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiJson({ ok: false, error: "Cuerpo JSON inválido." }, 400);
  }
  const content = typeof body.content === "string" ? clampText(body.content.trim()) : "";
  if (!content) return apiJson({ ok: false, error: "Falta 'content' (string)." }, 400);
  const title = (typeof body.title === "string" && body.title.trim() ? body.title.trim() : content.replace(/\s+/g, " ").slice(0, 60)).slice(0, 200);
  const category = typeof body.category === "string" && body.category.trim() ? body.category.trim().slice(0, 60) : null;
  let projectId: string | null = null;
  if (typeof body.projectId === "string" && body.projectId.trim()) {
    const p = await db.project.findFirst({ where: { AND: [accessibleProjectWhere(ctx.session), { id: body.projectId.trim() }] }, select: { id: true } });
    if (!p) return apiJson({ ok: false, error: "Proyecto no encontrado o sin acceso." }, 400);
    projectId = p.id;
  }
  const note = await db.note.create({
    data: { title, content, category, source: "api", createdById: ctx.session.id, projectId },
    select: NOTE_SELECT,
  });
  await logActivity({ action: "note.create", summary: `creó la nota «${title}» (vía API)`, projectId: projectId ?? undefined, entityType: "note", entityId: note.id }).catch(() => null);
  return apiJson({ ok: true, note: shapeNote(note) }, 201);
});
