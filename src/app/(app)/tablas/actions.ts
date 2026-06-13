"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { notify } from "@/lib/notify";

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
  const name = String(formData.get("name") ?? "").trim() || "Tabla";
  await db.dataTable.create({ data: { name, projectId, ...DEFAULT_TABLE } });
  revalidatePath(`/proyectos/${projectId}`);
}

export async function createTableForWiki(wikiPageId: string, formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim() || "Tabla";
  await db.dataTable.create({ data: { name, wikiPageId, ...DEFAULT_TABLE } });
  revalidatePath(`/wiki/${wikiPageId}`);
}

export async function addColumn(tableId: string, name: string, type: string) {
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
  const col = await db.dataColumn.update({ where: { id: columnId }, data: { name: name.trim() || "Columna" } });
  await revalidateForTable(col.tableId);
}

export async function deleteColumn(columnId: string) {
  const col = await db.dataColumn.delete({ where: { id: columnId } });
  await revalidateForTable(col.tableId);
}

export async function addRow(tableId: string) {
  const count = await db.dataRow.count({ where: { tableId } });
  await db.dataRow.create({ data: { tableId, position: count } });
  await revalidateForTable(tableId);
}

export async function deleteRow(rowId: string) {
  const row = await db.dataRow.delete({ where: { id: rowId } });
  await revalidateForTable(row.tableId);
}

export async function addSelectOption(columnId: string, label: string) {
  const col = await db.dataColumn.findUnique({ where: { id: columnId } });
  if (!col) return;
  const opts = (col.options as { id: string; label: string; color: string }[] | null) ?? [];
  const id = `o${Date.now().toString(36)}`;
  const colors = ["slate", "blue", "emerald", "amber", "violet", "rose", "cyan", "orange"];
  opts.push({ id, label: label.trim() || "Opción", color: colors[opts.length % colors.length] });
  await db.dataColumn.update({ where: { id: columnId }, data: { options: opts as never } });
  await revalidateForTable(col.tableId);
}

// Guarda una celda. PERSON → notifica al asignado.
export async function setCell(rowId: string, columnId: string, value: unknown) {
  const col = await db.dataColumn.findUnique({
    where: { id: columnId },
    include: { table: { select: { id: true, name: true, projectId: true } } },
  });
  if (!col) return;

  await db.dataCell.upsert({
    where: { rowId_columnId: { rowId, columnId } },
    create: { rowId, columnId, value: value as never },
    update: { value: value as never },
  });

  if (col.type === "PERSON" && typeof value === "string" && value) {
    await notify(value, {
      type: "mention",
      title: `Te asignaron en "${col.table.name}"`,
      body: `Columna ${col.name}`,
      link: col.table.projectId ? `/proyectos/${col.table.projectId}?tab=tablas` : undefined,
    });
  }
  await revalidateForTable(col.tableId);
}

// Celda EVENT: crea una cita de calendario y la envía (notifica) a la persona invitada.
export async function setEventCell(
  rowId: string,
  columnId: string,
  data: { title: string; start: string; attendeeId: string },
) {
  const col = await db.dataColumn.findUnique({
    where: { id: columnId },
    include: { table: { select: { id: true, name: true, projectId: true } } },
  });
  if (!col) return;
  const me = await getCurrentUser();

  const event = await db.calendarEvent.create({
    data: {
      title: data.title.trim() || `Cita · ${col.table.name}`,
      start: new Date(data.start),
      projectId: col.table.projectId,
      createdById: me?.id ?? null,
      attendees: data.attendeeId ? { create: [{ userId: data.attendeeId }] } : undefined,
    },
  });

  await db.dataCell.upsert({
    where: { rowId_columnId: { rowId, columnId } },
    create: { rowId, columnId, value: { eventId: event.id, start: data.start, attendeeId: data.attendeeId } as never },
    update: { value: { eventId: event.id, start: data.start, attendeeId: data.attendeeId } as never },
  });

  if (data.attendeeId) {
    await notify(data.attendeeId, {
      type: "event",
      title: `Nueva cita: ${event.title}`,
      body: new Date(data.start).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }),
      link: "/calendario",
    });
  }
  revalidatePath("/calendario");
  await revalidateForTable(col.tableId);
}
