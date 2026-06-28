import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessibleProjectWhere } from "@/lib/project-access";
import { NotesApp, type NoteItem, type NoteProject } from "./notes-app";

export const dynamic = "force-dynamic";

export default async function NotasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [notes, projects] = await Promise.all([
    db.note.findMany({
      where: { createdById: session.id },
      // Fijadas arriba; luego por última edición (las que tocas suben, estilo iCloud).
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      take: 500,
      select: { id: true, title: true, content: true, category: true, source: true, pinned: true, projectId: true, createdAt: true, updatedAt: true },
    }),
    // Proyectos accesibles para poder VINCULAR una nota a un proyecto.
    db.project.findMany({
      where: { AND: [accessibleProjectWhere(session), { archivedAt: null }] },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, name: true, emoji: true },
    }),
  ]);

  const items: NoteItem[] = notes.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    category: n.category,
    source: n.source,
    pinned: n.pinned,
    projectId: n.projectId,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }));
  const projectList: NoteProject[] = projects.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji }));

  // Sin contenedor con ancho máximo ni padding: la vista de Notas llena toda la ventana.
  return <NotesApp initial={items} projects={projectList} />;
}
