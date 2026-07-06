import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/notifications?unread=true&take= — notificaciones del TITULAR (nunca de otros).
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext) => {
  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "true";
  const take = Math.min(100, Math.max(1, parseInt(url.searchParams.get("take") ?? "50", 10) || 50));
  const where = { userId: ctx.session.id, ...(unreadOnly ? { read: false } : {}) };
  const [rows, unread] = await Promise.all([
    db.notification.findMany({ where, take, orderBy: { createdAt: "desc" }, select: { id: true, type: true, title: true, body: true, link: true, read: true, createdAt: true } }),
    db.notification.count({ where: { userId: ctx.session.id, read: false } }),
  ]);
  return apiJson({ ok: true, unread, notifications: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: n.read, createdAt: n.createdAt.toISOString() })) });
});
