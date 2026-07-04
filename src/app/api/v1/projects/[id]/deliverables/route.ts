import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, type ApiKeyContext } from "@/lib/api-key-auth";
import { isDeliverableType } from "@/lib/enum-guards";
import { logActivity } from "@/lib/activity";
import { loadProjectForRead, loadProjectForWrite, readJson, str, ymd, isYmd } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/projects/:id/deliverables — entregables del proyecto con su estado y versiones.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForRead(id, ctx.session);
  if (access instanceof NextResponse) return access;
  const rows = await db.deliverable.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, type: true, status: true, dueDate: true, copy: true, hashtags: true,
      reviewer: { select: { id: true, name: true } },
      versions: { orderBy: { number: "desc" }, take: 1, select: { number: true, fileUrl: true, internalApproved: true, createdAt: true } },
      _count: { select: { versions: true } },
    },
  });
  return apiJson({
    ok: true,
    deliverables: rows.map((d) => ({
      id: d.id, name: d.name, type: d.type, status: d.status, dueDate: ymd(d.dueDate),
      copy: d.copy, hashtags: d.hashtags,
      reviewer: d.reviewer ? { id: d.reviewer.id, name: d.reviewer.name } : null,
      versionCount: d._count.versions,
      lastVersion: d.versions[0]
        ? { number: d.versions[0].number, fileUrl: d.versions[0].fileUrl, internalApproved: d.versions[0].internalApproved, createdAt: d.versions[0].createdAt.toISOString() }
        : null,
    })),
  });
});

// POST /api/v1/projects/:id/deliverables  body { name, type?, dueDate?, reviewerId? } — crea el
// entregable (escritura en el proyecto, igual que la app; el reviewer debe ser del equipo del
// proyecto, nunca un usuario del portal).
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadProjectForWrite(id, ctx.session);
  if (access instanceof NextResponse) return access;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const name = str(body.name).slice(0, 200);
  if (!name) return apiJson({ ok: false, error: "Falta name." }, 400);
  const typeRaw = str(body.type) || "REEL";
  if (!isDeliverableType(typeRaw)) return apiJson({ ok: false, error: `type inválido (${typeRaw}). Usa REEL, VIDEO_LARGO, REEL_CELULAR, FOTOGRAFIA, SHORT, PODCAST, TEASER, DOCUMENTO u OTRO.` }, 400);
  const dueRaw = str(body.dueDate);
  if (dueRaw && !isYmd(dueRaw)) return apiJson({ ok: false, error: 'dueDate debe ser "YYYY-MM-DD".' }, 400);

  // Revisor: solo miembros/responsable del proyecto, nunca un usuario del portal cliente.
  let reviewerId: string | null = null;
  const rawReviewer = str(body.reviewerId);
  if (rawReviewer) {
    const allowed = new Set([access.leadId, ...access.members.map((m) => m.userId)].filter(Boolean));
    const u = await db.user.findUnique({ where: { id: rawReviewer }, select: { role: { select: { key: true } } } });
    if (!allowed.has(rawReviewer) || u?.role?.key === "cliente") return apiJson({ ok: false, error: "reviewerId debe ser un miembro del equipo del proyecto." }, 400);
    reviewerId = rawReviewer;
  }

  const d = await db.deliverable.create({
    data: {
      projectId: id,
      name,
      type: typeRaw,
      dueDate: dueRaw ? new Date(`${dueRaw}T12:00:00.000Z`) : null,
      reviewerId,
      ownerId: ctx.session.id,
    },
    select: { id: true, name: true, type: true, status: true },
  });
  if (reviewerId) await db.deliverableReviewer.create({ data: { deliverableId: d.id, userId: reviewerId } }).catch(() => null);
  await logActivity({ action: "deliverable.create", summary: `creó el entregable «${name}» (vía API)`, projectId: id, entityType: "deliverable", entityId: d.id }).catch(() => null);
  return apiJson({ ok: true, deliverable: d }, 201);
});
