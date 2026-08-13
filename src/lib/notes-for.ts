import { db } from "@/lib/db";
import { countNoteTasks } from "@/lib/note-tasks";
import { emojiToText } from "@/components/icons/marks";
import type { SessionUser } from "@/lib/session";
import type { TabNote } from "@/components/notes/notes-tab";

// Notas de un PROYECTO o de un CLIENTE, para su pestaña «Notas». Mismo criterio de
// visibilidad que /notas: las mías, las del equipo y las compartidas por proyecto. Formatea
// aquí las fechas (servidor) para que el componente cliente no lea el reloj.
//
// En el alcance CLIENTE se pueden pedir TAMBIÉN las notas de sus proyectos (projectIds):
// la ficha enseña todo lo apuntado de la cuenta en un solo sitio, cada nota con el chip de
// su origen («La cuenta» o el proyecto) para poder filtrar.

const fmt = (d: Date): string => {
  try {
    return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return "";
  }
};

export async function notesFor(
  session: SessionUser,
  scope: { projectId?: string; clientId?: string; projectIds?: string[] },
): Promise<TabNote[]> {
  const where = scope.projectId
    ? { projectId: scope.projectId }
    : scope.clientId
      ? scope.projectIds?.length
        ? { OR: [{ clientId: scope.clientId }, { projectId: { in: scope.projectIds } }] }
        : { clientId: scope.clientId }
      : null;
  if (!where) return [];
  // ¿Hay que decir de dónde viene cada nota? Solo cuando la lista mezcla orígenes.
  const conOrigen = !scope.projectId && !!scope.projectIds?.length;

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
    select: {
      id: true, title: true, content: true, category: true, remindAt: true, updatedAt: true, createdById: true,
      createdBy: { select: { name: true } },
      project: { select: { name: true, emoji: true } },
    },
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
      origen: conOrigen
        ? n.project
          ? `${emojiToText(n.project.emoji, "🎬")} ${n.project.name}`
          : "La cuenta"
        : null,
    };
  });
}
