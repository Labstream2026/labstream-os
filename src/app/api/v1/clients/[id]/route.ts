import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { logActivity } from "@/lib/activity";
import { readJson, str, loadClientForRead, loadClientForManage } from "@/lib/api-v1";
import { TONE_MAP } from "@/lib/colors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/clients/:id — detalle del cliente con equipo, proyectos y facturación resumida.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadClientForRead(id, ctx.session);
  if (access instanceof NextResponse) return access;

  const client = await db.client.findUnique({
    where: { id },
    select: {
      id: true, name: true, company: true, description: true, emoji: true, accentColor: true,
      notes: true, isActive: true, createdAt: true,
      members: { select: { role: true, user: { select: { id: true, name: true } } } },
      projects: {
        where: { archivedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, code: true, name: true, status: true, progress: true },
      },
      _count: { select: { projects: true, quotes: true, invoices: true } },
    },
  });
  if (!client) return apiJson({ ok: false, error: "Cliente no encontrado." }, 404);
  return apiJson({
    ok: true,
    client: {
      id: client.id,
      name: client.name,
      company: client.company,
      description: client.description,
      emoji: client.emoji,
      accentColor: client.accentColor,
      notes: client.notes,
      active: client.isActive,
      createdAt: client.createdAt.toISOString(),
      members: client.members.map((m) => ({ id: m.user.id, name: m.user.name, role: m.role })),
      projects: client.projects.map((p) => ({ id: p.id, code: p.code, name: p.name, status: p.status, progress: p.progress })),
      counts: { projects: client._count.projects, quotes: client._count.quotes, invoices: client._count.invoices },
    },
  });
});

// PATCH /api/v1/clients/:id  body { name?, company?, description?, notes?, emoji?, accentColor?, active? }
// Edición parcial. Mismo gate que updateClient/setClientActive: gestiona el cliente O editar_clientes.
export const PATCH = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  const access = await loadClientForManage(id, ctx.session);
  if (access instanceof NextResponse) return access;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 160);
    if (!name) return apiJson({ ok: false, error: "El nombre no puede quedar vacío." }, 400);
    data.name = name;
  }
  if (typeof body.company === "string") data.company = body.company.trim().slice(0, 160) || null;
  if (typeof body.description === "string") data.description = clampText(body.description.trim()) || null;
  if (typeof body.notes === "string") data.notes = clampText(body.notes.trim()) || null;
  if (typeof body.emoji === "string") data.emoji = body.emoji.trim().slice(0, 8) || "🏢";
  if ("accentColor" in body) {
    const accent = str(body.accentColor);
    data.accentColor = accent && accent in TONE_MAP ? accent : null;
  }
  if ("active" in body && typeof body.active === "boolean") data.isActive = body.active;
  if (Object.keys(data).length === 0) return apiJson({ ok: false, error: "Nada que actualizar." }, 400);

  const client = await db.client.update({ where: { id }, data, select: { id: true, name: true, company: true, isActive: true } });
  await logActivity({ action: "client.update", summary: `editó el cliente «${client.name}» (vía API)`, clientId: id, entityType: "client", entityId: id }).catch(() => null);
  return apiJson({ ok: true, client: { id: client.id, name: client.name, company: client.company, active: client.isActive } });
});

// DELETE /api/v1/clients/:id — ARCHIVA el cliente (papelera, borrado suave y reversible con
// POST /restore). Como en la app, archivar es solo de administradores. No hay borrado físico por API.
export const DELETE = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const { id } = await (routeCtx as RouteCtx).params;
  if (ctx.session.role !== "admin") return apiJson({ ok: false, error: "Solo un administrador puede archivar clientes." }, 403);
  const client = await db.client.findUnique({ where: { id }, select: { name: true, archivedAt: true } });
  if (!client) return apiJson({ ok: false, error: "Cliente no encontrado." }, 404);
  if (client.archivedAt) return apiJson({ ok: true, alreadyArchived: true });
  await db.client.update({ where: { id }, data: { archivedAt: new Date() } });
  await logActivity({ action: "client.archive", summary: `archivó el cliente ${client.name} (vía API)`, clientId: id, entityType: "client", entityId: id }).catch(() => null);
  return apiJson({ ok: true });
});
