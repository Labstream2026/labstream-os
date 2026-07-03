"use server";

import { noAutorizado } from "@/lib/authz-error";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { DEFAULT_FOLDERS, type TemplateContent } from "@/lib/templates";

// Quien puede crear proyectos puede gestionar las plantillas del equipo.
async function ensureCanManage() {
  const session = await getSession();
  if (!hasPermission(session, "crear_proyectos")) noAutorizado();
  return session;
}

const EMPTY_CONTENT: TemplateContent = {
  stages: ["Preproducción", "Producción", "Edición", "Revisión", "Entrega"],
  folders: DEFAULT_FOLDERS,
  tasks: [],
  deliverables: [],
  tables: [],
};

function freshKey() {
  return `custom-${randomUUID().slice(0, 8)}`;
}

async function loadContent(id: string): Promise<TemplateContent> {
  const tpl = await db.projectTemplate.findUnique({ where: { id }, select: { content: true } });
  if (!tpl) throw new Error("Plantilla no encontrada");
  const c = (tpl.content as unknown as TemplateContent) ?? EMPTY_CONTENT;
  return {
    stages: c.stages ?? [],
    folders: c.folders ?? [],
    tasks: c.tasks ?? [],
    deliverables: c.deliverables ?? [],
    tables: c.tables ?? [],
  };
}

async function saveContent(id: string, content: TemplateContent) {
  await db.projectTemplate.update({ where: { id }, data: { content: content as never } });
  revalidatePath(`/plantillas/${id}`);
  revalidatePath("/plantillas");
}

// ── CRUD de plantilla ───────────────────────────────────────────────
export async function createTemplate(name?: string) {
  await ensureCanManage();
  const tpl = await db.projectTemplate.create({
    data: {
      key: freshKey(),
      name: name?.trim() || "Nueva plantilla",
      emoji: "🎬",
      description: "",
      type: "REEL",
      content: EMPTY_CONTENT as never,
    },
  });
  redirect(`/plantillas/${tpl.id}`);
}

export async function duplicateTemplate(id: string) {
  await ensureCanManage();
  const src = await db.projectTemplate.findUnique({ where: { id } });
  if (!src) throw new Error("Plantilla no encontrada");
  const copy = await db.projectTemplate.create({
    data: {
      key: freshKey(),
      name: `${src.name} (copia)`,
      emoji: src.emoji,
      description: src.description,
      type: src.type,
      content: src.content as never,
    },
  });
  redirect(`/plantillas/${copy.id}`);
}

export async function deleteTemplate(id: string) {
  await ensureCanManage();
  await db.projectTemplate.delete({ where: { id } });
  revalidatePath("/plantillas");
  redirect("/plantillas");
}

export async function updateTemplateMeta(id: string, formData: FormData) {
  await ensureCanManage();
  const name = String(formData.get("name") ?? "").trim();
  const emoji = String(formData.get("emoji") ?? "").trim() || "🎬";
  const description = String(formData.get("description") ?? "").trim();
  const type = String(formData.get("type") ?? "REEL");
  if (!name) return;
  await db.projectTemplate.update({
    where: { id },
    data: { name, emoji, description, type: type as never },
  });
  revalidatePath(`/plantillas/${id}`);
  revalidatePath("/plantillas");
}

// ── Edición del contenido (etapas, carpetas, tareas, entregables) ────
export async function addStage(id: string, formData: FormData) {
  await ensureCanManage();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const c = await loadContent(id);
  if (!c.stages.includes(name)) c.stages.push(name);
  await saveContent(id, c);
}

export async function removeStage(id: string, index: number) {
  await ensureCanManage();
  const c = await loadContent(id);
  c.stages.splice(index, 1);
  await saveContent(id, c);
}

export async function addFolder(id: string, formData: FormData) {
  await ensureCanManage();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const c = await loadContent(id);
  if (!c.folders.includes(name)) c.folders.push(name);
  await saveContent(id, c);
}

export async function removeFolder(id: string, index: number) {
  await ensureCanManage();
  const c = await loadContent(id);
  c.folders.splice(index, 1);
  await saveContent(id, c);
}

export async function addTask(id: string, formData: FormData) {
  await ensureCanManage();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const priority = String(formData.get("priority") ?? "MEDIA") as TemplateContent["tasks"][number]["priority"];
  const stage = String(formData.get("stage") ?? "").trim() || undefined;
  const c = await loadContent(id);
  c.tasks.push({ title, priority, ...(stage ? { stage } : {}) });
  await saveContent(id, c);
}

export async function removeTask(id: string, index: number) {
  await ensureCanManage();
  const c = await loadContent(id);
  c.tasks.splice(index, 1);
  await saveContent(id, c);
}

export async function addDeliverable(id: string, formData: FormData) {
  await ensureCanManage();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const type = String(formData.get("type") ?? "REEL") as TemplateContent["deliverables"][number]["type"];
  const c = await loadContent(id);
  c.deliverables.push({ name, type });
  await saveContent(id, c);
}

export async function removeDeliverable(id: string, index: number) {
  await ensureCanManage();
  const c = await loadContent(id);
  c.deliverables.splice(index, 1);
  await saveContent(id, c);
}
