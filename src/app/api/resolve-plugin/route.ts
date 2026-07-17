import { db } from "@/lib/db";
import { verifyReviewToken } from "@/lib/review-token";
import { rateLimit } from "@/lib/rate-limit";
import { notifyMany } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// API para el plugin de DaVinci Resolve (script del equipo de edición). Autorización = el
// MISMO token firmado del enlace de revisión (/review/[token]): el editor pega ese enlace en
// el panel del plugin y con él lee las correcciones y las marca como hechas desde Resolve.
//
// A DIFERENCIA del portal del cliente, aquí NO se corta por estado del entregable ni por
// reviewExpiresAt: es una herramienta del EQUIPO y el editor trabaja justamente cuando la pieza
// vuelve a producción (CORRECCIONES/REVISION_INTERNA), estados en los que el portal se cierra.
// La revocación del enlace (reviewRevokedAt) SÍ corta el acceso: es el kill-switch del equipo.
// Alcance deliberadamente MENOR que el portal: solo lectura + marcar hecha (nada de aprobar,
// decidir ni comentar), así un enlace filtrado no da más poder por esta vía que por la web.

function jsonError(status: number, error: string) {
  return Response.json({ ok: false, error }, { status });
}

// El editor puede pegar el enlace completo (https://…/review/<token>) o solo el token; el
// plugin manda lo que sea en `t` y aquí se extrae el token si vino la URL entera.
function cleanToken(raw: string): string {
  const m = raw.match(/\/review\/([^/?#\s]+)/);
  return decodeURIComponent(m ? m[1] : raw.trim());
}

async function resolveDeliverableForPlugin(rawToken: string) {
  const deliverableId = verifyReviewToken(cleanToken(rawToken));
  if (!deliverableId) return { error: jsonError(401, "Enlace de revisión inválido o caducado.") };
  const d = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: {
      id: true,
      name: true,
      number: true,
      type: true,
      status: true,
      fixDueAt: true,
      reviewRevokedAt: true,
      projectId: true,
      project: { select: { name: true, leadId: true, members: { select: { userId: true } } } },
    },
  });
  if (!d) return { error: jsonError(404, "El entregable ya no existe.") };
  if (d.reviewRevokedAt) return { error: jsonError(403, "El enlace de revisión fue revocado por el equipo.") };
  return { deliverable: d };
}

// Clave de rate-limit: token + IP (mismo criterio que las acciones del portal).
function rlKey(req: Request, token: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "";
  return `${cleanToken(token)}:${ip}`;
}

// GET /api/resolve-plugin?t=<token o URL de revisión>
// Devuelve el entregable, sus versiones y TODOS los comentarios accionables. Se excluyen solo
// los BORRADORES internos de pre-aprobación (fromClient=false, no visibles al cliente y sin
// sellar con lockedAt): esos aún no son checklist y el equipo puede editarlos o borrarlos.
// El JSON no incluye la imagen del dibujo (base64 pesado); solo el flag hasDrawing.
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") || "";
  if (!t) return jsonError(400, "Falta el enlace de revisión (parámetro t).");
  if (!rateLimit(`plugin-fetch:${rlKey(req, t)}`, 60, 60_000)) {
    return jsonError(429, "Demasiadas peticiones seguidas. Espera un momento.");
  }
  const r = await resolveDeliverableForPlugin(t);
  if (r.error) return r.error;
  const d = r.deliverable;

  const [versions, comments] = await Promise.all([
    db.deliverableVersion.findMany({
      where: { deliverableId: d.id },
      orderBy: { number: "desc" },
      select: { number: true, durationSec: true, internalApproved: true, createdAt: true },
    }),
    db.reviewComment.findMany({
      where: {
        deliverableId: d.id,
        NOT: { fromClient: false, visibleToClient: false, lockedAt: null },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        authorName: true,
        fromClient: true,
        body: true,
        timecode: true,
        versionNumber: true,
        priority: true,
        resolved: true,
        resolvedAt: true,
        resolvedBy: { select: { name: true } },
        isNote: true,
        parentId: true,
        drawingData: true,
        createdAt: true,
        editedAt: true,
      },
    }),
  ]);

  return Response.json({
    ok: true,
    api: 1,
    deliverable: {
      id: d.id,
      name: d.name,
      number: d.number,
      type: d.type,
      status: d.status,
      fixDueAt: d.fixDueAt,
      projectName: d.project.name,
    },
    versions,
    comments: comments.map((c) => ({
      id: c.id,
      authorName: c.authorName,
      fromClient: c.fromClient,
      body: c.body,
      timecode: c.timecode,
      versionNumber: c.versionNumber,
      priority: c.priority,
      resolved: c.resolved,
      resolvedAt: c.resolvedAt,
      resolvedBy: c.resolvedBy?.name ?? null,
      isNote: c.isNote,
      parentId: c.parentId,
      hasDrawing: c.drawingData != null,
      createdAt: c.createdAt,
      editedAt: c.editedAt,
    })),
  });
}

