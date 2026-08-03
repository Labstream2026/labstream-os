"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { canManageProject } from "@/lib/project-access";
import { logActivity } from "@/lib/activity";

// ── Enlace de BORRADOR de un entregable ───────────────────────────────────────
// Encender/apagar el enlace de revisión TEMPRANA: el que deja enseñarle la pieza a un externo
// mientras sigue en producción o edición, sin pasar por la pre-aprobación interna ni mover el
// estado del entregable. El enlace en sí es determinista (mismo entregable = mismo token), así
// que esto es un interruptor —igual que revocar/reactivar el enlace oficial—, no una fábrica de
// enlaces nuevos: apagarlo lo deja de servir, volver a encenderlo revive EL MISMO.

export type DraftShareResult = { ok: boolean; error?: string };

// 14 días: alcanza para una ronda de opinión temprana y evita que un corte sin aprobar quede
// circulando para siempre. Al revés que el oficial, este SIEMPRE nace con fecha.
const DIAS_BORRADOR = 14;

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
  archivedAt: true,
  finishedAt: true,
} as const;

// La puerta: gestionar el proyecto + `compartir_cliente`. Ese permiso lo tienen productor y
// director, no los editores ni los realizadores — que es exactamente a quién queremos dejar
// mandar material fuera de casa, aunque el material aún no esté aprobado.
async function piezaSiPuedo(deliverableId: string) {
  const session = await getSession();
  if (!session || session.role === "demo" || session.role === "cliente") return null;
  const d = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: { id: true, name: true, projectId: true, draftShareAt: true, project: { select: accessSelect } },
  });
  if (!d) return null;
  if (!canManageProject(d.project, session) || !hasPermission(session, "compartir_cliente")) return null;
  return { session, d };
}

function refresh(projectId: string, deliverableId: string) {
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath(`/revisiones/${deliverableId}`);
  revalidatePath("/revisiones");
}

export async function crearEnlaceBorrador(deliverableId: string): Promise<DraftShareResult> {
  const r = await piezaSiPuedo(deliverableId);
  if (!r) return { ok: false, error: "Necesitas permiso para compartir con el cliente." };
  await db.deliverable.update({
    where: { id: deliverableId },
    data: {
      draftShareAt: new Date(),
      draftShareById: r.session.id,
      draftShareExpiresAt: new Date(Date.now() + DIAS_BORRADOR * 86_400_000),
    },
  });
  await logActivity({
    action: "deliverable.draft_link",
    summary: `${r.d.draftShareAt ? "reactivó" : "creó"} el enlace de borrador de «${r.d.name}»`,
    projectId: r.d.projectId,
    entityType: "deliverable",
    entityId: deliverableId,
  }).catch(() => null);
  refresh(r.d.projectId, deliverableId);
  return { ok: true };
}

export async function apagarEnlaceBorrador(deliverableId: string): Promise<DraftShareResult> {
  const r = await piezaSiPuedo(deliverableId);
  if (!r) return { ok: false, error: "Necesitas permiso para compartir con el cliente." };
  await db.deliverable.update({ where: { id: deliverableId }, data: { draftShareAt: null } });
  await logActivity({
    action: "deliverable.draft_link",
    summary: `apagó el enlace de borrador de «${r.d.name}»`,
    projectId: r.d.projectId,
    entityType: "deliverable",
    entityId: deliverableId,
  }).catch(() => null);
  refresh(r.d.projectId, deliverableId);
  return { ok: true };
}

// Renueva la caducidad otros 14 días desde HOY (no desde la fecha vieja): si el externo se
// demoró, el productor le da aire sin tener que apagar y volver a encender.
export async function extenderEnlaceBorrador(deliverableId: string): Promise<DraftShareResult> {
  const r = await piezaSiPuedo(deliverableId);
  if (!r) return { ok: false, error: "Necesitas permiso para compartir con el cliente." };
  await db.deliverable.update({
    where: { id: deliverableId },
    data: { draftShareExpiresAt: new Date(Date.now() + DIAS_BORRADOR * 86_400_000) },
  });
  refresh(r.d.projectId, deliverableId);
  return { ok: true };
}
