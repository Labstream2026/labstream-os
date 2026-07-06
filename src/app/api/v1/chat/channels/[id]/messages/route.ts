import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, bodyTooLarge, type ApiKeyContext } from "@/lib/api-key-auth";
import { hasPermission } from "@/lib/auth";
import { userCanAccessChannel } from "@/lib/chat-access";
import { publishMessage, type ChatMessagePayload } from "@/lib/chat-bus";
import { readJson, str } from "@/lib/api-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// GET /api/v1/chat/channels/:id/messages?take= — mensajes recientes del canal (mismo acceso que verlo).
export const GET = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  const { id } = await (routeCtx as RouteCtx).params;
  if (!(await userCanAccessChannel(id, ctx.session))) return apiJson({ ok: false, error: "Sin acceso a este canal." }, 403);
  const take = Math.min(200, Math.max(1, parseInt(new URL(req.url).searchParams.get("take") ?? "50", 10) || 50));
  const rows = await db.chatMessage.findMany({
    where: { channelId: id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, body: true, parentId: true, pinned: true, createdAt: true, editedAt: true, author: { select: { id: true, name: true, initials: true, avatarColor: true } } },
  });
  return apiJson({
    ok: true,
    messages: rows.reverse().map((m) => ({
      id: m.id, body: m.body, parentId: m.parentId, pinned: m.pinned,
      createdAt: m.createdAt.toISOString(), editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      author: m.author ? { id: m.author.id, name: m.author.name, initials: m.author.initials, color: m.author.avatarColor } : null,
    })),
  });
});

// POST /api/v1/chat/channels/:id/messages  body { body, parentId? } — envía un mensaje de texto.
// Espejo del núcleo de sendMessage: acceso al canal + comentar. Se publica en vivo (SSE). No dispara
// a Marcebot ni adjunta archivos (eso es de la app); el resto del equipo lo ve al recargar.
export const POST = withApiKey(async (req: NextRequest, ctx: ApiKeyContext, routeCtx: unknown) => {
  if (ctx.readOnly) return apiJson({ ok: false, error: "Esta clave es de solo lectura." }, 403);
  if (bodyTooLarge(req)) return apiJson({ ok: false, error: "Cuerpo demasiado grande." }, 413);
  const { id } = await (routeCtx as RouteCtx).params;
  if (!(await userCanAccessChannel(id, ctx.session))) return apiJson({ ok: false, error: "Sin acceso a este canal." }, 403);
  if (!hasPermission(ctx.session, "comentar")) return apiJson({ ok: false, error: "Sin permiso para comentar (comentar)." }, 403);
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const text = str(body.body).slice(0, 4000);
  if (!text) return apiJson({ ok: false, error: "body es obligatorio." }, 400);
  const parentId = str(body.parentId) || null;

  const msg = await db.chatMessage.create({
    data: { channelId: id, body: text, parentId, authorId: ctx.session.id },
    select: { id: true, body: true, parentId: true, createdAt: true, author: { select: { name: true, initials: true, avatarColor: true } } },
  });
  const payload: ChatMessagePayload = {
    id: msg.id, channelId: id, body: msg.body, parentId: msg.parentId, createdAt: msg.createdAt.toISOString(),
    author: msg.author ? { name: msg.author.name, initials: msg.author.initials, color: msg.author.avatarColor } : null,
    attachments: [],
  };
  publishMessage(payload);
  return apiJson({ ok: true, message: payload }, 201);
});
