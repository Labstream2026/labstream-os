"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

// Notas rápidas del usuario. Se crean/editan desde la vista /notas (estilo iCloud), desde el
// chat (Marcebot) o desde WhatsApp (campo `source`). Cada quien gestiona las suyas (los admins
// pueden borrar cualquiera).

// Crea o actualiza (upsert) una nota. Si llega `id`, edita la nota propia; si no, crea una nueva.
// Devuelve datos para que el editor del cliente refresque su estado sin recargar.
export async function saveNote(input: { id?: string; title?: string; content?: string; category?: string | null }): Promise<{ ok: boolean; id?: string; title?: string; createdAt?: string; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  const content = (input.content ?? "").trim();
  const title = (input.title ?? "").trim() || content.replace(/\s+/g, " ").slice(0, 60) || "Nota sin título";
  const category = (input.category ?? "")?.toString().trim() || null;

  if (input.id) {
    const existing = await db.note.findUnique({ where: { id: input.id }, select: { createdById: true } });
    if (!existing) return { ok: false, error: "La nota no existe" };
    if (existing.createdById !== session.id && session.role !== "admin") return { ok: false, error: "No autorizado" };
    const n = await db.note.update({ where: { id: input.id }, data: { title, content, category }, select: { id: true, title: true, createdAt: true } });
    revalidatePath("/notas");
    return { ok: true, id: n.id, title: n.title, createdAt: n.createdAt.toISOString() };
  }

  const n = await db.note.create({
    data: { title, content, category, source: "app", createdById: session.id },
    select: { id: true, title: true, createdAt: true },
  });
  await logActivity({ action: "note.create", summary: `creó la nota «${title}»`, entityType: "note", entityId: n.id }).catch(() => null);
  revalidatePath("/notas");
  return { ok: true, id: n.id, title: n.title, createdAt: n.createdAt.toISOString() };
}

export async function deleteNote(id: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const note = await db.note.findUnique({ where: { id }, select: { createdById: true, title: true } });
  if (!note) return { ok: true };
  if (note.createdById !== session.id && session.role !== "admin") return { ok: false };
  await db.note.delete({ where: { id } });
  await logActivity({ action: "note.delete", summary: `borró la nota «${note.title}»`, entityType: "note", entityId: id }).catch(() => null);
  revalidatePath("/notas");
  return { ok: true };
}
