"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getCurrentUser } from "@/lib/current-user";
import { canAccessProject } from "@/lib/project-access";
import { canSeeWiki } from "@/lib/wiki-access";
import { notify } from "@/lib/notify";
import { pushEventToSynology, deleteEventFromSynology } from "@/lib/caldav";
import { logActivity } from "@/lib/activity";
import { saveBufferWithPreview } from "@/lib/image";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// projectId de una tabla (para registrar actividad; null si la tabla es de wiki).
async function projectIdOfTable(tableId: string): Promise<string | null> {
  const t = await db.dataTable.findUnique({ where: { id: tableId }, select: { projectId: true } });
  return t?.projectId ?? null;
}

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
} as const;

// Acceso a una tabla: si cuelga de un proyecto → acceso al proyecto; si es de wiki
// o suelta → basta sesión (la wiki es del equipo). Lanza si no hay acceso.
async function ensureTableAccess(tableId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("No autorizado");
  const t = await db.dataTable.findUnique({
    where: { id: tableId },
    select: { projectId: true, project: { select: accessSelect } },
  });
  if (!t) throw new Error("No autorizado");
  if (t.project) {
    if (!canAccessProject(t.project, session)) throw new Error("No autorizado");
  } else {
    // Tablas de wiki o globales (inventario/ubicación): solo equipo interno (no invitados).
    if (!(await canSeeWiki(session))) throw new Error("No autorizado");
  }
}

// Acceso vía columna o fila (resuelven su tableId primero).
async function ensureColumnAccess(columnId: string): Promise<string> {
  const col = await db.dataColumn.findUnique({ where: { id: columnId }, select: { tableId: true } });
  if (!col) throw new Error("No autorizado");
  await ensureTableAccess(col.tableId);
  return col.tableId;
}
async function ensureRowAccess(rowId: string): Promise<string> {
  const row = await db.dataRow.findUnique({ where: { id: rowId }, select: { tableId: true } });
  if (!row) throw new Error("No autorizado");
  await ensureTableAccess(row.tableId);
  return row.tableId;
}

async function ensureProjectAccess(projectId: string): Promise<void> {
  const session = await getSession();
  const project = await db.project.findUnique({ where: { id: projectId }, select: accessSelect });
  if (!project || !canAccessProject(project, session)) throw new Error("No autorizado");
}

async function revalidateForTable(tableId: string) {
  const t = await db.dataTable.findUnique({ where: { id: tableId }, select: { projectId: true, wikiPageId: true } });
  if (t?.projectId) revalidatePath(`/proyectos/${t.projectId}`);
  if (t?.wikiPageId) revalidatePath(`/wiki/${t.wikiPageId}`);
}

const DEFAULT_TABLE = {
  columns: {
    create: [
      { name: "Nombre", type: "TEXT" as const, position: 0 },
      { name: "Estado", type: "SELECT" as const, position: 1, options: [
        { id: "todo", label: "Por hacer", color: "slate" },
        { id: "doing", label: "En curso", color: "blue" },
        { id: "done", label: "Hecho", color: "emerald" },
      ] },
      { name: "Responsable", type: "PERSON" as const, position: 2 },
      { name: "Fecha", type: "DATE" as const, position: 3 },
    ],
  },
  rows: { create: [{ position: 0 }, { position: 1 }] },
};

export async function createTable(projectId: string, formData: FormData): Promise<void> {
  await ensureProjectAccess(projectId);
  const name = String(formData.get("name") ?? "").trim() || "Tabla";
  const table = await db.dataTable.create({ data: { name, projectId, ...DEFAULT_TABLE } });
  await logActivity({ action: "table.create", summary: `creó la tabla «${name}»`, projectId, entityType: "table", entityId: table.id });
  revalidatePath(`/proyectos/${projectId}`);
}

// Eliminar una tabla completa (queda registrado quién y cuándo).
export async function deleteTable(tableId: string): Promise<void> {
  await ensureTableAccess(tableId);
  const table = await db.dataTable.findUnique({ where: { id: tableId }, select: { name: true, projectId: true, wikiPageId: true } });
  if (!table) return;
  await db.dataTable.delete({ where: { id: tableId } });
  if (table.projectId) {
    await logActivity({ action: "table.delete", summary: `eliminó la tabla «${table.name}»`, projectId: table.projectId, entityType: "table", entityId: tableId });
    revalidatePath(`/proyectos/${table.projectId}`);
  }
  if (table.wikiPageId) revalidatePath(`/wiki/${table.wikiPageId}`);
}

