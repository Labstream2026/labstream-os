import { db } from "@/lib/db";
import { toggleNoteTaskByText } from "@/lib/note-tasks";

// Deja las casillas de unas notas AL DÍA con sus tareas: si la tarea nacida de una línea se
// completó (o se reabrió) en el tablero, la casilla de la nota lo refleja.
//
// Se llama al ABRIR /notas. Es la forma honesta de cumplir «si completas la tarea, la casilla
// se marca sola» sin enganchar un gancho en cada uno de los sitios donde se completa una
// tarea (Mis tareas, tablero, entregables, Marcebot, API…), que es justo el tipo de red que
// se rompe cuando alguien añade el siguiente sitio.
//
// Solo escribe si algo cambió de verdad, y lo hace con SQL directo para NO tocar `updatedAt`:
// esto no es una edición del usuario y no debe reordenar su lista de notas.
export async function syncNoteChecks(userId: string): Promise<void> {
  const links = await db.task.findMany({
    where: { noteLine: { not: null }, note: { createdById: userId, archivedAt: null } },
    select: { noteId: true, noteLine: true, completedAt: true },
    take: 500,
  });
  if (!links.length) return;

  const byNote = new Map<string, { key: string; done: boolean }[]>();
  for (const l of links) {
    if (!l.noteId || !l.noteLine) continue;
    const arr = byNote.get(l.noteId) ?? [];
    arr.push({ key: l.noteLine, done: !!l.completedAt });
    byNote.set(l.noteId, arr);
  }

  const notes = await db.note.findMany({ where: { id: { in: [...byNote.keys()] } }, select: { id: true, content: true } });
  for (const n of notes) {
    let next = n.content;
    for (const l of byNote.get(n.id) ?? []) next = toggleNoteTaskByText(next, l.key, l.done);
    if (next !== n.content) await db.$executeRaw`UPDATE "Note" SET "content" = ${next} WHERE "id" = ${n.id}`;
  }
}
