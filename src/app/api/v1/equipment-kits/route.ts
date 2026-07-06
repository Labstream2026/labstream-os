import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/equipment-kits — kits de equipos guardados (plantillas reutilizables). Solo equipo.
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext) => {
  if (ctx.session.role === "cliente") return apiJson({ ok: false, error: "No disponible para el portal cliente." }, 403);
  const rows = await db.equipmentKit.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, emoji: true, description: true, _count: { select: { items: true } } } });
  return apiJson({ ok: true, kits: rows.map((k) => ({ id: k.id, name: k.name, emoji: k.emoji, description: k.description, items: k._count.items })) });
});
