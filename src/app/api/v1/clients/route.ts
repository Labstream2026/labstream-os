import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, clampText, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { accessibleClientWhere } from "@/lib/client-access";
import { logActivity } from "@/lib/activity";
import { readJson, str } from "@/lib/api-v1";
import { TONE_MAP } from "@/lib/colors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/clients?q=texto — clientes que el titular puede ver. Requiere ver_clientes.
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (!hasPermission(ctx.session, "ver_clientes")) return apiJson({ ok: false, error: "Sin permiso para ver clientes (ver_clientes)." }, 403);
  const q = new URL(req.url).searchParams.get("q")?.trim();
  const base = accessibleClientWhere(ctx.session);
  const where = q
    ? { AND: [base, { archivedAt: null, name: { contains: q, mode: "insensitive" as const } }] }
    : { AND: [base, { archivedAt: null }] };
  const rows = await db.client.findMany({
    where,
    take: 50,
    orderBy: { name: "asc" },
    select: { id: true, name: true, company: true, isActive: true, _count: { select: { projects: true } } },
  });
  return apiJson({
    ok: true,
    clients: rows.map((c) => ({ id: c.id, name: c.name, company: c.company ?? null, active: c.isActive, projects: c._count.projects })),
  });
});

// POST /api/v1/clients  body { name, company?, description?, emoji?, accentColor? } — crea un cliente.
// Mismo gate que la app (createClient): crear_clientes O crear_proyectos. El titular queda como
// miembro para poder verlo (los admin ven todos igual).
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  if (!hasPermission(ctx.session, "crear_clientes") && !hasPermission(ctx.session, "crear_proyectos")) {
    return apiJson({ ok: false, error: "Sin permiso para crear clientes (crear_clientes)." }, 403);
  }
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const name = str(body.name).slice(0, 160);
  if (!name) return apiJson({ ok: false, error: "El nombre es obligatorio." }, 400);
  const accent = str(body.accentColor);
  const client = await db.client.create({
    data: {
      name,
      company: str(body.company).slice(0, 160) || null,
      description: clampText(str(body.description)) || null,
      emoji: str(body.emoji).slice(0, 8) || "🏢",
      ...(accent && accent in TONE_MAP ? { accentColor: accent } : {}),
      members: { create: { userId: ctx.session.id } },
    },
    select: { id: true, name: true, company: true, emoji: true },
  });
  await logActivity({ action: "client.create", summary: `creó el cliente «${name}» (vía API)`, clientId: client.id, entityType: "client", entityId: client.id }).catch(() => null);
  return apiJson({ ok: true, client: { id: client.id, name: client.name, company: client.company, emoji: client.emoji } }, 201);
});
