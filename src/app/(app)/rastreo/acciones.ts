"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { accesoRastreo } from "@/lib/rastreo/acceso";

// ── Compartir el rastreo de UNA persona con otro miembro del equipo ─────────
// Solo quien tiene `ver_rastreo` concede: quien recibe una compartición NO puede volver a
// compartir (si no, el permiso se repartiría solo). Todo queda en la bitácora, porque abrir
// el dato personal de alguien es justo lo que uno quiere poder rastrear después.

const MAX_DIAS = 365;

export async function compartirRastreo(input: {
  subjectId: string;
  viewerId: string;
  dias: number | null; // null = sin vencimiento
  nota: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  const acceso = await accesoRastreo(session);
  if (!session || !acceso.gestiona) return { ok: false, error: "No tienes permiso para compartir el rastreo." };
  // Compartirle a alguien SU PROPIO rastreo está permitido a propósito: es la forma de darle
  // a una persona sus números sin abrirle los del resto.

  const [sujeto, visor] = await Promise.all([
    db.user.findUnique({ where: { id: input.subjectId }, select: { id: true, name: true } }),
    db.user.findUnique({ where: { id: input.viewerId }, select: { id: true, name: true, active: true, role: { select: { key: true } } } }),
  ]);
  if (!sujeto || !visor) return { ok: false, error: "Esa persona ya no existe." };
  if (!visor.active) return { ok: false, error: "Esa cuenta está desactivada." };
  if (visor.role?.key === "cliente" || visor.role?.key === "demo") {
    return { ok: false, error: "El rastreo no se comparte con cuentas de cliente." };
  }

  const dias = input.dias === null ? null : Math.min(Math.max(1, Math.round(input.dias)), MAX_DIAS);
  const expiresAt = dias === null ? null : new Date(Date.now() + dias * 86_400_000);
  const nota = input.nota.trim().slice(0, 140) || null;

  await db.trackerShare.upsert({
    where: { viewerId_subjectId: { viewerId: visor.id, subjectId: sujeto.id } },
    create: { viewerId: visor.id, subjectId: sujeto.id, grantedById: session.id, expiresAt, nota },
    // Volver a compartir REACTIVA: si estaba revocado o vencido, vuelve a quedar vivo.
    update: { grantedById: session.id, expiresAt, nota, revokedAt: null },
  });

  await logActivity({
    action: "rastreo.compartir",
    summary: `Compartió el rastreo de ${sujeto.name} con ${visor.name}${expiresAt ? ` (vence en ${dias} días)` : ""}`,
    entityType: "rastreo",
    entityId: sujeto.id,
  });
  revalidatePath("/rastreo");
  return { ok: true };
}

export async function revocarRastreo(input: { subjectId: string; viewerId: string }): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  const acceso = await accesoRastreo(session);
  if (!session || !acceso.gestiona) return { ok: false, error: "No tienes permiso para cambiar esto." };

  const share = await db.trackerShare.findUnique({
    where: { viewerId_subjectId: { viewerId: input.viewerId, subjectId: input.subjectId } },
    select: { id: true, subject: { select: { name: true } }, viewer: { select: { name: true } } },
  });
  if (!share) return { ok: false, error: "Ese acceso ya no existe." };

  await db.trackerShare.update({ where: { id: share.id }, data: { revokedAt: new Date() } });
  await logActivity({
    action: "rastreo.revocar",
    summary: `Quitó a ${share.viewer.name} el acceso al rastreo de ${share.subject.name}`,
    entityType: "rastreo",
    entityId: input.subjectId,
  });
  revalidatePath("/rastreo");
  return { ok: true };
}
