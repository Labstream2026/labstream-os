import { db } from "@/lib/db";
import { DataTableView } from "@/components/tables/data-table";
import { cellsToMap } from "@/lib/table-cells";
import { getInventoryTableId } from "@/lib/wiki-tables";
import { getSession } from "@/lib/auth";
import { WikiTabs } from "../wiki-tabs";
import { ImportInventoryButton } from "./import-button";
import { ViewTabs } from "@/app/(app)/proyectos/[id]/view-tabs";
import { InventoryGallery } from "./inventory-gallery";

export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const tableId = await getInventoryTableId();
  const session = await getSession();
  const [table, team] = await Promise.all([
    db.dataTable.findUnique({
      where: { id: tableId },
      include: {
        columns: { orderBy: { position: "asc" } },
        rows: { orderBy: { position: "asc" }, take: 1000, include: { cells: true } },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, initials: true, avatarColor: true } }),
  ]);

  const shaped = table
    ? {
        id: table.id,
        name: table.name,
        columns: table.columns.map((c) => ({ id: c.id, name: c.name, type: c.type, options: (c.options as { id: string; label: string; color: string }[] | null) ?? null })),
        rows: table.rows.map((r) => ({ id: r.id, cells: cellsToMap(table.columns, r.cells) })),
      }
    : null;

  return (
    <div className="py-6 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-8">
        <h1 className="text-3xl font-bold tracking-tight">Wiki del equipo</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">Inventario de equipos: cámaras, streaming, audio, iluminación…</p>
        <WikiTabs />

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Inventario</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Sube la foto de cada equipo y mira su disponibilidad de un vistazo. La pestaña <b>Tabla</b> es el editor completo (columnas, opciones, importar).
            </p>
          </div>
          {session?.role === "admin" ? <ImportInventoryButton /> : null}
        </div>

        {shaped ? (
          <ViewTabs
            storageKey="inventario-view"
            views={[
              { key: "galeria", label: "Galería", icon: "🖼️", node: <InventoryGallery columns={shaped.columns} rows={shaped.rows} /> },
              { key: "tabla", label: "Tabla", icon: "📋", node: <DataTableView team={team.map((m) => ({ id: m.id, name: m.name, initials: m.initials, color: m.avatarColor }))} table={shaped} /> },
            ]}
          />
        ) : null}
      </div>
    </div>
  );
}
