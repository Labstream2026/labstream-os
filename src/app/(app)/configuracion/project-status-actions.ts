"use server";

import { revalidatePath } from "next/cache";
import { getSession, hasPermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PROJECT_STATUS_DEFAULTS, STATUS_COLORS } from "@/lib/project-status";

// Guarda los overrides de etiqueta/color de los estados de proyecto (admin con
// administrar_integraciones). Solo se aceptan claves del enum y colores de la paleta; lo demás
// cae a su valor por defecto. Re-tiñe la app (revalida el layout).
export async function saveProjectStatuses(items: { key: string; label: string; color: string }[]): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_integraciones")) return { ok: false, error: "No autorizado" };
  const defByKey = new Map(PROJECT_STATUS_DEFAULTS.map((s) => [s.key, s]));
  const map: Record<string, { label: string; color: string }> = {};
  for (const it of items ?? []) {
    const def = defByKey.get(it.key);
    if (!def) continue;
    const label = (it.label ?? "").toString().trim().slice(0, 40) || def.label;
    const color = STATUS_COLORS[it.color] ? it.color : def.color;
    map[it.key] = { label, color };
  }
  await db.orgSettings.upsert({
    where: { id: "default" },
    create: { id: "default", projectStatuses: JSON.stringify(map) },
    update: { projectStatuses: JSON.stringify(map) },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

// Restablece todos los estados a su etiqueta/color por defecto.
export async function resetProjectStatuses(): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_integraciones")) return { ok: false, error: "No autorizado" };
  await db.orgSettings.upsert({
    where: { id: "default" },
    create: { id: "default", projectStatuses: null },
    update: { projectStatuses: null },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