export async function createTableForWiki(wikiPageId: string, formData: FormData): Promise<void> {
  const session = await getSession();
  if (!session || !(await canSeeWiki(session))) throw new Error("No autorizado");
  const name = String(formData.get("name") ?? "").trim() || "Tabla";
  await db.dataTable.create({ data: { name, wikiPageId, ...DEFAULT_TABLE } });
  revalidatePath(`/wiki/${wikiPageId}`);
}

export async function addColumn(tableId: string, name: string, type: string) {
  await ensureTableAccess(tableId);
  const count = await db.dataColumn.count({ where: { tableId } });
  const options =
    type === "SELECT"
      ? [
          { id: "a", label: "Opción 1", color: "slate" },
          { id: "b", label: "Opción 2", color: "blue" },
        ]
      : undefined;
  await db.dataColumn.create({
    data: { tableId, name: name.trim() || "Columna", type: type as never, position: count, options: options as never },
  });
  await revalidateForTable(tableId);
}

export async function renameColumn(columnId: string, name: string) {
  await ensureColumnAccess(columnId);
  const col = await db.dataColumn.update({ where: { id: columnId }, data: { name: name.trim() || "Columna" } });
  await revalidateForTable(col.tableId);
}

export async function deleteColumn(columnId: string) {
  await ensureColumnAccess(columnId);
  const before = await db.dataColumn.findUnique({ where: { id: columnId }, select: { name: true, tableId: true } });
  const col = await db.dataColumn.delete({ where: { id: columnId } });
  const projectId = await projectIdOfTable(col.tableId);
  if (projectId) await logActivity({ action: "table.column.delete", summary: `eliminó la columna «${before?.name ?? ""}» de una tabla`, projectId, entityType: "table", entityId: col.tableId });
  await revalidateForTable(col.tableId);
}

export async function addRow(tableId: string) {
  await ensureTableAccess(tableId);
  const count = await db.dataRow.count({ where: { tableId } });
  await db.dataRow.create({ data: { tableId, position: count } });
  await revalidateForTable(tableId);
}

export async function deleteRow(rowId: string) {
  await ensureRowAccess(rowId);
  const row = await db.dataRow.delete({ where: { id: rowId } });
  const projectId = await projectIdOfTable(row.tableId);
  if (projectId) await logActivity({ action: "table.row.delete", summary: `eliminó una fila de una tabla`, projectId, entityType: "table", entityId: row.tableId });
  await revalidateForTable(row.tableId);
}

export async function addSelectOption(columnId: string, label: string) {
  await ensureColumnAccess(columnId);
  const col = await db.dataColumn.findUnique({ where: { id: columnId } });
  if (!col) return;
  const opts = (col.options as { id: string; label: string; color: string }[] | null) ?? [];
  const id = `o${Date.now().toString(36)}`;
  const colors = ["slate", "blue", "emerald", "amber", "violet", "rose", "cyan", "orange"];
  opts.push({ id, label: label.trim() || "Opción", color: colors[opts.length % colors.length] });
  await db.dataColumn.update({ where: { id: columnId }, data: { options: opts as never } });
  await revalidateForTable(col.tableId);
}

// ¿Es un id de usuario real y activo del equipo? (evita notificar/invitar a ids arbitrarios)
async function isRealUser(id: unknown): Promise<boolean> {
  if (typeof id !== "string" || !id) return false;
  const u = await db.user.findFirst({ where: { id, active: true }, select: { id: true } });
  return Boolean(u);
}

// Sube una imagen a una celda IMAGE (se guarda en el NAS) y guarda su URL.
export async function uploadCellImage(rowId: string, columnId: string, formData: FormData) {
  await ensureRowAccess(rowId);
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return;
  if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) return;
  const buf = Buffer.from(await file.arrayBuffer());
  const key = `${rowId}-${columnId}`.replace(/[^a-zA-Z0-9-]/g, "");
  await saveBufferWithPreview("tableimg", key, buf, file.type);
  const url = `/api/img/${key}?v=${Date.now()}`;
  await db.dataCell.upsert({
    where: { rowId_columnId: { rowId, columnId } },
    create: { rowId, columnId, value: url as never },
    update: { value: url as never },
  });
  const col = await db.dataColumn.findUnique({ where: { id: columnId }, select: { tableId: true } });
  if (col) await revalidateForTable(col.tableId);
}

