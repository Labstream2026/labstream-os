import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { buildWikiTree } from "@/lib/wiki-tree";
import { WIKI_SECTIONS } from "@/lib/wiki-templates";
import { getInventoryTableId, getLocationsTableId } from "@/lib/wiki-tables";
import { WIKI_REVIEW_STALE_DAYS } from "@/lib/wiki-templates";

// Datos del árbol lateral de la Wiki. Vive aquí porque lo montan DOS layouts: el de
// /wiki y el de /plantillas — que está fuera de esa carpeta pero pertenece al mismo
// espacio (y sin esto se quedaba sin ninguna salida en escritorio).

export async function loadWikiNav() {
  const pages = await db.wikiPage.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true, icon: true, section: true, parentId: true, updatedAt: true, ownerId: true, lastReviewedAt: true },
  });

  // Cuántas piden atención (vencidas o sin dueño): es el chip de «Salud del conocimiento».
  const staleMs = WIKI_REVIEW_STALE_DAYS * 86400000;
  const ahora = Date.now();
  const alertSalud = pages.filter(
    (p) => !p.ownerId || ahora - (p.lastReviewedAt?.getTime() ?? 0) > staleMs,
  ).length;

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

  // La bóveda de contraseñas y la Biblioteca tienen su propio permiso: si no lo tienen, su
  // fila no se pinta. Las páginas ya redirigen por su cuenta; esto solo evita ofrecer un
  // callejón sin salida.
  const session = await getSession();
  const canSeePasswords = hasPermission(session, "ver_contrasenas");
  const canBiblioteca = hasPermission(session, "ver_biblioteca");

  // Discos activos que llevan más de seis meses sin verificarse (o que nunca se verificaron):
  // es el aviso de la Biblioteca. Se consulta solo si la persona puede entrar.
  const discos = canBiblioteca
    ? await db.storageDisk.findMany({ where: { status: "ACTIVO" }, select: { lastCheckAt: true } })
    : [];
  const alertBiblioteca = discos.filter(
    (d) => ahora - (d.lastCheckAt?.getTime() ?? 0) > 180 * 86400000,
  ).length;

  return {
    grupos: buildWikiTree(pages, WIKI_SECTIONS),
    canSeePasswords,
    canBiblioteca,
    alertBiblioteca,
    alertSalud,
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
