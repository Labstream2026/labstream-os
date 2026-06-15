import { db } from "@/lib/db";

// Tablas globales únicas de la Wiki (Inventario y Ubicación del material).
// Se crean una sola vez con columnas predefinidas; luego el equipo puede añadir
// más columnas/opciones desde la propia tabla.

type Opt = { id: string; label: string; color: string };
const opt = (label: string, color: string): Opt => ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), label, color });

const INVENTORY_COLUMNS = [
  { name: "Foto", type: "IMAGE" as const },
  { name: "Nombre", type: "TEXT" as const },
  { name: "Serial", type: "TEXT" as const },
  { name: "Marca", type: "SELECT" as const, options: [opt("Sony", "blue"), opt("Canon", "rose"), opt("Blackmagic", "slate"), opt("DJI", "amber"), opt("Aputure", "violet"), opt("Rode", "emerald")] },
  { name: "Categoría", type: "SELECT" as const, options: [opt("Cámara", "blue"), opt("Lente", "cyan"), opt("Streaming", "violet"), opt("Audio", "emerald"), opt("Iluminación", "amber"), opt("Trípode/Soporte", "slate"), opt("Cómputo", "indigo"), opt("Almacenamiento", "teal"), opt("Otro", "gray")] },
  { name: "Tags", type: "MULTISELECT" as const, options: [opt("4K", "blue"), opt("Inalámbrico", "violet"), opt("Kit rodaje", "amber"), opt("Portátil", "emerald")] },
  { name: "Estado", type: "SELECT" as const, options: [opt("Operativo", "emerald"), opt("En préstamo", "amber"), opt("En mantenimiento", "violet"), opt("Dañado", "rose"), opt("De baja", "slate")] },
  { name: "Localización", type: "TEXT" as const },
];

const LOCATION_COLUMNS = [
  { name: "Cliente", type: "MULTISELECT" as const, options: [] as Opt[] }, // se siembra con los clientes
  { name: "Proyecto", type: "TEXT" as const },
  { name: "Disco", type: "SELECT" as const, options: [opt("Disco 1", "blue"), opt("Disco 2", "cyan"), opt("NAS", "emerald"), opt("LTO/Backup", "slate")] },
  { name: "Ruta", type: "TEXT" as const },
  { name: "Optimizado", type: "SELECT" as const, options: [opt("Sí", "emerald"), opt("No", "rose")] },
  { name: "Respaldo en 2 discos", type: "CHECKBOX" as const },
  { name: "Responsable", type: "PERSON" as const },
  { name: "Capacidad", type: "TEXT" as const },
  { name: "Fecha del material", type: "DATE" as const },
  { name: "Caducidad", type: "DATE" as const },
  { name: "Notas", type: "LONGTEXT" as const },
];

async function getOrCreate(key: string, name: string, columns: { name: string; type: string; options?: Opt[] }[], seedRows = 0) {
  const existing = await db.dataTable.findUnique({ where: { key }, select: { id: true } });
  if (existing) return existing.id;
  const created = await db.dataTable.create({
    data: {
      key,
      name,
      columns: {
        create: columns.map((c, i) => ({
          name: c.name,
          type: c.type as never,
          position: i,
          options: (c.options && c.options.length ? c.options : undefined) as never,
        })),
      },
      rows: { create: Array.from({ length: seedRows }, (_, i) => ({ position: i })) },
    },
    select: { id: true },
  });
  return created.id;
}

export async function getInventoryTableId(): Promise<string> {
  return getOrCreate("sys:inventario", "Inventario", INVENTORY_COLUMNS, 2);
}

export async function getLocationsTableId(): Promise<string> {
  const id = await getOrCreate("sys:ubicacion", "Ubicación del material", LOCATION_COLUMNS, 1);
  // Siembra las opciones del multiselect "Cliente" con los clientes actuales (una vez).
  const clienteCol = await db.dataColumn.findFirst({ where: { tableId: id, name: "Cliente" }, select: { id: true, options: true } });
  if (clienteCol && (!clienteCol.options || (clienteCol.options as unknown[]).length === 0)) {
    const clients = await db.client.findMany({ orderBy: { name: "asc" }, select: { name: true } });
    if (clients.length) {
      await db.dataColumn.update({
        where: { id: clienteCol.id },
        data: { options: clients.map((c) => opt(c.name, "indigo")) as never },
      });
    }
  }
  return id;
}
