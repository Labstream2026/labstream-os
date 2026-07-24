"use server";

import { opsSession } from "@/lib/ops-access";
import { createOpsFolder, renameOps, moveOps, trashOps } from "@/lib/nas-ops";
import { logActivity } from "@/lib/activity";

type Result = { ok: true; rel?: string } | { error: string };

function msg(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

// Crear una subcarpeta en Operaciones_LAB.
export async function opsCreateFolder(parent: string, name: string): Promise<Result> {
  const session = await opsSession({ write: true });
  if (!session) return { error: "Sin permiso" };
  try {
    const rel = await createOpsFolder(parent, name);
    await logActivity({ action: "ops.folder", summary: `creó la carpeta «${rel}» en Operaciones_LAB`, entityType: "ops", entityId: rel, silent: true });
    return { ok: true, rel };
  } catch (e) {
    return { error: msg(e, "No se pudo crear la carpeta") };
  }
}

// Renombrar archivo o carpeta (en el mismo sitio).
export async function opsRename(rel: string, newName: string): Promise<Result> {
  const session = await opsSession({ write: true });
  if (!session) return { error: "Sin permiso" };
  try {
    const next = await renameOps(rel, newName);
    await logActivity({ action: "ops.rename", summary: `renombró «${rel.split("/").pop()}» → «${next.split("/").pop()}» en Operaciones_LAB`, entityType: "ops", entityId: next, silent: true });
    return { ok: true, rel: next };
  } catch (e) {
    return { error: msg(e, "No se pudo renombrar") };
  }
}

// Mover archivo o carpeta a otra carpeta del disco.
export async function opsMove(rel: string, destDir: string): Promise<Result> {
  const session = await opsSession({ write: true });
  if (!session) return { error: "Sin permiso" };
  try {
    const next = await moveOps(rel, destDir);
    await logActivity({ action: "ops.move", summary: `movió «${rel}» → «${next}» en Operaciones_LAB`, entityType: "ops", entityId: next, silent: true });
    return { ok: true, rel: next };
  } catch (e) {
    return { error: msg(e, "No se pudo mover") };
  }
}

// «Borrar» = mover a la papelera de la carpeta compartida (#recycle), recuperable en DSM.
export async function opsTrash(rel: string): Promise<Result> {
  const session = await opsSession({ write: true });
  if (!session) return { error: "Sin permiso" };
  try {
    await trashOps(rel);
    await logActivity({ action: "ops.trash", summary: `envió «${rel}» a la papelera de Operaciones_LAB`, entityType: "ops", entityId: rel, silent: true });
    return { ok: true };
  } catch (e) {
    return { error: msg(e, "No se pudo borrar") };
  }
}
