import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getTaskLabels } from "@/lib/workflow-labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tareas abiertas (no terminadas) asignadas o creadas por el usuario. Lo usa el
// dock en la página "Chat del día" para mostrar un vistazo de pendientes.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ tasks: [] }, { status: 401 });

  const { statuses } = await getTaskLabels();
  const openKeys = statuses.filter((s) => !s.isDone).map((s) => s.key);

  const tasks = await db.task.findMany({
    where: { status: { in: openKeys }, OR: [{ assigneeId: session.id }, { ownerId: session.id }] },
    orderBy: [{ dueDate: "asc" }, { status: "asc" }],
    take: 50,
    select: { id: true, title: true, dueDate: true, priority: true, project: { select: { id: true, name: true, emoji: true } } },
  });

  return new NextResponse(
    JSON.stringify({
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate ? t.dueDate.toISOString() : null,
        priority: t.priority,
        projectId: t.project?.id ?? null,
        projectName: t.project?.name ?? null,
        projectEmoji: t.project?.emoji ?? null,
      })),
    }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}
