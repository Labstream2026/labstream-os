"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canSeeWiki } from "@/lib/wiki-access";
import { wikiTemplate } from "@/lib/wiki-templates";
import { saveBuffer, extOf, deleteRel } from "@/lib/storage";
import { saveBufferWithPreview, previewRel } from "@/lib/image";
import { extractWikiAttachments } from "@/lib/markdown";

// La wiki es del equipo interno: solo quien tiene acceso a la Wiki puede crear/
// editar/borrar páginas. Roles externos (freelancer/cliente) e invitados quedan fuera.
async function requireWiki() {
  const session = await getSession();
  if (!session || !(await canSeeWiki(session))) throw new Error("No autorizado");
  return session;
}

// Convierte "4k, kit rodaje , portátil" → ["4k","kit rodaje","portátil"] (sin vacíos ni duplicados).
function parseTags(raw: string): string[] {
  return [...new Set(raw.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 20);
}

// Crea una página, opcionalmente desde una plantilla (pre-rellena contenido, icono,
// sección y etiquetas). El dueño por defecto es quien la crea.
export async function createWikiPage(formData: FormData): Promise<void> {
  const session = await requireWiki();
  const title = String(formData.get("title") ?? "").trim();
  const tpl = wikiTemplate(String(formData.get("templateKey") ?? "") || undefined);
  const page = await db.wikiPage.create({
    data: {
      title: title || (tpl && tpl.key !== "blank" ? tpl.name : "Página sin título"),
      icon: tpl?.icon ?? null,
      content: tpl?.content ?? "",
      section: tpl?.section ?? null,
      tags: tpl?.tags ?? [],
      templateKey: tpl?.key ?? null,
      ownerId: session.id,
    },
  });
  revalidatePath("/wiki");
  redirect(`/wiki/${page.id}`);
}

export async function updateWikiPage(id: string, formData: FormData): Promise<void> {
  await requireWiki();
  const title = String(formData.get("title") ?? "").trim() || "Página sin título";
  const icon = String(formData.get("icon") ?? "").trim() || null;
  const content = String(formData.get("content") ?? "");
  const section = String(formData.get("section") ?? "").trim() || null;
  const tags = parseTags(String(formData.get("tags") ?? ""));
  await db.wikiPage.update({ where: { id }, data: { title, icon, content, section, tags } });
  revalidatePath("/wiki");
  redirect(`/wiki/${id}`); // tras guardar, volver al modo lectura
}

// Asigna (o quita) el dueño responsable de una página.
export async function setWikiOwner(id: string, formData: FormData): Promise<void> {
  await requireWiki();
  const ownerId = String(formData.get("ownerId") ?? "").trim() || null;
  if (ownerId) {
    const u = await db.user.findUnique({ where: { id: ownerId }, select: { active: true } });
    if (!u?.active) throw new Error("Usuario inválido");
  }
  await db.wikiPage.update({ where: { id }, data: { ownerId } });
  revalidatePath(`/wiki/${id}`);
  revalidatePath("/wiki");
}

// Marca la página como revisada hoy (gobernanza: contra contenido obsoleto).
export async function markWikiReviewed(id: string): Promise<void> {
  const session = await requireWiki();
  await db.wikiPage.update({ where: { id }, data: { lastReviewedAt: new Date(), lastReviewedById: session.id } });
  revalidatePath(`/wiki/${id}`);
  revalidatePath("/wiki");
}

// Sube un archivo o imagen para insertarlo en una página de la Wiki. Las imágenes se
// optimizan (WebP). Devuelve la URL servida por /api/wiki-file y si es imagen.
export async function uploadWikiFile(formData: FormData): Promise<{ url: string; name: string; isImage: boolean }> {
  await requireWiki();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("No se recibió ningún archivo.");
  if (file.size > 25 * 1024 * 1024) throw new Error("El archivo supera 25 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = extOf(file.name); // "pdf", "png"… (sin punto, o "")
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}${ext ? `.${ext}` : ""}`;
  const isImage = file.type.startsWith("image/");
  if (isImage) {
    await saveBufferWithPreview("wikifile", key, buf, file.type, { maxEdge: 1600 });
  } else {
    await saveBuffer("wikifile", key, buf);
  }
  return { url: `/api/wiki-file/${key}`, name: file.name, isImage };
}

export async function deleteWikiPage(id: string): Promise<void> {
  await requireWiki();
  // Antes de borrar la página, eliminamos del storage los archivos que solo ella
  // referenciaba (evita basura huérfana en el NAS).
  const page = await db.wikiPage.findUnique({ where: { id }, select: { content: true } });
  if (page) {
    for (const att of extractWikiAttachments(page.content)) {
      // No borrar si OTRA página todavía referencia el mismo archivo.
      const stillUsed = await db.wikiPage.count({ where: { id: { not: id }, content: { contains: att.url } } });
      if (stillUsed > 0) continue;
      const key = att.url.replace("/api/wiki-file/", "").replace(/[^a-zA-Z0-9._-]/g, "");
      if (!key) continue;
      await deleteRel(`wikifile/${key}`);
      await deleteRel(previewRel(`wikifile/${key}`)); // derivado .opt.webp si era imagen
    }
  }
  await db.wikiPage.delete({ where: { id } });
  revalidatePath("/wiki");
  redirect("/wiki");
}
