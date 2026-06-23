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
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, title: true, content: true, category: true, source: true, createdAt: true },
  });

  const items: NoteItem[] = notes.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    category: n.category,
    source: n.source,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <NotesApp initial={items} />
    </div>
  );
}
