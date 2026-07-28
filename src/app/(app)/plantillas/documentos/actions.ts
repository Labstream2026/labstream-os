"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { saveBuffer, extOf, deleteRel } from "@/lib/storage";
import { logActivity } from "@/lib/activity";
import { blankOffice, NEW_DOC_EXT, type NewDocKind } from "@/lib/office-blank";
import { KIND_BY_EXT } from "@/lib/doc-create";

// Gestión de las plantillas de documento de la empresa. Las mantiene el equipo con permiso
// para subir archivos; el cliente ni las ve.

const PERMITIDAS = Object.keys(KIND_BY_EXT); // docx, xlsx, pptx

async function equipo() {
  const session = await getSession();
  if (!session || session.role === "cliente" || session.role === "demo") return null;
  if (!hasPermission(session, "subir_archivos")) return null;
  return session;
}

function refrescar() {
  revalidatePath("/plantillas/documentos");
}

export async function uploadDocTemplate(formData: FormData): Promise<{ ok: boolean; error?: string; id?: string }> {
  const session = await equipo();
  if (!session) return { ok: false, error: "No autorizado" };

  const file = formData.get("file");
  const nombre = String(formData.get("name") ?? "").trim();
  const descripcion = String(formData.get("description") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elige un archivo." };
  const ext = extOf(file.name);
  if (!PERMITIDAS.includes(ext)) return { ok: false, error: "Solo .docx, .xlsx y .pptx." };
  if (file.size > 25 * 1024 * 1024) return { ok: false, error: "La plantilla no puede pasar de 25 MB." };

  const buf = Buffer.from(await file.arrayBuffer());
  const limpio = nombre || file.name.replace(/\.[^.]+$/, "");
  const rel = await saveBuffer("doc-templates", `${Date.now()}-${limpio}.${ext}`, buf);
  const t = await db.docTemplate.create({
    data: { name: limpio, description: descripcion || null, ext, path: rel, size: buf.length, createdById: session.id },
    select: { id: true },
  });
  await logActivity({ action: "template.create", summary: `subió la plantilla de documento «${limpio}»`, entityType: "doc-template", entityId: t.id }).catch(() => null);
  refrescar();
  return { ok: true, id: t.id };
}

// Crea una plantilla EN BLANCO para escribirla dentro de la app (sin subir nada).
export async function createBlankDocTemplate(formData: FormData): Promise<{ ok: boolean; error?: string; id?: string }> {
  const session = await equipo();
  if (!session) return { ok: false, error: "No autorizado" };

  const nombre = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "word") as NewDocKind;
  if (!nombre) return { ok: false, error: "Ponle un nombre a la plantilla." };
  if (!["word", "cell", "slide"].includes(kind)) return { ok: false, error: "Tipo desconocido." };

  const ext = NEW_DOC_EXT[kind];
  const buf = blankOffice(kind);
  const rel = await saveBuffer("doc-templates", `${Date.now()}-${nombre}.${ext}`, buf);
  const t = await db.docTemplate.create({
    data: {
      name: nombre,
      description: String(formData.get("description") ?? "").trim() || null,
      ext,
      path: rel,
      size: buf.length,
      createdById: session.id,
    },
    select: { id: true },
  });
  refrescar();
  return { ok: true, id: t.id };
}

export async function renameDocTemplate(id: string, name: string, description: string): Promise<{ ok: boolean; error?: string }> {
  const session = await equipo();
  if (!session) return { ok: false, error: "No autorizado" };
  const limpio = name.trim();
  if (!limpio) return { ok: false, error: "El nombre no puede quedar vacío." };
  await db.docTemplate.update({ where: { id }, data: { name: limpio, description: description.trim() || null } });
  refrescar();
  return { ok: true };
}

// Archivar, no borrar: deja de ofrecerse al crear documentos, pero el archivo sigue ahí.
export async function setDocTemplateArchived(id: string, archived: boolean): Promise<{ ok: boolean; error?: string }> {
  const session = await equipo();
  if (!session) return { ok: false, error: "No autorizado" };
  await db.docTemplate.update({ where: { id }, data: { archivedAt: archived ? new Date() : null } });
  refrescar();
  return { ok: true };
}

// Borrado de verdad (solo admin) para las que se subieron por error.
export async function deleteDocTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (session?.role !== "admin") return { ok: false, error: "Solo un administrador puede borrar una plantilla." };
  const t = await db.docTemplate.findUnique({ where: { id }, select: { name: true, path: true } });
  if (!t) return { ok: true };
  await db.docTemplate.delete({ where: { id } });
  await deleteRel(t.path).catch(() => null);
  await logActivity({ action: "template.delete", summary: `borró la plantilla de documento «${t.name}»`, entityType: "doc-template", entityId: id }).catch(() => null);
  refrescar();
  return { ok: true };
}
