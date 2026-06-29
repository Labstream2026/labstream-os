import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessibleProjectWhere } from "@/lib/project-access";
import { accessibleClientWhere } from "@/lib/client-access";
import { NotesApp, type NoteItem, type NoteProject, type NoteClient } from "./notes-app";

export const dynamic = "force-dynamic";

export default async function NotasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [notes, projects, clients] = await Promise.all([
    db.note.findMany({
      // Mis notas + las compartidas conmigo: visibilidad "team" (todo el equipo) o "project"
      // (miembros de un proyecto accesible). Las ajenas se verán en SOLO LECTURA.
      where: {
        OR: [
          { createdById: session.id },
          { visibility: "team", createdById: { not: session.id } },
          { visibility: "project", createdById: { not: session.id }, project: accessibleProjectWhere(session) },
        ],
      },
      // Fijadas arriba; luego por última edición (las que tocas suben, estilo iCloud).
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      take: 500,
      select: { id: true, title: true, content: true, category: true, source: true, pinned: true, projectId: true, clientId: true, color: true, remindAt: true, visibility: true, createdById: true, createdBy: { select: { name: true } }, createdAt: true, updatedAt: true },
    }),
    // Proyectos accesibles para poder VINCULAR una nota a un proyecto.
    db.project.findMany({
      where: { AND: [accessibleProjectWhere(session), { archivedAt: null }] },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, name: true, emoji: true },
    }),
    // Clientes accesibles para etiquetar/agrupar las notas por cliente.
    db.client.findMany({
      where: { AND: [accessibleClientWhere(session), { archivedAt: null }] },
      orderBy: { name: "asc" },
      take: 300,
      select: { id: true, name: true, emoji: true, accentColor: true },
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
    clientId: n.clientId,
    color: n.color,
    remindAt: n.remindAt ? n.remindAt.toISOString() : null,
    visibility: n.visibility,
    mine: n.createdById === session.id,
    ownerName: n.createdById === session.id ? null : (n.createdBy?.name ?? null),
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }));
  const projectList: NoteProject[] = projects.map((p) => ({ id: p.id, name: p.name, emoji: p.emoji }));
  const clientList: NoteClient[] = clients.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, accentColor: c.accentColor }));

  // Sin contenedor con ancho máximo ni padding: la vista de Notas llena toda la ventana.
  return <NotesApp initial={items} projects={projectList} clients={clientList} />;
}
