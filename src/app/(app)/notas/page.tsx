import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessibleProjectWhere } from "@/lib/project-access";
import { accessibleClientWhere } from "@/lib/client-access";
import { NotesApp, type NoteItem, type NoteProject, type NoteClient, type TrashedNote } from "./notes-app";

export const dynamic = "force-dynamic";

// «hoy» / «hace N días» desde que la nota se mandó a la papelera. Vive FUERA del componente:
// el "ahora" por-request es legítimo en esta página dinámica, y así el cliente no lee el reloj.
function agoLabel(d: Date | null): string {
  if (!d) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  return days <= 0 ? "hoy" : days === 1 ? "hace 1 día" : `hace ${days} días`;
}

export default async function NotasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [notes, trashed, projects, clients] = await Promise.all([
    db.note.findMany({
      // Mis notas + las compartidas conmigo: visibilidad "team" (todo el equipo) o "project"
      // (miembros de un proyecto accesible). Las ajenas se verán en SOLO LECTURA.
      // Las de la papelera (archivedAt) NO salen aquí: tienen su propia sección.
      where: {
        archivedAt: null,
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
    // Papelera: MIS notas archivadas (las de otros no se ven ni para restaurar).
    db.note.findMany({
      where: { createdById: session.id, archivedAt: { not: null } },
      orderBy: { archivedAt: "desc" },
      take: 200,
      select: { id: true, title: true, content: true, category: true, clientId: true, color: true, archivedAt: true, updatedAt: true },
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
  const trashList: TrashedNote[] = trashed.map((n) => ({
    id: n.id,
    title: n.title,
    snippet: n.content.trim().replace(/\s+/g, " ").slice(0, 120),
    category: n.category,
    clientId: n.clientId,
    color: n.color,
    archivedAt: n.archivedAt ? n.archivedAt.toISOString() : null,
    archivedAgo: agoLabel(n.archivedAt),
    updatedAt: n.updatedAt.toISOString(),
  }));

  // Sin contenedor con ancho máximo ni padding: la vista de Notas llena toda la ventana.
  return <NotesApp initial={items} trashed={trashList} projects={projectList} clients={clientList} />;
}
