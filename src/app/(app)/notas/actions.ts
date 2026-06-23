"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

// Notas rápidas del usuario. Se crean desde esta página, desde el chat (Marcebot) o desde
// WhatsApp (campo `source`); cada quien gestiona las suyas (los admins pueden borrar cualquiera).
export async function createNote(formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;
  const title = String(formData.get("title") ?? "").trim() || content.replace(/\s+/g, " ").slice(0, 60);
  const category = String(formData.get("category") ?? "").trim() || null;
  const note = await db.note.create({
    data: { title, content, category, source: "app", createdById: session.id },
    select: { id: true },
  });
  await logActivity({ action: "note.create", summary: `creó la nota «${title}»`, entityType: "note", entityId: note.id }).catch(() => null);
  revalidatePath("/notas");
}

export async function deleteNote(id: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const note = await db.note.findUnique({ where: { id }, select: { createdById: true, title: true } });
  if (!note) return;
  if (note.createdById !== session.id && session.role !== "admin") throw new Error("No autorizado");
  await db.note.delete({ where: { id } });
  await logActivity({ action: "note.delete", summary: `borró la nota «${note.title}»`, entityType: "note", entityId: id }).catch(() => null);
  revalidatePath("/notas");
}
