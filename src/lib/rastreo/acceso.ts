import { db } from "@/lib/db";
import { hasPermission } from "@/lib/auth";
import type { SessionUser } from "@/lib/session";

// ── Quién puede ver el rastreo de quién ─────────────────────────────────────
// El dato del sensor (horas efectivas, apps, jornadas) es PERSONAL, así que no se hereda por
// rol como el resto: nadie lo tiene por venir de fábrica. Hay exactamente dos formas de verlo:
//
//   1. el permiso `ver_rastreo` → ve a TODO el equipo y puede compartir;
//   2. un TrackerShare          → ve SOLO a la persona que le concedieron, y no comparte nada.
//
// Todo lo demás (rol gerente, ver_reportes, ver_cumplimiento) NO alcanza a propósito. El rol
// `admin` sí pasa, porque hasPermission le abre todo por diseño en esta app.

export const PERMISO_RASTREO = "ver_rastreo";

export type AccesoRastreo = {
  /** ¿Puede abrir el panel? */
  puede: boolean;
  /** Ve a todo el equipo y puede conceder acceso a otros. */
  gestiona: boolean;
  /** Ids que puede mirar. `null` = todos (solo cuando gestiona). */
  sujetos: string[] | null;
};

const NADA: AccesoRastreo = { puede: false, gestiona: false, sujetos: [] };

export async function accesoRastreo(session: SessionUser | null): Promise<AccesoRastreo> {
  // El portal del cliente y las cuentas demo no tocan esto ni por compartición.
  if (!session || session.role === "cliente" || session.role === "demo") return NADA;
  if (hasPermission(session, PERMISO_RASTREO)) return { puede: true, gestiona: true, sujetos: null };

  const vivos = await db.trackerShare.findMany({
    where: {
      viewerId: session.id,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { subjectId: true },
  });
  const sujetos = vivos.map((s) => s.subjectId);
  return { puede: sujetos.length > 0, gestiona: false, sujetos };
}

/**
 * Traduce el acceso a un `where` de Prisma sobre `userId`. Devuelve null cuando no hay nada
 * que consultar, para que quien llama corte antes de ir a la base.
 */
export function filtroSujetos(acceso: AccesoRastreo): { userId?: { in: string[] } } | null {
  if (!acceso.puede) return null;
  if (acceso.sujetos === null) return {};
  if (acceso.sujetos.length === 0) return null;
  return { userId: { in: acceso.sujetos } };
}
