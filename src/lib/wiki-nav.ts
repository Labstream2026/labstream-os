import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { buildWikiTree } from "@/lib/wiki-tree";
import { WIKI_SECTIONS } from "@/lib/wiki-templates";
import { getInventoryTableId } from "@/lib/wiki-tables";
import { WIKI_REVIEW_STALE_DAYS } from "@/lib/wiki-templates";
import { MATERIAL_EXPIRY_SOON_DAYS } from "@/lib/material-health";

// Datos del árbol lateral de la Wiki. Vive aquí porque lo montan TRES layouts: /wiki,
// /plantillas y /biblioteca — que están fuera de esa carpeta pero pertenecen al mismo
// espacio (y sin esto se quedaban sin ninguna salida en escritorio).

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

  // Alertas vivas de las herramientas (equipos que requieren atención): viajan como chip en
  // su fila del árbol.
  const invTableId = await getInventoryTableId();
  const invEstadoCol = await db.dataColumn.findFirst({ where: { tableId: invTableId, name: "Estado" }, select: { id: true } });
  const estadoCells = invEstadoCol
    ? await db.dataCell.findMany({ where: { columnId: invEstadoCol.id }, select: { value: true } })
    : [];

  // La bóveda de contraseñas y la Biblioteca tienen su propio permiso: si no lo tienen, su
  // fila no se pinta. Las páginas ya redirigen por su cuenta; esto solo evita ofrecer un
  // callejón sin salida.
  const session = await getSession();
  const canSeePasswords = hasPermission(session, "ver_contrasenas");
  const canBiblioteca = hasPermission(session, "ver_biblioteca");

  // Aviso de la Biblioteca: discos activos sin verificar hace más de seis meses MÁS material
  // cuya caducidad ya pasó o llega en 30 días. Solo se consulta si la persona puede entrar.
  //
  // Va envuelto en try/catch a propósito. Este cálculo vive en `loadWikiNav`, que monta el
  // LAYOUT de /wiki, /plantillas y /biblioteca: si reventara —por ejemplo con el código nuevo
  // desplegado y la migración de `expiresAt` todavía sin aplicar— no se caería un chip, se
  // caerían las tres secciones enteras. Con la red, lo peor que pasa es que el chip diga 0.
  let alertBiblioteca = 0;
  if (canBiblioteca) {
    try {
      const limite = new Date(ahora + MATERIAL_EXPIRY_SOON_DAYS * 86400000);
      const [discos, porVencer] = await Promise.all([
        db.storageDisk.findMany({ where: { status: "ACTIVO" }, select: { lastCheckAt: true } }),
        // Mismo conjunto que pinta el mapa (proyectos sin archivar), o el número no cuadraría.
        db.materialLocation.count({ where: { expiresAt: { lte: limite }, project: { archivedAt: null } } }),
      ]);
      const sinVerificar = discos.filter((d) => ahora - (d.lastCheckAt?.getTime() ?? 0) > 180 * 86400000).length;
      alertBiblioteca = sinVerificar + porVencer;
    } catch {
      alertBiblioteca = 0;
    }
  }

  return {
    grupos: buildWikiTree(pages, WIKI_SECTIONS),
    canSeePasswords,
    canBiblioteca,
    alertBiblioteca,
    alertSalud,
    todas: pages.map((p) => ({ id: p.id, title: p.title, icon: p.icon })),
    alertInventario: estadoCells.filter((c) => c.value === "en-mantenimiento" || c.value === "danado").length,
  };
}
