import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

// Registra un cambio en el log de actividad (fecha/hora automática + autor de la sesión).
// Best-effort: nunca rompe la acción principal si el log falla.
export async function logActivity(input: {
  action: string;
  summary: string;
  projectId?: string | null;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  try {
    const me = await getCurrentUser();
    await db.activityLog.create({
      data: {
        action: input.action,
        summary: input.summary,
        projectId: input.projectId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        userId: me?.id ?? null,
      },
    });
  } catch {
    // no propagamos: el registro de actividad es secundario.
  }
}
