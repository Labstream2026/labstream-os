import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { buildWikiTree } from "@/lib/wiki-tree";
import { WIKI_SECTIONS } from "@/lib/wiki-templates";
import { getInventoryTableId, getLocationsTableId } from "@/lib/wiki-tables";

// Datos del árbol lateral de la Wiki. Vive aquí porque lo montan DOS layouts: el de
// /wiki y el de /plantillas — que está fuera de esa carpeta pero pertenece al mismo
// espacio (y sin esto se quedaba sin ninguna salida en escritorio).

export async function loadWikiNav() {
  const pages = await db.wikiPage.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true, icon: true, section: true, parentId: true, updatedAt: true },
  });

  // Alertas vivas de las herramientas (equipos que requieren atención, respaldos por
  // vencer): viajan como chip en su fila del árbol.
  const [invTableId, locTableId] = await Promise.all([getInventoryTableId(), getLocationsTableId()]);
  const [invEstadoCol, locCadCol] = await Promise.all([
    db.dataColumn.findFirst({ where: { tableId: invTableId, name: "Estado" }, select: { id: true } }),
    db.dataColumn.findFirst({ where: { tableId: locTableId, name: "Caducidad" }, select: { id: true } }),
  ]);
  const [estadoCells, cadCells] = await Promise.all([
    invEstadoCol ? db.dataCell.findMany({ where: { columnId: invEstadoCol.id }, select: { value: true } }) : Promise.resolve([]),
    locCadCol ? db.dataCell.findMany({ where: { columnId: locCadCol.id }, select: { value: true } }) : Promise.resolve([]),
  ]);

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  // La bóveda de contraseñas tiene su propio permiso: si no lo tiene, su fila no se pinta.
  // La página ya redirige por su cuenta; esto solo evita ofrecer un callejón sin salida.
  const canSeePasswords = hasPermission(await getSession(), "ver_contrasenas");

  return {
    grupos: buildWikiTree(pages, WIKI_SECTIONS),
    canSeePasswords,
    todas: pages.map((p) => ({ id: p.id, title: p.title, icon: p.icon })),
    alertInventario: estadoCells.filter((c) => c.value === "en-mantenimiento" || c.value === "danado").length,
    alertMaterial: cadCells.filter((c) => {
      if (typeof c.value !== "string" || !c.value) return false;
      const d = new Date(c.value + "T00:00:00");
      if (Number.isNaN(d.getTime())) return false;
      return Math.round((d.getTime() - hoy.getTime()) / 86400000) <= 30;
    }).length,
  };
}
