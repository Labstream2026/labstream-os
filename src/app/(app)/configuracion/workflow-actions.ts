"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";

type Kind = "TASK_STATUS" | "TASK_PRIORITY";
// Todas las acciones devuelven un RESULTADO (nunca lanzan un error crudo al cliente): así un fallo
// se muestra EN LÍNEA en el panel y jamás tumba la página con el cartel gris de "No se pudo cargar".
export type LabelResult = { ok: boolean; error?: string };

async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  return hasPermission(session, "administrar_usuarios");
}

function refresh() {
  revalidatePath("/configuracion");
  revalidatePath("/mis-tareas");
  revalidatePath("/proyectos", "layout");
}

// Clave estable del valor por defecto de un tipo (para reasignar al borrar).
async function defaultKeyOf(kind: Kind): Promise<string> {
  const def = await db.workflowLabel.findFirst({ where: { kind, isDefault: true } });
  if (def) return def.key;
  const first = await db.workflowLabel.findFirst({ where: { kind }, orderBy: { position: "asc" } });
  return first?.key ?? "";
}

const FAIL = "No se pudo aplicar el cambio. Reintenta.";

export async function addLabel(kind: Kind, formData: FormData): Promise<LabelResult> {
  if (!(await isAdmin())) return { ok: false, error: "No autorizado" };
  const label = String(formData.get("label") ?? "").trim();
  const color = String(formData.get("color") ?? "slate").trim() || "slate";
  if (!label) return { ok: true };
  try {
    const last = await db.workflowLabel.findFirst({ where: { kind }, orderBy: { position: "desc" } });
    await db.workflowLabel.create({
      data: { kind, key: `custom-${randomUUID().slice(0, 8)}`, label, color, position: (last?.position ?? -1) + 1 },
    });
    refresh();
    return { ok: true };
  } catch (e) {
    console.error("[labels] addLabel:", e);
    return { ok: false, error: FAIL };
  }
}

export async function renameLabel(id: string, formData: FormData): Promise<LabelResult> {
  if (!(await isAdmin())) return { ok: false, error: "No autorizado" };
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { ok: true };
  try {
    await db.workflowLabel.update({ where: { id }, data: { label } });
    refresh();
    return { ok: true };
  } catch (e) {
    console.error("[labels] renameLabel:", e);
    return { ok: false, error: FAIL };
  }
}

export async function setLabelColor(id: string, color: string): Promise<LabelResult> {
  if (!(await isAdmin())) return { ok: false, error: "No autorizado" };
  try {
    await db.workflowLabel.update({ where: { id }, data: { color: color || "slate" } });
    refresh();
    return { ok: true };
  } catch (e) {
    console.error("[labels] setLabelColor:", e);
    return { ok: false, error: FAIL };
  }
}

export async function setLabelDefault(id: string): Promise<LabelResult> {
  if (!(await isAdmin())) return { ok: false, error: "No autorizado" };
  try {
    const row = await db.workflowLabel.findUnique({ where: { id } });
    if (!row) return { ok: true };
    await db.workflowLabel.updateMany({ where: { kind: row.kind }, data: { isDefault: false } });
    await db.workflowLabel.update({ where: { id }, data: { isDefault: true } });
    refresh();
    return { ok: true };
  } catch (e) {
    console.error("[labels] setLabelDefault:", e);
    return { ok: false, error: FAIL };
  }
}

export async function toggleLabelDone(id: string): Promise<LabelResult> {
  if (!(await isAdmin())) return { ok: false, error: "No autorizado" };
  try {
    const row = await db.workflowLabel.findUnique({ where: { id } });
    if (!row || row.kind !== "TASK_STATUS") return { ok: true };
    await db.workflowLabel.update({ where: { id }, data: { isDone: !row.isDone } });
    refresh();
    return { ok: true };
  } catch (e) {
    console.error("[labels] toggleLabelDone:", e);
    return { ok: false, error: FAIL };
  }
}

// Mueve la etiqueta una posición arriba (-1) o abajo (+1) intercambiando con su vecina.
export async function moveLabel(id: string, dir: number): Promise<LabelResult> {
  if (!(await isAdmin())) return { ok: false, error: "No autorizado" };
  try {
    const row = await db.workflowLabel.findUnique({ where: { id } });
    if (!row) return { ok: true };
    const neighbor = await db.workflowLabel.findFirst({
      where: { kind: row.kind, position: dir < 0 ? { lt: row.position } : { gt: row.position } },
      orderBy: { position: dir < 0 ? "desc" : "asc" },
    });
    if (!neighbor) return { ok: true };
    await db.$transaction([
      db.workflowLabel.update({ where: { id: row.id }, data: { position: neighbor.position } }),
      db.workflowLabel.update({ where: { id: neighbor.id }, data: { position: row.position } }),
    ]);
    refresh();
    return { ok: true };
  } catch (e) {
    console.error("[labels] moveLabel:", e);
    return { ok: false, error: FAIL };
  }
}

export async function deleteLabel(id: string): Promise<LabelResult> {
  if (!(await isAdmin())) return { ok: false, error: "No autorizado" };
  try {
    const row = await db.workflowLabel.findUnique({ where: { id } });
    if (!row) return { ok: true };
    const count = await db.workflowLabel.count({ where: { kind: row.kind } });
    if (count <= 1) return { ok: false, error: "Debe quedar al menos una opción." };
    // Reasigna las tareas (y proyectos) que usaban esta key al valor por defecto.
    const fallback = await defaultKeyOf(row.kind);
    if (fallback && fallback !== row.key) {
      if (row.kind === "TASK_STATUS") {
        await db.task.updateMany({ where: { status: row.key }, data: { status: fallback } });
      } else {
        await db.task.updateMany({ where: { priority: row.key }, data: { priority: fallback } });
        await db.project.updateMany({ where: { priority: row.key }, data: { priority: fallback } });
      }
    }
    await db.workflowLabel.delete({ where: { id } });
    // Si borramos el que era por defecto, marca el primero como nuevo por defecto.
    if (row.isDefault) {
      const first = await db.workflowLabel.findFirst({ where: { kind: row.kind }, orderBy: { position: "asc" } });
      if (first) await db.workflowLabel.update({ where: { id: first.id }, data: { isDefault: true } });
    }
    refresh();
    return { ok: true };
  } catch (e) {
    console.error("[labels] deleteLabel:", e);
    return { ok: false, error: FAIL };
  }
}
