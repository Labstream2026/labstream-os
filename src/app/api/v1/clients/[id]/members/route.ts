import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { userCanManageClient } from "@/lib/client-access";
import { logActivity } from "@/lib/activity";
import { readJson, str, loadClientForRead } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/clients/:id/members — equipo con acceso al cliente (rol RESPONSABLE/MIEMBRO).
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadClientForRead(id, ctx.session);
  if (access instanceof NextResponse) return access;
  const members = await db.clientMember.findMany({
    where: { clientId: id },
    select: { role: true, user: { select: { id: true, name: true, role: { select: { key: true } } } } },
  });
  return apiJson({ ok: true, members: members.map((m) => ({ id: m.user.id, name: m.user.name, role: m.role, userRole: m.user.role?.key ?? null })) });
});

// POST /api/v1/clients/:id/members  body { userId, role? } — da acceso a un usuario del equipo al
// cliente. role "RESPONSABLE" | "MIEMBRO". Mismo gate que addClientMember: gestiona el cliente.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  if (!(await userCanManageClient(id, ctx.session))) return apiJson({ ok: false, error: "Sin permiso para gestionar este cliente." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const userId = str(body.userId);
  if (!userId) return apiJson({ ok: false, error: "userId es obligatorio." }, 400);
  const role = str(body.role) === "RESPONSABLE" ? "RESPONSABLE" : "MIEMBRO";
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, active: true, role: { select: { key: true } } } });
  if (!user?.active) return apiJson({ ok: false, error: "Usuario inexistente o inactivo." }, 400);
  // Un usuario del portal (rol cliente) nunca es RESPONSABLE de la cuenta (igual que la app).
  if (role === "RESPONSABLE" && user.role?.key === "cliente") return apiJson({ ok: false, error: "Un usuario del portal cliente no puede ser responsable de la cuenta." }, 400);
  await db.clientMember.upsert({
    where: { clientId_userId: { clientId: id, userId } },
    create: { clientId: id, userId, role },
    update: { role },
  });
  await logActivity({ action: "client.member.add", summary: `dio acceso a ${user.name} (vía API)`, clientId: id, entityType: "client", entityId: id }).catch(() => null);
  return apiJson({ ok: true, member: { id: userId, name: user.name, role } }, 201);
});
