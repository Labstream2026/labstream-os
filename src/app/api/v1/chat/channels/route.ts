import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withApiKey, apiJson, type ApiKeyContext } from "@/lib/api-key-auth";
import { canAccessChannel } from "@/lib/chat-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/chat/channels — canales que el titular puede ver (grupos, proyecto/cliente, DMs). Se
// filtran con la MISMA regla que el chat de la app (canAccessChannel: público/sección/proyecto/
// membresía; el portal cliente solo ve el canal "con el cliente" de su proyecto).
export const GET = withApiKey(async (_req: NextRequest, ctx: ApiKeyContext) => {
  const rows = await db.chatChannel.findMany({
    take: 300,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, type: true, name: true, isPublic: true, audience: true, section: true,
      project: { select: { id: true, name: true, leadId: true, members: { select: { userId: true } } } },
      client: { select: { id: true, name: true } },
      members: { select: { userId: true } },
      _count: { select: { messages: true } },
    },
  });
  const visible = rows.filter((c) => canAccessChannel(c, ctx.session));
  return apiJson({
    ok: true,
    channels: visible.map((c) => ({
      id: c.id, type: c.type, name: c.name, isPublic: c.isPublic, audience: c.audience, section: c.section,
      project: c.project ? { id: c.project.id, name: c.project.name } : null,
      client: c.client ? { id: c.client.id, name: c.client.name } : null,
      messageCount: c._count.messages,
    })),
  });
});
