import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, type ApiKeyContext } from "@/lib/api-key-auth";
import { accessibleProjectWhere } from "@/lib/project-access";
import { userCanAccessClient } from "@/lib/client-access";
import { instantiateTemplate } from "@/lib/provisioning";
import { hasPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { readJson, str } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/projects?q=texto — proyectos que el titular puede ver (acotado por accessibleProjectWhere).
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  const base = accessibleProjectWhere(ctx.session);
  const where = q ? { AND: [base, { name: { contains: q, mode: "insensitive" as const } }] } : base;
  const rows = await db.project.findMany({
    where,
    take: 50,
    orderBy: { updatedAt: "desc" },
    select: { id: true, code: true, name: true, status: true, progress: true, dueDate: true, client: { select: { name: true } }, lead: { select: { name: true } } },
  });
  return apiJson({
    ok: true,
    projects: rows.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      client: p.client?.name ?? null,
      status: p.status,
      progress: p.progress,
      dueDate: p.dueDate ? p.dueDate.toISOString().slice(0, 10) : null,
      lead: p.lead?.name ?? null,
    })),
  });
});

// POST /api/v1/projects  body { name, clientId, leadId?, templateKey?, brief? }
// Crea un proyecto con los mismos efectos que el asistente de la app (código LS-XXXX secuencial,
// canal de chat interno, y carpetas/tareas/entregables si la plantilla los define).
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (!hasPermission(ctx.session, "crear_proyectos")) return apiJson({ ok: false, error: "Sin permiso para crear proyectos (crear_proyectos)." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const name = str(body.name).slice(0, 160);
  const clientId = str(body.clientId);
  if (!name || !clientId) return apiJson({ ok: false, error: "Faltan name y clientId." }, 400);
  // No se confía en el clientId del cuerpo: el titular debe poder acceder a ese cliente.
  if (!(await userCanAccessClient(clientId, ctx.session))) return apiJson({ ok: false, error: "Sin acceso a ese cliente." }, 403);

  // El responsable lo asigna el EQUIPO (mismo criterio que el asistente de la app): el portal
  // cliente nunca fija lead, y el lead debe ser un usuario activo que no sea del portal.
  let leadId: string | null = null;
  const rawLead = str(body.leadId);
  if (rawLead && ctx.session.role !== "cliente") {
    const u = await db.user.findUnique({ where: { id: rawLead }, select: { active: true, role: { select: { key: true } } } });
    if (!u?.active || u.role?.key === "cliente") return apiJson({ ok: false, error: "leadId no es un usuario válido del equipo." }, 400);
    leadId = rawLead;
  }

  const project = await instantiateTemplate(db, { templateKey: str(body.templateKey), name, clientId, leadId });

  // Igual que el asistente: el cliente creador queda como miembro GUEST (solo así ve su proyecto)
  // y su brief queda como descripción para el equipo.
  if (ctx.session.role === "cliente") {
    await db.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: ctx.session.id } },
      create: { projectId: project.id, userId: ctx.session.id, role: "GUEST" },
      update: {},
    });
    const brief = str(body.brief);
    if (brief) await db.project.update({ where: { id: project.id }, data: { description: brief.slice(0, 1000) } });
  }

  await logActivity({ action: "project.create", summary: `creó el proyecto «${name}» (vía API)`, projectId: project.id, entityType: "project", entityId: project.id }).catch(() => null);
  return apiJson({ ok: true, project: { id: project.id, code: project.code, name: project.name } }, 201);
});
