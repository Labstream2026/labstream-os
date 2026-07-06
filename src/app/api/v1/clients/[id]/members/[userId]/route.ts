import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { userCanManageClient } from "@/lib/client-access";
import { logActivity } from "@/lib/activity";
import { readJson, str } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string; userId: string }> };

// PATCH /api/v1/clients/:id/members/:userId  body { role } — marca/desmarca RESPONSABLE de la cuenta.
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id, userId } = await (routeCtx as RouteCtx).params;
  if (!(await userCanManageClient(id, ctx.session))) return apiJson({ ok: false, error: "Sin permiso para gestionar este cliente." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const role = str(body.role) === "RESPONSABLE" ? "RESPONSABLE" : "MIEMBRO";
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, role: { select: { key: true } } } });
  if (!user) return apiJson({ ok: false, error: "Usuario inexistente." }, 400);
  if (role === "RESPONSABLE" && user.role?.key === "cliente") return apiJson({ ok: false, error: "Un usuario del portal cliente no puede ser responsable de la cuenta." }, 400);
  await db.clientMember.upsert({
    where: { clientId_userId: { clientId: id, userId } },
    create: { clientId: id, userId, role },
    update: { role },
  });
  await logActivity({ action: "client.member.role", summary: `cambió el rol de ${user.name} en el cliente (vía API)`, clientId: id, entityType: "client", entityId: id }).catch(() => null);
  return apiJson({ ok: true, member: { id: userId, name: user.name, role } });
});

// DELETE /api/v1/clients/:id/members/:userId — quita el acceso. Quitar a un usuario del PORTAL
// cliente exige administrar_usuarios (gestión de usuarios), igual que la app; quitar internos, no.
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id, userId } = await (routeCtx as RouteCtx).params;
  if (!(await userCanManageClient(id, ctx.session))) return apiJson({ ok: false, error: "Sin permiso para gestionar este cliente." }, 403);
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, role: { select: { key: true } } } });
  if (user?.role?.key === "cliente" && !hasPermission(ctx.session, "administrar_usuarios")) {
    return apiJson({ ok: false, error: "Solo un administrador puede gestionar usuarios del portal cliente." }, 403);
  }
  await db.clientMember.deleteMany({ where: { clientId: id, userId } });
  await logActivity({ action: "client.member.remove", summary: `quitó acceso a ${user?.name ?? "un usuario"} (vía API)`, clientId: id, entityType: "client", entityId: id }).catch(() => null);
  return apiJson({ ok: true });
});
