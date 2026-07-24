"use server";

import { revalidatePath } from "next/cache";
import { getSession, hasPermission } from "@/lib/auth";
import { setAppConfig, REQUIRE_BACKUP_TO_FINISH } from "@/lib/app-config";

// Candado de respaldo (Ajustes → Biblioteca): mismo gate que el resto de los
// ajustes de sistema (administrar_integraciones = admin por defecto).
export async function setBackupLock(on: boolean): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_integraciones")) {
    return { ok: false, error: "No autorizado" };
  }
  await setAppConfig(REQUIRE_BACKUP_TO_FINISH, on);
  revalidatePath("/ajustes");
  return { ok: true };
}
