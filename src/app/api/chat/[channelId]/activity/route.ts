import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { userCanAccessChannel } from "@/lib/chat-access";
import { CHAT_MIRROR_ACTIONS } from "@/lib/activity";
import { resolveProjectStatus } from "@/lib/project-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Actividad del PROYECTO de un canal, para la BARRA DE ESTADO VIVA y su panel. Antes estos eventos
// entraban al chat como mensajes del bot (interrumpían); ahora la barra los muestra sin ruido. El
// dato ya existe en ActivityLog: aquí solo se lee (filtrado al conjunto notable) y se le suma el
// estado actual del proyecto para la píldora. Acceso: misma regla que ver el canal.
const NOTABLE = [...CHAT_MIRROR_ACTIONS];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauth" }, { status: 401 });
  if (!(await userCanAccessChannel(channelId, session))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const channel = await db.chatChannel.findUnique({ where: { id: channelId }, select: { projectId: true } });
  if (!channel?.projectId) return NextResponse.json({ projectId: null, status: null, items: [] });

  const [project, rows] = await Promise.all([
    db.project.findUnique({ where: { id: channel.projectId }, select: { status: true } }),
    db.activityLog.findMany({
      where: { projectId: channel.projectId, action: { in: NOTABLE } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        action: true,
        summary: true,
        createdAt: true,
        actorName: true,
        user: { select: { name: true, initials: true, avatarColor: true } },
      },
    }),
  ]);

  const status = project ? resolveProjectStatus(project.status) : null;
  const items = rows.map((r) => ({
    id: r.id,
    action: r.action,
    summary: r.summary,
    createdAt: r.createdAt.toISOString(),
    actorName: r.actorName,
    user: r.user ? { name: r.user.name, initials: r.user.initials, color: r.user.avatarColor } : null,
  }));

  return NextResponse.json({
    projectId: channel.projectId,
    status: status ? { label: status.label, className: status.className } : null,
    items,
  });
}
