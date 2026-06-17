"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { userCanManageProject } from "@/lib/project-access";
import { saveOptimizedImage, IMAGE_EDGES } from "@/lib/image";
import { TONE_MAP } from "@/lib/colors";

type Result = { ok: boolean; error?: string };

function safeTone(value: string): string | null {
  const k = value.trim();
  return k && k in TONE_MAP ? k : null;
}

// Personalización visual del proyecto (portada tipo Notion + emoji + color), guardado al
// instante desde la cabecera. Solo quien gestiona el proyecto. Lee solo lo presente.
export async function saveProjectAppearance(projectId: string, formData: FormData): Promise<Result> {
  const session = await getSession();
  if (!(await userCanManageProject(projectId, session))) return { ok: false, error: "No autorizado" };

  const data: { emoji?: string | null; color?: string | null; bannerUrl?: string } = {};
  if (formData.has("emoji")) data.emoji = String(formData.get("emoji") ?? "").trim().slice(0, 8) || null;
  if (formData.has("accentColor")) data.color = safeTone(String(formData.get("accentColor") ?? ""));

  const file = formData.get("banner");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) return { ok: false, error: "El archivo debe ser una imagen" };
    if (file.size > 8 * 1024 * 1024) return { ok: false, error: "La portada supera 8MB" };
    const buf = Buffer.from(await file.arrayBuffer());
    // Se optimiza al subir (WebP ≤1600px): la portada queda ligera y no guardamos el original.
    await saveOptimizedImage("banners", projectId, buf, file.type, { maxEdge: IMAGE_EDGES.BANNER_EDGE, quality: 78 });
    data.bannerUrl = `/api/banner/${projectId}?v=${Date.now()}`;
  }

  if (Object.keys(data).length === 0) return { ok: true };
  await db.project.update({ where: { id: projectId }, data });
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/proyectos");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function clearProjectCover(projectId: string): Promise<Result> {
  const session = await getSession();
  if (!(await userCanManageProject(projectId, session))) return { ok: false, error: "No autorizado" };
  await db.project.update({ where: { id: projectId }, data: { bannerUrl: null } });
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/", "layout");
  return { ok: true };
}
