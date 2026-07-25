"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { persistNote, type NoteSaveInput, type NoteSaveResult } from "@/lib/note-save";

// Notas rápidas del usuario. Se crean/editan desde la vista /notas (estilo iCloud), desde el
// chat (Marcebot) o desde WhatsApp (campo `source`). Cada quien gestiona las suyas (los admins
// pueden borrar cualquiera).

// Crea o actualiza (upsert) una nota. Si llega `id`, edita la nota propia; si no, crea una nueva.
// La lógica vive en `persistNote` (lib/note-save.ts) para que el autoguardado por sendBeacon
// — el que salva el texto cuando se cierra la pestaña — aplique exactamente las mismas reglas.
// Devuelve datos para que el editor del cliente refresque su estado sin recargar; si la nota
// cambió en otro dispositivo devuelve `conflict` con la versión del servidor.
export async function saveNote(
  input: NoteSaveInput,
  opts?: { force?: boolean },
): Promise<NoteSaveResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autorizado" };
  const r = await persistNote(session, input, opts?.force ? "force" : "ask");
  if (r.ok) revalidatePath("/notas");
  return r;
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

// Borrar = mandar a la PAPELERA (borrado suave, como proyectos y clientes). La nota sigue
// existiendo con `archivedAt`; se restaura desde la papelera de /notas o se elimina de
// verdad con `purgeNote`. Antes esto era un `delete` físico y no había vuelta atrás.
export async function deleteNote(id: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const note = await db.note.findUnique({ where: { id }, select: { createdById: true, title: true, archivedAt: true } });
  if (!note) return { ok: true };
  if (note.createdById !== session.id && session.role !== "admin") return { ok: false };
  if (note.archivedAt) return { ok: true }; // ya estaba en la papelera
  await db.note.update({ where: { id }, data: { archivedAt: new Date(), archivedById: session.id, pinned: false } });
  await logActivity({ action: "note.delete", summary: `mandó a la papelera la nota «${note.title}»`, entityType: "note", entityId: id }).catch(() => null);
  revalidatePath("/notas");
  return { ok: true };
}

// Saca una nota de la papelera y la devuelve a la lista.
export async function restoreNote(id: string): Promise<{ ok: boolean }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const note = await db.note.findUnique({ where: { id }, select: { createdById: true, title: true } });
  if (!note) return { ok: false };
  if (note.createdById !== session.id && session.role !== "admin") return { ok: false };
  await db.note.update({ where: { id }, data: { archivedAt: null, archivedById: null } });
  await logActivity({ action: "note.restore", summary: `restauró la nota «${note.title}»`, entityType: "note", entityId: id }).catch(() => null);
  revalidatePath("/notas");
  return { ok: true };
}

// Eliminación DEFINITIVA (segundo paso explícito): solo desde la papelera.
export async function purgeNote(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false };
  const note = await db.note.findUnique({ where: { id }, select: { createdById: true, title: true, archivedAt: true } });
  if (!note) return { ok: true };
  if (note.createdById !== session.id && session.role !== "admin") return { ok: false };
  if (!note.archivedAt) return { ok: false, error: "Manda la nota a la papelera antes de eliminarla." };
  await db.note.delete({ where: { id } });
  await logActivity({ action: "note.purge", summary: `eliminó definitivamente la nota «${note.title}»`, entityType: "note", entityId: id }).catch(() => null);
  revalidatePath("/notas");
  return { ok: true };
}

// Vacía la papelera propia (los admin solo vacían la suya: la de cada quien es suya).
export async function emptyNoteTrash(): Promise<{ ok: boolean; removed: number }> {
  const session = await getSession();
  if (!session) return { ok: false, removed: 0 };
  const r = await db.note.deleteMany({ where: { createdById: session.id, archivedAt: { not: null } } });
  if (r.count) await logActivity({ action: "note.purge", summary: `vació la papelera de notas (${r.count})`, entityType: "note" }).catch(() => null);
  revalidatePath("/notas");
  return { ok: true, removed: r.count };
}
