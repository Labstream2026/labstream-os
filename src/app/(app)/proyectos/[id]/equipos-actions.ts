"use server";

import { noAutorizado } from "@/lib/authz-error";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canWriteProject } from "@/lib/project-access";
import { validateAssignee } from "@/lib/task-assign";
import { logActivity } from "@/lib/activity";
import { notifyAndEmail } from "@/lib/notify";
import { dayUTC } from "@/lib/equipos";
import { bogotaNoon } from "@/lib/today";

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
  if (!plan || !canWriteProject(plan.project, session)) noAutorizado();
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
  if (!plan || !session) noAutorizado();
  const ok = plan.assigneeId === session.id || canWriteProject(plan.project, session);
  if (!ok) noAutorizado();
  return { session, plan };
}

// ── Planes (grabaciones) ──
export async function createPlan(projectId: string, formData: FormData) {
  const session = await getSession();
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  if (!project || !canWriteProject(project, session)) noAutorizado();
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
  if (plan.taskId) await syncMirrorTask(res.planId); // mantiene la lista de equipos de la tarea al día
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
  // El responsable debe ser del EQUIPO (nunca un cliente): la tarea espejo en "Mis tareas" no puede
  // quedar asignada a un usuario del portal cliente.
  const newId = await validateAssignee(plan.projectId, assigneeId || null, session);
  await db.equipmentPlan.update({ where: { id: planId }, data: { assigneeId: newId } });

  if (newId) {
    await syncMirrorTask(planId); // crea o reasigna la tarea espejo
    if (newId !== session.id) {
      const fechaCorta = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: "UTC" }).format(plan.shootDate);
      const nItems = await db.equipmentReservation.count({ where: { planId } });
      await notifyAndEmail(newId, {
        type: "task",
        event: "task_assigned",
        title: `Preparar equipos: ${plan.title || plan.project.name}`,
        body: `Proyecto «${plan.project.name}». Eres responsable de organizar y tener listos los equipos para la grabación del ${fechaCorta}${nItems ? ` (${nItems} equipo${nItems === 1 ? "" : "s"})` : ""}. La lista completa está en la tarea.`,
        link: `/proyectos/${plan.projectId}?tab=equipos`,
        actorId: session.id,
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
  // Resuelve la etiqueta de Marca (columna SELECT → su label) para mostrar el modelo "Sony ZV-E1".
  const marcaCol = await db.dataColumn.findFirst({ where: { name: "Marca", table: { key: "sys:inventario" } }, select: { options: true } });
  const marcaOpts = (marcaCol?.options as { id: string; label: string }[] | null) ?? [];
  const itemLines = plan.items.map((it) => {
    const cells = it.row.cells;
    const nombre = String(cells.find((c) => c.column.name === "Nombre")?.value ?? "Equipo");
    const marcaId = cells.find((c) => c.column.name === "Marca")?.value;
    const marca = marcaOpts.find((o) => o.id === marcaId)?.label ?? "";
    const serialV = cells.find((c) => c.column.name === "Serial")?.value;
    const serial = serialV ? String(serialV).trim() : "";
    const label = marca && !nombre.toLowerCase().includes(marca.toLowerCase()) ? `${marca} ${nombre}` : nombre;
    return `• ${label}${it.quantity > 1 ? ` ×${it.quantity}` : ""}${serial ? ` (serial ${serial})` : ""}`;
  });
  const fecha = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(plan.shootDate);
  const grabacion = plan.title || plan.project.name;
  const title = `🎒 Preparar equipos: ${grabacion}`;
  const description = [
    `Eres responsable de organizar y tener listos los equipos para la grabación «${grabacion}» del proyecto ${plan.project.name}, el ${fecha}.`,
    itemLines.length
      ? `\n\nEquipos a organizar (${plan.items.length}):\n${itemLines.join("\n")}`
      : "\n\n(Aún sin equipos en la lista; agrégalos en la pestaña Equipos del proyecto.)",
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
        startDate: bogotaNoon(), // empieza a prepararse hoy; entrega = día de grabación
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
  if (!session) noAutorizado();
  if (session.role !== "admin") {
    // Solo admin o el creador pueden borrar un kit (compartido por todo el equipo).
    const kit = await db.equipmentKit.findUnique({ where: { id: kitId }, select: { createdById: true } });
    if (!kit || kit.createdById !== session.id) noAutorizado();
  }
  await db.equipmentKit.delete({ where: { id: kitId } });
  refresh(projectId);
}
