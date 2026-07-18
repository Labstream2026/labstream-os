import { db } from "@/lib/db";

// ── Silencio de notificaciones ──
// Dos mecanismos independientes que consulta el pipeline `notify`:
//  1. Silencio TEMPORAL/HORARIO ("No molestar" + horario silencioso): NO borra el aviso, solo
//     suprime PUSH y CORREO; la campana in-app sigue acumulando (nada se pierde).
//  2. MUTE por proyecto/persona: suprime el aviso por completo (in-app, push y correo).

// Hora de pared de Bogotá (0–23) de un instante.
function bogotaHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "2-digit", hour12: false }).format(now)) % 24;
}

// ¿El usuario está en silencio AHORA? (No molestar vigente o dentro del horario silencioso).
export async function isSilencedNow(userId: string, now: Date = new Date()): Promise<boolean> {
  let u: { dndUntil: Date | null; quietStart: number | null; quietEnd: number | null } | null;
  try {
    u = await db.user.findUnique({ where: { id: userId }, select: { dndUntil: true, quietStart: true, quietEnd: true } });
  } catch {
    return false; // ante cualquier fallo, mejor entregar el aviso que perderlo
  }
  if (!u) return false;
  if (u.dndUntil && u.dndUntil.getTime() > now.getTime()) return true;
  if (u.quietStart != null && u.quietEnd != null && u.quietStart !== u.quietEnd) {
    const h = bogotaHour(now);
    const inWindow = u.quietStart < u.quietEnd ? h >= u.quietStart && h < u.quietEnd : h >= u.quietStart || h < u.quietEnd;
    if (inWindow) return true;
  }
  return false;
}

// Conjunto de claves silenciadas del usuario ("project:<id>" / "user:<id>").
export async function mutedKeys(userId: string): Promise<Set<string>> {
  try {
    const rows = await db.notificationMute.findMany({ where: { userId }, select: { kind: true, targetId: true } });
    return new Set(rows.map((r) => `${r.kind}:${r.targetId}`));
  } catch {
    return new Set();
  }
}

// ¿Está silenciado el ORIGEN de este aviso? (persona actor/responsable o proyecto).
export function isMutedBy(muted: Set<string>, opts: { actorId?: string | null; subjectId?: string | null; projectId?: string | null }): boolean {
  if (muted.size === 0) return false;
  if (opts.actorId && muted.has(`user:${opts.actorId}`)) return true;
  if (opts.subjectId && muted.has(`user:${opts.subjectId}`)) return true;
  if (opts.projectId && muted.has(`project:${opts.projectId}`)) return true;
  return false;
}
