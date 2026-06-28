import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { NotesApp, type NoteItem } from "./notes-app";

export const dynamic = "force-dynamic";

export default async function NotasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const notes = await db.note.findMany({
    where: { createdById: session.id },
    // Fijadas arriba; luego por última edición (las que tocas suben, estilo iCloud).
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    take: 500,
    select: { id: true, title: true, content: true, category: true, source: true, pinned: true, createdAt: true, updatedAt: true },
  });

  const items: NoteItem[] = notes.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    category: n.category,
    source: n.source,
    pinned: n.pinned,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }));

  // Sin contenedor con ancho máximo ni padding: la vista de Notas llena toda la ventana.
  return <NotesApp initial={items} />;
}
