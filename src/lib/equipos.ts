import { db } from "@/lib/db";
import { getInventoryTableId } from "@/lib/wiki-tables";

// Capa de "Equipos": conecta el inventario de la Wiki (tabla sys:inventario, donde cada
// fila = un equipo) con los planes de equipo por proyecto. Aquí viven los helpers de
// lectura del inventario y el cálculo de disponibilidad por fecha de grabación.

export type InventoryItem = {
  rowId: string;
  name: string;
  category: string | null;
  brand: string | null;
  photoUrl: string | null;
  status: string | null;
  location: string | null;
  tags: string[]; // etiquetas legibles (no ids)
  quantity: number; // unidades totales en el inventario
};

export type TagOption = { id: string; label: string; color: string };

// Normaliza una fecha (YYYY-MM-DD) al mediodía UTC, convención del proyecto para fechas
// "de pared" sin desfase de zona horaria.
export function dayUTC(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

// Rango [00:00, 24:00) del día UTC de una fecha dada, para comparar "mismo día".
export function dayRangeUTC(d: Date): { gte: Date; lt: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const lt = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { gte: start, lt };
}

type ColMap = Record<string, { id: string; type: string; options: TagOption[] }>;

// Asegura que la tabla de inventario tenga una columna "Cantidad" (número). Idempotente:
// las tablas que ya existían (creadas antes de esta función) la reciben al vuelo.
export async function ensureInventoryQuantityColumn(tableId: string): Promise<void> {
  const existing = await db.dataColumn.findFirst({ where: { tableId, name: "Cantidad" }, select: { id: true } });
  if (existing) return;
  const count = await db.dataColumn.count({ where: { tableId } });
  await db.dataColumn.create({
    data: { tableId, name: "Cantidad", type: "NUMBER" as never, position: count },
  });
}

// Carga el inventario completo como lista de equipos, más el catálogo de tags y categorías.
export async function loadInventory(): Promise<{
  items: InventoryItem[];
  tags: TagOption[];
  categories: string[];
}> {
  const tableId = await getInventoryTableId();
  await ensureInventoryQuantityColumn(tableId);

  const table = await db.dataTable.findUnique({
    where: { id: tableId },
    include: {
      columns: { orderBy: { position: "asc" } },
      rows: { orderBy: { position: "asc" }, take: 2000, include: { cells: true } },
    },
  });
  if (!table) return { items: [], tags: [], categories: [] };

  const byName: ColMap = {};
  for (const c of table.columns) {
    byName[c.name] = { id: c.id, type: c.type, options: (c.options as TagOption[] | null) ?? [] };
  }
  const tagsCol = byName["Tags"];
  const catCol = byName["Categoría"];

  const optLabel = (col: { options: TagOption[] } | undefined, id: unknown): string =>
    col?.options.find((o) => o.id === id)?.label ?? (typeof id === "string" ? id : "");

  const items: InventoryItem[] = table.rows
    .map((r) => {
      const cell = (colName: string): unknown => {
        const col = byName[colName];
        if (!col) return undefined;
        return r.cells.find((c) => c.columnId === col.id)?.value;
      };
      const name = String(cell("Nombre") ?? "").trim();
      const tagIds = cell("Tags");
      const tags = Array.isArray(tagIds) ? tagIds.map((id) => optLabel(tagsCol, id)).filter(Boolean) : [];
      const qtyRaw = cell("Cantidad");
      const quantity = Math.max(1, Number(qtyRaw) || 1);
      return {
        rowId: r.id,
        name,
        category: optLabel(catCol, cell("Categoría")) || null,
        brand: optLabel(byName["Marca"], cell("Marca")) || null,
        photoUrl: (cell("Foto") as string) || null,
        status: optLabel(byName["Estado"], cell("Estado")) || null,
        location: (cell("Localización") as string) || null,
        tags,
        quantity,
      };
    })
    // Solo equipos con nombre (ignora filas vacías sembradas).
    .filter((it) => it.name.length > 0);

  const categories = [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort();
  return { items, tags: tagsCol?.options ?? [], categories };
}

// Suma de unidades ya reservadas por fila (equipo) en OTROS planes que caen el mismo día.
// Devuelve un Map rowId → unidades reservadas en otra parte ese día.
export async function reservedElsewhereByDate(
  shootDate: Date,
  excludePlanId?: string,
): Promise<Map<string, number>> {
  const { gte, lt } = dayRangeUTC(shootDate);
  const rows = await db.equipmentReservation.findMany({
    where: {
      plan: { shootDate: { gte, lt }, ...(excludePlanId ? { id: { not: excludePlanId } } : {}) },
    },
    select: { rowId: true, quantity: true, plan: { select: { id: true, title: true, project: { select: { name: true, code: true } } } } },
  });
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.rowId, (map.get(r.rowId) ?? 0) + r.quantity);
  return map;
}

// Clave de día UTC (shootDate va anclada a mediodía UTC → el ISO YYYY-MM-DD es su día).
function dayKeyUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Versión EN LOTE de conflictsByDate para VARIOS planes: una sola consulta cubre todos los
// días de los planes (en vez de N consultas, una por plan). Devuelve planId → (rowId →
// {qty, where}) con los conflictos de CADA plan (reservas del mismo día en OTROS planes).
export async function conflictsForPlans(
  plans: { id: string; shootDate: Date }[],
): Promise<Map<string, Map<string, { qty: number; where: string[] }>>> {
  const result = new Map<string, Map<string, { qty: number; where: string[] }>>();
  if (!plans.length) return result;
  // Rango por día ÚNICO (varios planes pueden caer el mismo día) → OR de rangos = 1 consulta.
  const dayRanges = new Map<string, { gte: Date; lt: Date }>();
  for (const p of plans) {
    const key = dayKeyUTC(p.shootDate);
    if (!dayRanges.has(key)) dayRanges.set(key, dayRangeUTC(p.shootDate));
  }
  const rows = await db.equipmentReservation.findMany({
    where: { plan: { OR: [...dayRanges.values()].map((d) => ({ shootDate: { gte: d.gte, lt: d.lt } })) } },
    select: {
      rowId: true,
      quantity: true,
      plan: { select: { id: true, shootDate: true, title: true, project: { select: { name: true } } } },
    },
  });
  // Agrupa reservas por día.
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = dayKeyUTC(r.plan.shootDate);
    const arr = byDay.get(k);
    if (arr) arr.push(r);
    else byDay.set(k, [r]);
  }
  // Para cada plan, suma las reservas de SU día EXCLUYÉNDOSE a sí mismo (por planId, no por día).
  for (const p of plans) {
    const dayRows = byDay.get(dayKeyUTC(p.shootDate)) ?? [];
    const map = new Map<string, { qty: number; where: string[] }>();
    for (const r of dayRows) {
      if (r.plan.id === p.id) continue;
      const prev = map.get(r.rowId) ?? { qty: 0, where: [] };
      const label = r.plan.title || r.plan.project?.name || "otra grabación";
      map.set(r.rowId, { qty: prev.qty + r.quantity, where: prev.where.includes(label) ? prev.where : [...prev.where, label] });
    }
    result.set(p.id, map);
  }
  return result;
}
