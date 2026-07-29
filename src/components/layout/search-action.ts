"use server";

import { Prisma } from "@prisma/client";
import { getSession, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { accessibleProjectWhere } from "@/lib/project-access";
import { accessibleClientWhere } from "@/lib/client-access";
import { categoriaLabel } from "@/lib/archivos/tipos";

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
  finished?: boolean; // el recurso vive en un proyecto TERMINADO: chip «Terminado» en el palette
};

const MODE = "insensitive" as const;

// Trozo del texto alrededor de lo buscado («…con la batería del DRON, ojo…»), para reconocer
// la nota sin abrirla. Si no aparece en el cuerpo, devuelve el principio.
function excerpt(content: string, q: string): string {
  const flat = content.trim().replace(/\s+/g, " ");
  if (!flat) return "";
  const at = flat.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return flat.slice(0, 70) + (flat.length > 70 ? "…" : "");
  const from = Math.max(0, at - 25);
  const slice = flat.slice(from, from + 70);
  return `${from > 0 ? "…" : ""}${slice}${from + 70 < flat.length ? "…" : ""}`;
}

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
  const canBiblio = hasPermission(session, "ver_biblioteca");
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

  const [tasks, delivs, quotes, invoices, proposals, files, clientFiles, notes, channels, libAssets, disks] = await Promise.all([
    // Tareas: en un proyecto que puedo ver, o asignadas a/por mí (tareas personales sin proyecto).
    db.task.findMany({
      where: {
        title: like,
        AND: [
          { OR: [{ project: projWhere }, { assigneeId: session.id }, { assignedById: session.id }] },
          // La rama "asignadas a mí" salta projWhere → sin esto, colaba tareas de proyectos en
          // la PAPELERA. (Las de terminados sí salen: el archivo es consultable por búsqueda.)
          { OR: [{ projectId: null }, { project: { archivedAt: null } }] },
        ],
      },
      select: { id: true, title: true, projectId: true, project: { select: { name: true, finishedAt: true } } },
      take: TAKE,
    }),
    // Entregables: solo de proyectos que puedo ver (no archivados).
    db.deliverable.findMany({
      where: { name: like, archivedAt: null, project: projWhere },
      select: { id: true, name: true, projectId: true, project: { select: { name: true, finishedAt: true } } },
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
          where: { name: like, deletedAt: null, project: projWhere },
          select: { id: true, name: true, projectId: true, folder: { select: { name: true } }, project: { select: { name: true, finishedAt: true } } },
          take: TAKE,
        })
      : Promise.resolve([]),
    // Material de MARCA del cliente (ClientFile): no vive en ningún proyecto, así que sin esto
    // el «brand kit» de una cuenta era invisible para ⌘K.
    canFiles
      ? db.clientFile.findMany({
          where: { name: like, client: clientWhere },
          select: { id: true, name: true, kind: true, category: true, clientId: true, client: { select: { name: true } } },
          take: TAKE,
        })
      : Promise.resolve([]),
    canNotes
      ? // Notas: se busca DENTRO del texto, no solo en el título — que es como uno recuerda
        // una nota («el del dron»). Incluye las compartidas conmigo (equipo, o proyecto que
        // puedo ver), con el mismo criterio que la página /notas.
        db.note.findMany({
          where: {
            AND: [
              { OR: [{ title: like }, { content: like }] },
              { archivedAt: null },
              {
                OR: [
                  { createdById: session.id },
                  { visibility: "team", createdById: { not: session.id } },
                  { visibility: "project", createdById: { not: session.id }, project: projWhere },
                ],
              },
            ],
          },
          select: { id: true, title: true, content: true, createdById: true, createdBy: { select: { name: true } }, client: { select: { name: true } } },
          take: TAKE,
        })
      : Promise.resolve([]),
    // Canales de chat por NOMBRE (proyectos, clientes, grupos); el acceso se acota arriba.
    db.chatChannel.findMany({
      // Sin canales de proyectos en la PAPELERA (el proyecto está "borrado"; su chat no aparece).
      where: { name: like, OR: channelAccess, AND: [{ OR: [{ project: { is: null } }, { project: { archivedAt: null } }] }] },
      select: { id: true, name: true, type: true, client: { select: { name: true } }, project: { select: { name: true, finishedAt: true, client: { select: { name: true } } } } },
      take: TAKE,
    }),
    // Biblioteca: recursos por nombre/categoría/URL-ruta (encuentra «\\NAS\proyectos\danney»).
    canBiblio
      ? db.libraryAsset.findMany({
          where: { OR: [{ name: like }, { category: like }, { url: like }] },
          select: { id: true, name: true, category: true, kind: true, project: { select: { name: true } } },
          take: TAKE,
        })
      : Promise.resolve([]),
    // Discos del estudio por nombre o ubicación («cajón 2» encuentra el LaCie).
    canBiblio
      ? db.storageDisk.findMany({
          where: { OR: [{ name: like }, { location: like }] },
          select: { id: true, name: true, kind: true, location: true },
          take: TAKE,
        })
      : Promise.resolve([]),
  ]);

  const hits: SearchHit[] = [];
  for (const t of tasks) hits.push({ id: `t-${t.id}`, label: t.title, sub: t.project?.name ?? "Tarea personal", href: t.projectId ? `/proyectos/${t.projectId}?tab=tareas` : "/mis-tareas", group: "Tareas", kind: "task", finished: !!t.project?.finishedAt });
  for (const d of delivs) hits.push({ id: `d-${d.id}`, label: d.name, sub: d.project?.name ?? "Entregable", href: `/proyectos/${d.projectId}?tab=entregables`, group: "Entregables", kind: "deliverable", finished: !!d.project?.finishedAt });
  for (const c of quotes) hits.push({ id: `q-${c.id}`, label: c.title || c.code, sub: `${c.code} · ${c.client?.name ?? ""}`.trim(), href: `/cotizaciones/${c.id}`, group: "Cotizaciones", kind: "quote" });
  for (const i of invoices) hits.push({ id: `i-${i.id}`, label: i.code, sub: i.client?.name ?? "Factura", href: `/facturacion/${i.id}`, group: "Facturas", kind: "invoice" });
  for (const p of proposals) hits.push({ id: `pp-${p.id}`, label: p.title || p.code, sub: p.code, href: `/cotizaciones/propuestas/${p.id}`, group: "Propuestas", kind: "proposal" });
  // El `sub` dice DÓNDE está («Spot 30s · 02 Material»), no la palabra «Archivo», que no
  // ayudaba a elegir entre tres resultados con el mismo nombre.
  for (const f of files) hits.push({ id: `f-${f.id}`, label: f.name, sub: [f.project?.name, f.folder?.name].filter(Boolean).join(" · ") || "Archivo", href: `/proyectos/${f.projectId}?tab=archivos`, group: "Archivos", kind: "file", finished: !!f.project?.finishedAt });
  for (const cf of clientFiles)
    hits.push({
      id: `cf-${cf.id}`,
      label: cf.name,
      sub: [cf.client?.name, categoriaLabel(cf.category) ?? (cf.kind === "NAS" ? "Ruta del NAS" : "Material de marca")].filter(Boolean).join(" · "),
      href: `/clientes/${cf.clientId}#archivos`,
      group: "Archivos",
      kind: "file",
    });
  // El resultado lleva DIRECTO a la nota y muestra el trozo de texto donde apareció lo buscado.
  for (const n of notes) {
    const owner = n.createdById === session.id ? null : n.createdBy?.name ?? null;
    hits.push({
      id: `n-${n.id}`,
      label: n.title,
      sub: [owner ? `de ${owner}` : null, n.client?.name, excerpt(n.content, q)].filter(Boolean).join(" · ") || "Nota",
      href: `/notas?nota=${n.id}`,
      group: "Notas",
      kind: "note",
    });
  }
  for (const a of libAssets) hits.push({ id: `lib-${a.id}`, label: a.name, sub: [a.category, a.kind === "NAS" ? "Ruta del NAS" : null, a.project?.name].filter(Boolean).join(" · ") || "Biblioteca", href: `/biblioteca?q=${encodeURIComponent(a.name)}`, group: "Biblioteca", kind: "library" });
  for (const d of disks) hits.push({ id: `dk-${d.id}`, label: d.name, sub: d.location ? `Disco · ${d.location}` : "Disco", href: "/biblioteca?tab=discos", group: "Biblioteca", kind: "disk" });
  for (const c of channels) {
    const client = c.client?.name ?? c.project?.client?.name ?? null;
    const sub = c.type === "PROJECT" ? c.project?.name ?? client ?? "Proyecto" : c.type === "CLIENT" ? client ?? "Cliente" : "Canal";
    hits.push({ id: `ch-${c.id}`, label: c.name, sub, href: `/chat/${c.id}`, group: "Chats", kind: "chat", finished: c.type === "PROJECT" && !!c.project?.finishedAt });
  }

  return hits;
}
