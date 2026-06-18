"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { importInitialInventory } from "@/lib/inventario-seed";

// Importa el inventario inicial desde el dataset (hoja del equipo). Solo admin. Idempotente.
export async function runInventoryImport(): Promise<{ ok: boolean; created?: number; skipped?: number; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { ok: false, error: "Solo un administrador puede importar el inventario." };
  try {
    const res = await importInitialInventory();
    revalidatePath("/wiki/inventario");
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error al importar." };
  }
}