// Guarda una celda. PERSON → notifica al asignado. PASSWORD → cifra el valor.
export async function setCell(rowId: string, columnId: string, value: unknown) {
  await ensureRowAccess(rowId);
  const col = await db.dataColumn.findUnique({
    where: { id: columnId },
    include: { table: { select: { id: true, name: true, projectId: true } } },
  });
  if (!col) return;

  // Las contraseñas se guardan cifradas (nunca en claro en la BD).
  let stored: unknown = value;
  if (col.type === "PASSWORD" && typeof value === "string") {
    stored = value ? encryptSecret(value) : "";
  }

  await db.dataCell.upsert({
    where: { rowId_columnId: { rowId, columnId } },
    create: { rowId, columnId, value: stored as never },
    update: { value: stored as never },
  });

  if (col.type === "PERSON" && typeof value === "string" && value && (await isRealUser(value))) {
    await notify(value, {
      type: "mention",
      title: `Te asignaron en "${col.table.name}"`,
      body: `Columna ${col.name}`,
      link: col.table.projectId ? `/proyectos/${col.table.projectId}?tab=tablas` : undefined,
    });
  }
  await revalidateForTable(col.tableId);
}

// Revela (descifra) el valor de una celda PASSWORD bajo demanda, con control de acceso.
export async function revealCell(rowId: string, columnId: string): Promise<string> {
  await ensureRowAccess(rowId);
  const cell = await db.dataCell.findUnique({ where: { rowId_columnId: { rowId, columnId } }, select: { value: true } });
  const v = cell?.value;
  if (typeof v !== "string" || !v) return "";
  return decryptSecret(v);
}

// Celda EVENT: crea o ACTUALIZA la cita (no duplica) y la notifica al invitado.
export async function setEventCell(
  rowId: string,
  columnId: string,
  data: { title: string; start: string; attendeeId: string },
) {
  await ensureRowAccess(rowId);
  const start = new Date(data.start);
  if (Number.isNaN(start.getTime())) return; // fecha inválida → no crear basura
  const col = await db.dataColumn.findUnique({
    where: { id: columnId },
    include: { table: { select: { id: true, name: true, projectId: true } } },
  });
  if (!col) return;
  const me = await getCurrentUser();
  const attendeeId = (await isRealUser(data.attendeeId)) ? data.attendeeId : null;
  const title = data.title.trim() || `Cita · ${col.table.name}`;

  // Si la celda ya tiene una cita, se ACTUALIZA esa misma (evita duplicados en BD/CalDAV).
  const existing = await db.dataCell.findUnique({ where: { rowId_columnId: { rowId, columnId } }, select: { value: true } });
  const prevEventId = (existing?.value as { eventId?: string } | null)?.eventId;

  let event;
  if (prevEventId && (await db.calendarEvent.findUnique({ where: { id: prevEventId }, select: { id: true } }))) {
    await db.calendarAttendee.deleteMany({ where: { eventId: prevEventId } });
    event = await db.calendarEvent.update({
      where: { id: prevEventId },
      data: { title, start, attendees: attendeeId ? { create: [{ userId: attendeeId }] } : undefined },
    });
  } else {
    event = await db.calendarEvent.create({
      data: {
        title,
        start,
        projectId: col.table.projectId,
        createdById: me?.id ?? null,
        attendees: attendeeId ? { create: [{ userId: attendeeId }] } : undefined,
      },
    });
  }

  // Sincroniza la cita al Synology Calendar del equipo (auto, best-effort; idempotente por uid).
  await pushEventToSynology({ uid: event.id, title: event.title, start: event.start });

  await db.dataCell.upsert({
    where: { rowId_columnId: { rowId, columnId } },
    create: { rowId, columnId, value: { eventId: event.id, start: data.start, attendeeId } as never },
    update: { value: { eventId: event.id, start: data.start, attendeeId } as never },
  });

  if (attendeeId) {
    await notify(attendeeId, {
      type: "event",
      title: `Nueva cita: ${event.title}`,
      body: new Date(data.start).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }),
      link: "/calendario",
    });
  }
  revalidatePath("/calendario");
  await revalidateForTable(col.tableId);
}

// Borra la cita de una celda EVENT (de la BD y del Synology Calendar) y limpia la celda.
export async function deleteEventCell(rowId: string, columnId: string) {
  await ensureRowAccess(rowId);
  const cell = await db.dataCell.findUnique({ where: { rowId_columnId: { rowId, columnId } }, select: { value: true } });
  const eventId = (cell?.value as { eventId?: string } | null)?.eventId;
  if (eventId) {
    await db.calendarEvent.delete({ where: { id: eventId } }).catch(() => null);
    await deleteEventFromSynology(eventId);
    revalidatePath("/calendario");
  }
  await db.dataCell.upsert({
    where: { rowId_columnId: { rowId, columnId } },
    create: { rowId, columnId, value: undefined as never },
    update: { value: undefined as never },
  });
  const col = await db.dataColumn.findUnique({ where: { id: columnId }, select: { tableId: true } });
  if (col) await revalidateForTable(col.tableId);
}
