"use server";

import { getSession, hasPermission } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { reviewCacheStats, clearReviewCache, type ReviewCacheStats } from "@/lib/review-cache";

// Espacio que ocupa en el NAS la copia local de los videos de revisión de Drive, y botón para
// vaciarla. Solo administradores (mismo criterio que el resto de Mantenimiento).

export type EspacioRevision = ReviewCacheStats & { permitido: true };
export type EspacioResult = EspacioRevision | { permitido: false };

export async function leerEspacioRevision(): Promise<EspacioResult> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_usuarios")) return { permitido: false };
  return { ...(await reviewCacheStats()), permitido: true };
}

export async function vaciarCacheRevision(): Promise<{ ok: boolean; borradas?: number; liberados?: number; error?: string }> {
  const session = await getSession();
  if (!session || !hasPermission(session, "administrar_usuarios")) return { ok: false, error: "Sin permiso." };
  const r = await clearReviewCache();
  await logActivity({ action: "review.cache_clear", summary: `vació la copia local de revisión (${r.borradas} videos)` });
  return { ok: true, ...r };
}
