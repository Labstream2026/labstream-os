"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { accessibleProjectWhere } from "@/lib/project-access";
import { accessibleClientWhere } from "@/lib/client-access";

// Notas rápidas del usuario. Se crean/editan desde la vista /notas (estilo iCloud), desde el
// chat (Marcebot) o desde WhatsApp (campo `source`). Cada quien gestiona las suyas (los admins
// pueden borrar cualquiera).

// Crea o actualiza (upsert) una nota. Si llega `id`, edita la nota propia; si no, crea una nueva.
// Devuelve datos para que el editor del cliente refresque su estado sin recargar.
export async function saveNote(input: { id?: string; title?: string; content?: string; category?: string | null; projectId?: string | null; clientId?: string | null; color?: string | null; remindAt?: string | null; visibility?: string | null }): Promise<{ ok: boolean; id?: string; title?: string; createdAt?: string; updatedAt?: string; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  const content = (input.content ?? "").trim();
  const title = (input.title ?? "").trim() || content.replace(/\s+/g, " ").slice(0, 60) || "Nota sin título";
  const category = (input.category ?? "")?.toString().trim() || null;
  // Proyecto vinculado (opcional). `undefined` = no tocar; "" o id inaccesible → se deja sin proyecto.
  let projectId: string | null | undefined = undefined;
  if (input.projectId !== undefined) {
    projectId = null;
    if (input.projectId) {
      const p = await db.project.findFirst({ where: { AND: [accessibleProjectWhere(session), { id: input.projectId }] }, select: { id: true } });
      if (p) projectId = p.id;
    }
  }
  // Cliente vinculado (opcional, mismo patrón): solo se guarda si es accesible para el usuario.
  let clientId: string | null | undefined = undefined;
  if (input.clientId !== undefined) {
    clientId = null;
    if (input.clientId) {
      const c = await db.client.findFirst({ where: { AND: [accessibleClientWhere(session), { id: input.clientId }] }, select: { id: true } });
      if (c) clientId = c.id;
    }
  }
  // Color (clave de paleta) y recordatorio. `undefined` = no tocar. Al fijar un recordatorio
  // se resetea reminderSentAt para que el cron lo dispare de nuevo.
  let color: string | null | undefined = undefined;
  if (input.color !== undefined) color = (input.color ?? "").toString().trim() || null;
  let remindAt: Date | null | undefined = undefined;
  if (input.remindAt !== undefined) {
    remindAt = null;
    if (input.remindAt) { const d = new Date(input.remindAt); if (!Number.isNaN(d.getTime())) remindAt = d; }
  }
  // Visibilidad (compartir): solo valores válidos; cualquier otro cae a "private".
  let visibility: string | undefined = undefined;
  if (input.visibility !== undefined) {
    const v = String(input.visibility);
    visibility = ["private", "project", "team"].includes(v) ? v : "private";
  }

  if (input.id) {
    const existing = await db.note.findUnique({ where: { id: input.id }, select: { createdById: true } });
    if (!existing) return { ok: false, error: "La nota no existe" };
    if (existing.createdById !== session.id && session.role !== "admin") return { ok: false, error: "No autorizado" };
    const n = await db.note.update({ where: { id: input.id }, data: { title, content, category, ...(projectId !== undefined ? { projectId } : {}), ...(clientId !== undefined ? { clientId } : {}), ...(color !== undefined ? { color } : {}), ...(remindAt !== undefined ? { remindAt, reminderSentAt: null } : {}), ...(visibility !== undefined ? { visibility } : {}) }, select: { id: true, title: true, createdAt: true, updatedAt: true } });
    revalidatePath("/notas");
    return { ok: true, id: n.id, title: n.title, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() };
  }

  const n = await db.note.create({
    data: { title, content, category, source: "app", createdById: session.id, projectId: projectId ?? null, clientId: clientId ?? null, color: color ?? null, remindAt: remindAt ?? null, visibility: visibility ?? "private" },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  await logActivity({ action: "note.create", summary: `creó la nota «${title}»`, entityType: "note", entityId: n.id }).catch(() => null);
  revalidatePath("/notas");
  return { ok: true, id: n.id, title: n.title, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() };
}

// Fija/desfija una nota (las fijadas van arriba). Solo notas propias (los admin, cualquiera).
export async function togglePinNote(id: string): Promise<{ ok: boolean; pinned?: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const note = await db.note.findUnique({ where: { id }, select: { createdById: true, pinned: true } });
  if (!note) return { ok: false };
  if (note.createdById !== session.id && session.role !== "admin") return { ok: false };
  const pinned = !note.pinned;
  await db.note.update({ where: { id }, data: { pinned } });
  revalidatePath("/notas");
  return { ok: true, pinned };
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
