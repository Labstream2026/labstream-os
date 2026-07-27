import { db } from "@/lib/db";
import { countNoteTasks } from "@/lib/note-tasks";
import type { SessionUser } from "@/lib/session";
import type { TabNote } from "@/components/notes/notes-tab";

// Notas de un PROYECTO o de un CLIENTE, para su pestaña «Notas». Mismo criterio de
// visibilidad que /notas: las mías, las del equipo y las compartidas por proyecto. Formatea
// aquí las fechas (servidor) para que el componente cliente no lea el reloj.

const fmt = (d: Date): string => {
  try {
    return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return "";
  }
};

export async function notesFor(
  session: SessionUser,
  scope: { projectId?: string; clientId?: string },
): Promise<TabNote[]> {
  const where = scope.projectId ? { projectId: scope.projectId } : scope.clientId ? { clientId: scope.clientId } : null;
  if (!where) return [];

  const rows = await db.note.findMany({
    where: {
      AND: [
        where,
        { archivedAt: null },
        { OR: [{ createdById: session.id }, { visibility: { in: ["team", "project"] } }] },
      ],
    },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    take: 60,
    select: { id: true, title: true, content: true, category: true, remindAt: true, updatedAt: true, createdById: true, createdBy: { select: { name: true } } },
  });

  return rows.map((n) => {
    const tasks = countNoteTasks(n.content);
    const body = n.content.trim();
    const rest = body.startsWith(n.title) ? body.slice(n.title.length).trim() : body;
    return {
      id: n.id,
      title: n.title,
      snippet: rest.replace(/\s+/g, " ").slice(0, 120),
      when: fmt(n.updatedAt),
      category: n.category,
      done: tasks.done,
      total: tasks.total,
      reminder: n.remindAt ? fmt(n.remindAt) : null,
      ownerName: n.createdById === session.id ? null : n.createdBy?.name ?? null,
    };
  });
}
