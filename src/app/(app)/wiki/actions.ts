"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canSeeWiki } from "@/lib/wiki-access";
import { wikiTemplate } from "@/lib/wiki-templates";

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
  revalidatePath(`/wiki/${id}`);
  revalidatePath("/wiki");
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

export async function deleteWikiPage(id: string): Promise<void> {
  await requireWiki();
  await db.wikiPage.delete({ where: { id } });
  revalidatePath("/wiki");
  redirect("/wiki");
}
