import { db } from "@/lib/db";
import { wikiTemplate } from "@/lib/wiki-templates";

// Tablas globales únicas de la Wiki. Hoy solo queda INVENTARIO: se crea una sola vez con
// columnas predefinidas y luego el equipo puede añadir más columnas/opciones desde la tabla.
//
// «Ubicación del material» ya NO se crea: se fusionó con el Mapa del material de la Biblioteca
// (que sí enlaza proyectos y discos de verdad, aplica la regla 3-2-1 y alimenta el CSV, las
// etiquetas QR y el candado de cierre de proyecto). Lo único que aquella tabla sabía y el mapa
// no era la CADUCIDAD, que ahora vive en MaterialLocation.expiresAt. Ver findLocationsTableId.

// Página índice "Empieza aquí" del onboarding. Se siembra una sola vez (idempotente
// por templateKey "sys-start"); si se borra, se vuelve a crear al entrar a la Wiki.
export async function ensureStartHerePage(): Promise<void> {
  const existing = await db.wikiPage.findFirst({ where: { templateKey: "sys-start" }, select: { id: true } });
  if (existing) return;
  const tpl = wikiTemplate("onboarding");
  await db.wikiPage.create({
    data: {
      title: "Empieza aquí",
      icon: "👋",
      section: "Empieza aquí",
      templateKey: "sys-start",
      tags: ["onboarding"],
      content: tpl?.content ?? "",
    },
  });
}

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

/**
 * La tabla «Ubicación del material» se FUSIONÓ con el Mapa del material de la Biblioteca.
 *
 * Ya no se crea: esto es un buscador, no un getOrCreate. Antes se recreaba en CADA carga de
 * /wiki, /plantillas y /biblioteca (los tres montan WikiShell), así que borrarla no servía de
 * nada — volvía sola y vacía. Ahora, en una instalación nueva simplemente nunca existe.
 *
 * Devuelve null si nunca se creó. Donde SÍ existe se conserva íntegra y de solo lectura: es
 * el archivo de lo que el equipo escribió antes de la fusión, y de ahí se pasa al mapa a mano.
 */
export async function findLocationsTableId(): Promise<string | null> {
  const t = await db.dataTable.findUnique({ where: { key: "sys:ubicacion" }, select: { id: true } });
  return t?.id ?? null;
}
