import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canSeeWiki } from "@/lib/wiki-access";
import { db } from "@/lib/db";
import { buildWikiTree } from "@/lib/wiki-tree";
import { WIKI_SECTIONS } from "@/lib/wiki-templates";
import { WikiSidebar } from "@/components/wiki/wiki-sidebar";
import { getInventoryTableId, getLocationsTableId } from "@/lib/wiki-tables";

// La Wiki (y todas sus secciones) es solo para el equipo interno. Los invitados
// (freelancer/cliente o usuarios marcados como invitado) no pueden entrar.
export default async function WikiLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!(await canSeeWiki(session))) redirect("/");

  // Árbol de navegación: acompaña a TODAS las pantallas de la Wiki, para que una página
  // deje de ser una isla desde la que solo se puede volver al índice.
  const pages = await db.wikiPage.findMany({
    orderBy: { title: "asc" },
    select: { id: true, title: true, icon: true, section: true, parentId: true, updatedAt: true },
  });
  const grupos = buildWikiTree(pages, WIKI_SECTIONS);

  // Mismas alertas vivas que ya se calculan en el índice, aquí como chip de la herramienta.
  const [invTableId, locTableId] = await Promise.all([getInventoryTableId(), getLocationsTableId()]);
  const [invEstadoCol, locCadCol] = await Promise.all([
    db.dataColumn.findFirst({ where: { tableId: invTableId, name: "Estado" }, select: { id: true } }),
    db.dataColumn.findFirst({ where: { tableId: locTableId, name: "Caducidad" }, select: { id: true } }),
  ]);
  const [estadoCells, cadCells] = await Promise.all([
    invEstadoCol ? db.dataCell.findMany({ where: { columnId: invEstadoCol.id }, select: { value: true } }) : Promise.resolve([]),
    locCadCol ? db.dataCell.findMany({ where: { columnId: locCadCol.id }, select: { value: true } }) : Promise.resolve([]),
  ]);
  const alertInventario = estadoCells.filter((c) => c.value === "en-mantenimiento" || c.value === "danado").length;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const alertMaterial = cadCells.filter((c) => {
    if (typeof c.value !== "string" || !c.value) return false;
    const d = new Date(c.value + "T00:00:00");
    if (Number.isNaN(d.getTime())) return false;
    return Math.round((d.getTime() - hoy.getTime()) / 86400000) <= 30;
  }).length;

  return (
    // El árbol se esconde en móvil (allí manda el índice y la barra inferior de la app):
    // 224 px de barra en una pantalla de teléfono no dejarían leer nada.
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-0 h-[calc(100dvh-var(--pwa-nav-h,0px)-3.5rem)]">
          <WikiSidebar grupos={grupos} alertInventario={alertInventario} alertMaterial={alertMaterial} />
        </div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
