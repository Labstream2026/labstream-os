import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canWriteProject } from "@/lib/project-access";
import { saveBuffer, readBuffer, mimeFor, extOf } from "@/lib/storage";
import { logActivity } from "@/lib/activity";
import { blankOffice, withDocExt, NEW_DOC_EXT, type NewDocKind } from "@/lib/office-blank";

// ── Crear un documento nuevo ──
// Un solo camino para todas las puertas: Archivos del proyecto, la pestaña Guiones, ⌘K, la
// ficha del cliente y el chat. Devuelve el id del archivo para abrirlo en el editor de una vez
// (crear un documento y NO poder escribir en él sería crear trabajo, no ahorrarlo).
//
// De una PLANTILLA se COPIA el archivo: el documento nuevo es independiente desde el primer
// segundo y editarlo nunca toca la plantilla de la empresa.

export const KIND_BY_EXT: Record<string, NewDocKind> = { docx: "word", xlsx: "cell", pptx: "slide" };

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
  archivedAt: true,
  finishedAt: true,
} as const;

export type CreateDocInput = {
  projectId: string;
  name: string;
  kind: NewDocKind;
  folderId?: string | null;
  templateId?: string | null;
};

export async function createProjectDoc(
  input: CreateDocInput,
): Promise<{ ok: boolean; error?: string; id?: string; name?: string }> {
  const session = await getSession();
  if (!session || session.role === "demo") return { ok: false, error: "No autorizado" };

  const project = await db.project.findUnique({ where: { id: input.projectId }, select: { ...accessSelect, name: true } });
  if (!project) return { ok: false, error: "El proyecto no existe" };
  if (project.archivedAt || project.finishedAt) {
    return { ok: false, error: "El proyecto está terminado o en la papelera: primero hay que reabrirlo." };
  }
  // Escribe el equipo; y el cliente de su propio proyecto si tiene permiso para subir archivos
  // (crear un documento es lo mismo que subirlo, pero sin salir de la app).
  const esClienteDelProyecto = session.role === "cliente" && project.members.some((m) => m.userId === session.id);
  const puede = canWriteProject(project, session) || (esClienteDelProyecto && hasPermission(session, "subir_archivos"));
  if (!puede) return { ok: false, error: "Sin permiso para crear documentos en este proyecto" };

  // De dónde sale el contenido: una plantilla de la empresa o un documento en blanco.
  let kind = input.kind;
  let buf: Buffer;
  let plantilla: { id: string; name: string } | null = null;
  if (input.templateId) {
    const t = await db.docTemplate.findUnique({
      where: { id: input.templateId },
      select: { id: true, name: true, ext: true, path: true, archivedAt: true },
    });
    if (!t || t.archivedAt) return { ok: false, error: "Esa plantilla ya no está disponible" };
    try {
      buf = await readBuffer(t.path);
    } catch {
      return { ok: false, error: `No se encontró el archivo de la plantilla «${t.name}».` };
    }
    kind = KIND_BY_EXT[t.ext] ?? input.kind; // la plantilla manda sobre el tipo elegido
    plantilla = { id: t.id, name: t.name };
  } else {
    buf = blankOffice(kind);
  }

  const name = withDocExt(input.name, kind);
  // La carpeta tiene que ser de ESTE proyecto (si no, el documento acabaría en otro).
  let folderId: string | null = null;
  if (input.folderId) {
    const f = await db.projectFolder.findUnique({ where: { id: input.folderId }, select: { projectId: true } });
    folderId = f && f.projectId === input.projectId ? input.folderId : null;
  }

  const asset = await db.fileAsset.create({
    data: {
      projectId: input.projectId,
      name,
      kind: "LOCAL",
      path: "",
      mime: mimeFor(name),
      size: buf.length,
      folderId,
      uploadedById: session.id,
    },
    select: { id: true },
  });
  const rel = await saveBuffer(`project/${input.projectId}`, `${asset.id}-${name}`, buf);
  await db.fileAsset.update({ where: { id: asset.id }, data: { path: rel } });
  if (plantilla) {
    await db.docTemplate.update({ where: { id: plantilla.id }, data: { usedCount: { increment: 1 } } }).catch(() => null);
  }

  await logActivity({
    action: "file.upload",
    summary: plantilla ? `creó «${name}» a partir de la plantilla «${plantilla.name}»` : `creó el documento «${name}»`,
    projectId: input.projectId,
    entityType: "file",
    entityId: asset.id,
  }).catch(() => null);

  return { ok: true, id: asset.id, name };
}

// Guarda un documento del proyecto como PLANTILLA de la empresa (copia, no mueve: el documento
// original se queda donde estaba).
export async function saveAsDocTemplate(
  fileId: string,
  nombre: string,
  descripcion: string | null,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const session = await getSession();
  if (!session || session.role === "demo" || session.role === "cliente") return { ok: false, error: "No autorizado" };
  if (!hasPermission(session, "subir_archivos")) return { ok: false, error: "Sin permiso" };

  const file = await db.fileAsset.findUnique({
    where: { id: fileId },
    select: { name: true, path: true, project: { select: accessSelect } },
  });
  if (!file?.path) return { ok: false, error: "Ese archivo no está guardado en la app" };
  if (!file.project || !canWriteProject(file.project, session)) return { ok: false, error: "Sin acceso a ese proyecto" };
  const ext = extOf(file.name);
  if (!Object.keys(KIND_BY_EXT).includes(ext)) {
    return { ok: false, error: "Solo se pueden guardar como plantilla los .docx, .xlsx y .pptx." };
  }

  let buf: Buffer;
  try {
    buf = await readBuffer(file.path);
  } catch {
    return { ok: false, error: "No se pudo leer el archivo" };
  }
  const limpio = nombre.trim() || file.name.replace(/\.[^.]+$/, "");
  const rel = await saveBuffer("doc-templates", `${Date.now()}-${limpio}.${ext}`, buf);
  const t = await db.docTemplate.create({
    data: {
      name: limpio,
      description: descripcion?.trim() || null,
      ext,
      path: rel,
      size: buf.length,
      createdById: session.id,
    },
    select: { id: true },
  });
  await logActivity({
    action: "template.create",
    summary: `guardó «${limpio}» como plantilla de documento`,
    entityType: "doc-template",
    entityId: t.id,
  }).catch(() => null);
  return { ok: true, id: t.id };
}

// Plantillas disponibles para el desplegable de «Nuevo documento».
export async function activeDocTemplates(): Promise<{ id: string; name: string; ext: string; kind: NewDocKind }[]> {
  const rows = await db.docTemplate.findMany({
    where: { archivedAt: null },
    orderBy: [{ usedCount: "desc" }, { name: "asc" }],
    select: { id: true, name: true, ext: true },
  });
  return rows.map((r) => ({ ...r, kind: KIND_BY_EXT[r.ext] ?? "word" }));
}

export { NEW_DOC_EXT };
export type { NewDocKind };
