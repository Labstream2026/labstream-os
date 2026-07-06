import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/v1/notifications/read-all — marca como leídas todas las del titular.
export const POST = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  const r = await db.notification.updateMany({ where: { userId: ctx.session.id, read: false }, data: { read: true } });
  return apiJson({ ok: true, marked: r.count });
});
