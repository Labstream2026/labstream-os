"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canWriteProject } from "@/lib/project-access";
import { logActivity } from "@/lib/activity";
import { notifyAndEmail } from "@/lib/notify";
import { dayUTC } from "@/lib/equipos";

function refresh(projectId: string) {
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/mis-tareas");
}

const accessSelect = { isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } } as const;

// Acceso de ESCRITURA al plan (vía su proyecto). Lanza si no. Devuelve {session, plan}.
async function ensurePlanWrite(planId: string) {
  const session = await getSession();
  const plan = await db.equipmentPlan.findUnique({
    where: { id: planId },
    select: { id: true, projectId: true, title: true, shootDate: true, assigneeId: true, taskId: true, project: { select: { ...accessSelect, name: true } } },
  });
  if (!plan || !canWriteProject(plan.project, session)) throw new Error("No autorizado");
  return { session: session!, plan };
}

// Acceso para MARCAR empacado: lo permite quien escribe el proyecto O el responsable del
// plan (aunque no sea miembro del proyecto: puede ser alguien que solo prepara equipos).
async function ensurePlanPackedAccess(planId: string) {
  const session = await getSession();
  const plan = await db.equipmentPlan.findUnique({
    where: { id: planId },
    select: { id: true, projectId: true, assigneeId: true, project: { select: accessSelect } },
  });
  if (!plan || !session) throw new Error("No autorizado");
  const ok = plan.assigneeId === session.id || canWriteProject(plan.project, session);
  if (!ok) throw new Error("No autorizado");
  return { session, plan };
}

// ── Planes (grabaciones) ──
export async function createPlan(projectId: string, formData: FormData) {
  const session = await getSession();
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  if (!project || !canWriteProject(project, session)) throw new Error("No autorizado");
  const dateRaw = String(formData.get("shootDate") ?? "").trim();
  if (!dateRaw) return;
  const title = String(formData.get("title") ?? "").trim() || null;
  await db.equipmentPlan.create({
    data: { projectId, title, shootDate: dayUTC(dateRaw), createdById: session?.id ?? null },
  });
  await logActivity({ action: "equipos.create", summary: `creó una grabación de equipos${title ? ` «${title}»` : ""}`, projectId, entityType: "equipos" });
  refresh(projectId);
}

export async function updatePlan(planId: string, formData: FormData) {
  const { plan } = await ensurePlanWrite(planId);
  const title = String(formData.get("title") ?? "").trim() || null;
  const dateRaw = String(formData.get("shootDate") ?? "").trim();
  await db.equipmentPlan.update({
    where: { id: planId },
    data: { title, ...(dateRaw ? { shootDate: dayUTC(dateRaw) } : {}) },
  });
  // Mantén la tarea espejo sincronizada (título/fecha).
  if (plan.taskId) await syncMirrorTask(planId);
  refresh(plan.projectId);
}

export async function setPlanStatus(planId: string, status: string) {
  const { plan } = await ensurePlanWrite(planId);
  await db.equipmentPlan.update({ where: { id: planId }, data: { status } });
  refresh(plan.projectId);
}

export async function deletePlan(planId: string) {
  const { plan } = await ensurePlanWrite(planId);
  if (plan.taskId) await db.task.delete({ where: { id: plan.taskId } }).catch(() => {});
  await db.equipmentPlan.delete({ where: { id: planId } });
  refresh(plan.projectId);
}

// ── Reservas (items del checklist) ──
export async function addReservation(planId: string, rowId: string, quantity = 1) {
  const { plan } = await ensurePlanWrite(planId);
  await db.equipmentReservation.upsert({
    where: { planId_rowId: { planId, rowId } },
    create: { planId, rowId, quantity: Math.max(1, quantity) },
    update: { quantity: Math.max(1, quantity) },
  });
  if (plan.taskId) await syncMirrorTask(planId);
  refresh(plan.projectId);
}

export async function setReservationQuantity(reservationId: string, quantity: number) {
  const res = await db.equipmentReservation.findUnique({ where: { id: reservationId }, select: { planId: true } });
  if (!res) return;
  const { plan } = await ensurePlanWrite(res.planId);
  await db.equipmentReservation.update({ where: { id: reservationId }, data: { quantity: Math.max(1, quantity) } });
  refresh(plan.projectId);
}

export async function removeReservation(reservationId: string) {
  const res = await db.equipmentReservation.findUnique({ where: { id: reservationId }, select: { planId: true } });
  if (!res) return;
  const { plan } = await ensurePlanWrite(res.planId);
  await db.equipmentReservation.delete({ where: { id: reservationId } });
  if (plan.taskId) await syncMirrorTask(res.planId);
  refresh(plan.projectId);
}

// Marcar/desmarcar empacado (checklist). Lo puede hacer el responsable aunque no esté en el proyecto.
export async function togglePacked(reservationId: string, packed: boolean) {
  const res = await db.equipmentReservation.findUnique({ where: { id: reservationId }, select: { planId: true } });
  if (!res) return;
  const { plan } = await ensurePlanPackedAccess(res.planId);
  await db.equipmentReservation.update({ where: { id: reservationId }, data: { packed } });
  refresh(plan.projectId);
}

