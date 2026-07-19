"use server";

import { Prisma } from "@prisma/client";
import { getSession, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessibleProjectWhere } from "@/lib/project-access";
import { accessibleClientWhere } from "@/lib/client-access";

// ── Búsqueda global de CONTENIDO (⌘K) ──
// Amplía el buscador más allá de páginas/clientes/proyectos: encuentra tareas, entregables,
// cotizaciones, facturas, propuestas, archivos y notas. CLAVE DE SEGURIDAD: cada consulta se
// ACOTA con los MISMOS helpers de acceso que usan las páginas (accessibleProjectWhere /
// accessibleClientWhere) y con los permisos correspondientes, para no filtrar contenido entre
// proyectos/clientes. Nunca devuelve algo que el usuario no podría ver en su propia sección.

export type SearchHit = {
  id: string;
  label: string;
  sub: string;
  href: string;
  group: string; // encabezado en el palette
  kind: string; // para elegir el ícono en el cliente
};

const MODE = "insensitive" as const;

export async function globalSearch(query: string): Promise<SearchHit[]> {
  const session = await getSession();
  if (!session) return [];
  const q = query.trim();
  if (q.length < 2) return []; // 1 carácter dispararía consultas caras sin utilidad

  const like = { contains: q, mode: MODE };
  const TAKE = 6;

  const projWhere = accessibleProjectWhere(session);
  const clientWhere = accessibleClientWhere(session);
  const canQuote = hasPermission(session, "ver_cotizaciones");
  const canFin = hasPermission(session, "ver_finanzas");
  const canFiles = hasPermission(session, "ver_archivos");
  const canNotes = hasPermission(session, "ver_notas");
  // Canales de chat visibles: mismo criterio de acceso que la lista de chats (miembro, o canal de
  // proyecto/cliente que puedo ver). El cliente solo alcanza los de SUS proyectos.
  const channelAccess: Prisma.ChatChannelWhereInput[] =
    session.role === "cliente"
      ? [{ type: "PROJECT", project: { members: { some: { userId: session.id } } } }]
      : session.role === "admin"
        ? [{ type: { in: ["PROJECT", "CLIENT"] } }, { members: { some: { userId: session.id } } }]
        : [
            { members: { some: { userId: session.id } } },
            { type: { in: ["PROJECT", "CLIENT"] }, isPublic: true },
            { type: "PROJECT", project: { leadId: session.id } },
            { type: "PROJECT", project: { members: { some: { userId: session.id } } } },
          ];

  const [tasks, delivs, quotes, invoices, proposals, files, notes, channels] = await Promise.all([
    // Tareas: en un proyecto que puedo ver, o asignadas a/por mí (tareas personales sin proyecto).
    db.task.findMany({
      where: { title: like, OR: [{ project: projWhere }, { assigneeId: session.id }, { assignedById: session.id }] },
      select: { id: true, title: true, projectId: true, project: { select: { name: true } } },
      take: TAKE,
    }),
    // Entregables: solo de proyectos que puedo ver (no archivados).
    db.deliverable.findMany({
      where: { name: like, archivedAt: null, project: projWhere },
      select: { id: true, name: true, projectId: true, project: { select: { name: true } } },
      take: TAKE,
    }),
    canQuote
      ? db.quote.findMany({
          where: { AND: [{ OR: [{ code: like }, { title: like }] }, { client: clientWhere }] },
          select: { id: true, code: true, title: true, client: { select: { name: true } } },
          take: TAKE,
        })
      : Promise.resolve([]),
    canFin
      ? db.invoice.findMany({
          where: { code: like, client: clientWhere },
          select: { id: true, code: true, client: { select: { name: true } } },
          take: TAKE,
        })
      : Promise.resolve([]),
    canQuote
      ? db.proposal.findMany({
          where: { AND: [{ OR: [{ code: like }, { title: like }] }, { OR: [{ client: clientWhere }, { createdById: session.id }] }] },
          select: { id: true, code: true, title: true },
          take: TAKE,
        })
      : Promise.resolve([]),
    canFiles
      ? db.fileAsset.findMany({
          where: { name: like, project: projWhere },
          select: { id: true, name: true, projectId: true },
          take: TAKE,
        })
      : Promise.resolve([]),
    canNotes
      ? db.note.findMany({
          where: { title: like, createdById: session.id },
          select: { id: true, title: true },
          take: TAKE,
        })
      : Promise.resolve([]),
    // Canales de chat por NOMBRE (proyectos, clientes, grupos); el acceso se acota arriba.
    db.chatChannel.findMany({
      where: { name: like, OR: channelAccess },
      select: { id: true, name: true, type: true, client: { select: { name: true } }, project: { select: { name: true, client: { select: { name: true } } } } },
      take: TAKE,
    }),
  ]);

  const hits: SearchHit[] = [];
  for (const t of tasks) hits.push({ id: `t-${t.id}`, label: t.title, sub: t.project?.name ?? "Tarea personal", href: t.projectId ? `/proyectos/${t.projectId}?tab=tareas` : "/mis-tareas", group: "Tareas", kind: "task" });
  for (const d of delivs) hits.push({ id: `d-${d.id}`, label: d.name, sub: d.project?.name ?? "Entregable", href: `/proyectos/${d.projectId}?tab=entregables`, group: "Entregables", kind: "deliverable" });
  for (const c of quotes) hits.push({ id: `q-${c.id}`, label: c.title || c.code, sub: `${c.code} · ${c.client?.name ?? ""}`.trim(), href: `/cotizaciones/${c.id}`, group: "Cotizaciones", kind: "quote" });
  for (const i of invoices) hits.push({ id: `i-${i.id}`, label: i.code, sub: i.client?.name ?? "Factura", href: `/facturacion/${i.id}`, group: "Facturas", kind: "invoice" });
  for (const p of proposals) hits.push({ id: `pp-${p.id}`, label: p.title || p.code, sub: p.code, href: `/cotizaciones/propuestas/${p.id}`, group: "Propuestas", kind: "proposal" });
  for (const f of files) hits.push({ id: `f-${f.id}`, label: f.name, sub: "Archivo", href: `/proyectos/${f.projectId}?tab=archivos`, group: "Archivos", kind: "file" });
  for (const n of notes) hits.push({ id: `n-${n.id}`, label: n.title, sub: "Nota", href: "/notas", group: "Notas", kind: "note" });
  for (const c of channels) {
    const client = c.client?.name ?? c.project?.client?.name ?? null;
    const sub = c.type === "PROJECT" ? c.project?.name ?? client ?? "Proyecto" : c.type === "CLIENT" ? client ?? "Cliente" : "Canal";
    hits.push({ id: `ch-${c.id}`, label: c.name, sub, href: `/chat/${c.id}`, group: "Chats", kind: "chat" });
  }

  return hits;
}
