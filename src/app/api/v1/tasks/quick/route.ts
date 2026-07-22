import { type NextRequest } from "next/server";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/auth";
import { canWriteProject } from "@/lib/project-access";
import { quickCreateFromText } from "@/lib/task-quick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v1/tasks/quick — crea una tarea desde UNA frase en español (Tareas 2.0):
// «Grabar dron mañana 9am @Zahid #rodaje 2h» → fechas, @responsable, #etiquetas, !prioridad y
// estimación salen del texto (mismo núcleo que el quick-add de la app: lib/task-quick).
// Pensado para Marcebot/MCP: la vía natural de dictar tareas por chat o voz.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (!hasPermission(ctx.session, "crear_tareas")) {
    return apiJson({ ok: false, error: "La llave no tiene permiso de crear tareas." }, 403);
  }
  const body = (await req.json().catch(() => null)) as { text?: string; projectId?: string } | null;
  const text = body?.text?.trim();
  if (!text) return apiJson({ ok: false, error: "Falta `text` (la frase de la tarea)." }, 400);

  let pid: string | null = null;
  if (body?.projectId) {
    const project = await db.project.findUnique({
      where: { id: body.projectId },
      select: { id: true, isPrivate: true, leadId: true, archivedAt: true, finishedAt: true, members: { select: { userId: true, role: true } } },
    });
    if (!project || project.archivedAt) return apiJson({ ok: false, error: "Proyecto no encontrado." }, 404);
    if (!canWriteProject(project, ctx.session)) return apiJson({ ok: false, error: "Sin acceso de escritura a ese proyecto." }, 403);
    pid = project.id;
  }

  const r = await quickCreateFromText(ctx.session, text, pid);
  if (!r.ok) return apiJson({ ok: false, error: r.error }, 422);
  return apiJson({ ok: true, taskId: r.taskId, title: r.title }, 201);
});