// POST /api/resolve-plugin — marca/desmarca una corrección como hecha desde Resolve.
// Body JSON: { t, commentId, resolved, editorName? }. Misma semántica que
// resolveReviewComment de la web (proyectos/[id]/actions.ts), con dos diferencias por no
// haber sesión: resolvedById queda null (la trazabilidad del nombre va en la notificación)
// y la autorización es el token del enlace, igual capability que las acciones del portal.
export async function POST(req: Request) {
  let body: { t?: string; commentId?: string; resolved?: boolean; editorName?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Cuerpo JSON inválido.");
  }
  const t = body.t || "";
  const commentId = String(body.commentId || "");
  const resolved = body.resolved === true;
  if (!t || !commentId) return jsonError(400, "Faltan datos (t, commentId).");
  if (!rateLimit(`plugin-resolve:${rlKey(req, t)}`, 60, 60_000)) {
    return jsonError(429, "Demasiadas acciones seguidas. Espera un momento.");
  }
  const r = await resolveDeliverableForPlugin(t);
  if (r.error) return r.error;
  const d = r.deliverable;

  const c = await db.reviewComment.findUnique({
    where: { id: commentId },
    select: { id: true, deliverableId: true, body: true, isNote: true, parentId: true },
  });
  // La corrección debe ser de ESTE entregable (un id ajeno no cuela por el token) y ser un
  // punto del checklist de verdad: ni una nota suelta ni una respuesta de hilo.
  if (!c || c.deliverableId !== d.id) return jsonError(404, "Esa corrección no existe en esta revisión.");
  if (c.isNote || c.parentId) return jsonError(400, "Solo se marcan las correcciones del checklist (no notas ni respuestas).");

  await db.reviewComment.update({
    where: { id: c.id },
    data: resolved
      ? { resolved: true, resolvedAt: new Date(), resolvedById: null }
      : { resolved: false, resolvedAt: null, resolvedById: null },
  });

  // Igual que en la web: al marcar HECHA se avisa (solo in-app) al equipo del proyecto;
  // desmarcar no notifica. Aquí no hay sesión que excluir: se avisa a todo el equipo.
  if (resolved) {
    const who = (body.editorName ?? "").trim().slice(0, 80) || "Editor";
    const change = c.body.replace(/^\(anotación\)$/, "anotación").slice(0, 80);
    await notifyMany(
      [d.project.leadId, ...d.project.members.map((m) => m.userId)],
      {
        type: "review",
        event: "review_checklist",
        title: `Cambio realizado: ${d.name}`,
        body: `${who} marcó como hecho desde DaVinci Resolve: «${change}»`,
        link: `/revisiones/${d.id}`,
      },
    );
  }

  return Response.json({ ok: true, comment: { id: c.id, resolved } });
}