// ── Asignar responsable (crea/actualiza una tarea espejo en "Mis tareas" + avisa) ──
export async function setPlanAssignee(planId: string, assigneeId: string) {
  const { session, plan } = await ensurePlanWrite(planId);
  const newId = assigneeId || null;
  if (newId) {
    const u = await db.user.findUnique({ where: { id: newId }, select: { active: true } });
    if (!u?.active) throw new Error("Usuario inválido");
  }
  await db.equipmentPlan.update({ where: { id: planId }, data: { assigneeId: newId } });

  if (newId) {
    await syncMirrorTask(planId); // crea o reasigna la tarea espejo
    if (newId !== session.id) {
      await notifyAndEmail(newId, {
        type: "task",
        title: `Preparar equipos: ${plan.title || plan.project.name}`,
        body: "Eres responsable de tener los equipos listos para esta grabación.",
        link: `/proyectos/${plan.projectId}?tab=equipos`,
      });
    }
  } else if (plan.taskId) {
    // Sin responsable → quita la tarea espejo.
    await db.task.delete({ where: { id: plan.taskId } }).catch(() => {});
    await db.equipmentPlan.update({ where: { id: planId }, data: { taskId: null } });
  }
  refresh(plan.projectId);
}

// Crea (o actualiza) la tarea espejo del plan: aparece en "Mis tareas" del responsable, con
// la fecha de grabación y la lista de equipos en la descripción.
async function syncMirrorTask(planId: string) {
  const plan = await db.equipmentPlan.findUnique({
    where: { id: planId },
    select: {
      id: true, projectId: true, title: true, shootDate: true, assigneeId: true, taskId: true, createdById: true,
      project: { select: { name: true } },
      items: { select: { quantity: true, row: { select: { cells: { select: { value: true, column: { select: { name: true } } } } } } } },
    },
  });
  if (!plan) return;
  const itemNames = plan.items.map((it) => {
    const nameCell = it.row.cells.find((c) => c.column.name === "Nombre");
    const nm = nameCell?.value ? String(nameCell.value) : "Equipo";
    return `• ${nm}${it.quantity > 1 ? ` ×${it.quantity}` : ""}`;
  });
  const title = `🎒 Preparar equipos: ${plan.title || plan.project.name}`;
  const description = [
    "Tener listos los equipos para la grabación.",
    itemNames.length ? `\nEquipos (${plan.items.length}):\n${itemNames.join("\n")}` : "",
  ].join("");

  if (plan.taskId) {
    await db.task.update({
      where: { id: plan.taskId },
      data: { title, description, assigneeId: plan.assigneeId, dueDate: plan.shootDate, shootDate: plan.shootDate },
    });
  } else if (plan.assigneeId) {
    const task = await db.task.create({
      data: {
        projectId: plan.projectId,
        title,
        description,
        assigneeId: plan.assigneeId,
        dueDate: plan.shootDate,
        shootDate: plan.shootDate,
        priority: "ALTA" as never,
        ownerId: plan.createdById,
        assignedById: plan.createdById,
      },
    });
    await db.equipmentPlan.update({ where: { id: planId }, data: { taskId: task.id } });
  }
}

// ── Kits ──
export async function applyKit(planId: string, kitId: string) {
  const { plan } = await ensurePlanWrite(planId);
  const kit = await db.equipmentKit.findUnique({ where: { id: kitId }, select: { items: { select: { rowId: true, quantity: true } } } });
  if (!kit) return;
  for (const it of kit.items) {
    await db.equipmentReservation.upsert({
      where: { planId_rowId: { planId, rowId: it.rowId } },
      create: { planId, rowId: it.rowId, quantity: it.quantity },
      update: {},
    });
  }
  if (plan.taskId) await syncMirrorTask(planId);
  refresh(plan.projectId);
}

export async function savePlanAsKit(planId: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { session, plan } = await ensurePlanWrite(planId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Ponle un nombre al kit." };
  const exists = await db.equipmentKit.findUnique({ where: { name }, select: { id: true } });
  if (exists) return { ok: false, error: "Ya existe un kit con ese nombre." };
  const items = await db.equipmentReservation.findMany({ where: { planId }, select: { rowId: true, quantity: true } });
  if (!items.length) return { ok: false, error: "Agrega equipos antes de guardar el kit." };
  await db.equipmentKit.create({
    data: {
      name,
      emoji: String(formData.get("emoji") ?? "").trim() || "🎒",
      createdById: session.id,
      items: { create: items.map((i) => ({ rowId: i.rowId, quantity: i.quantity })) },
    },
  });
  refresh(plan.projectId);
  return { ok: true };
}

export async function deleteKit(kitId: string, projectId: string) {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  if (session.role !== "admin") {
    // Solo admin o el creador pueden borrar un kit (compartido por todo el equipo).
    const kit = await db.equipmentKit.findUnique({ where: { id: kitId }, select: { createdById: true } });
    if (!kit || kit.createdById !== session.id) throw new Error("No autorizado");
  }
  await db.equipmentKit.delete({ where: { id: kitId } });
  refresh(projectId);
}
