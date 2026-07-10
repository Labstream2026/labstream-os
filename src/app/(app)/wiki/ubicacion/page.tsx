import { db } from "@/lib/db";
import { DataTableView } from "@/components/tables/data-table";
import { cellsToMap } from "@/lib/table-cells";
import { getLocationsTableId } from "@/lib/wiki-tables";
import { WikiTabs } from "../wiki-tabs";
import { ViewTabs } from "@/app/(app)/proyectos/[id]/view-tabs";
import { IconArchivador, IconTabla } from "@/components/icons";
import { LocationsView } from "./locations-view";

export const dynamic = "force-dynamic";

export default async function UbicacionPage() {
  const tableId = await getLocationsTableId();
  const [table, team] = await Promise.all([
    db.dataTable.findUnique({
      where: { id: tableId },
      include: {
        columns: { orderBy: { position: "asc" } },
        rows: { orderBy: { position: "asc" }, take: 2000, include: { cells: true } },
      },
    }),
    db.user.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, initials: true, avatarColor: true } }),
  ]);

  const members = team.map((m) => ({ id: m.id, name: m.name, initials: m.initials, color: m.avatarColor }));
  const shaped = table
    ? {
        id: table.id,
        name: table.name,
        columns: table.columns.map((c) => ({ id: c.id, name: c.name, type: c.type, options: (c.options as { id: string; label: string; color: string }[] | null) ?? null })),
        rows: table.rows.map((r) => ({ id: r.id, cells: cellsToMap(table.columns, r.cells) })),
      }
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-3xl font-bold tracking-tight">Wiki del equipo</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">Dónde está guardado el material de cada cliente y hasta cuándo.</p>
      <WikiTabs />

      <div className="mb-4">
        <h2 className="text-lg font-semibold">Ubicación del material</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Agrupado por disco, con un <strong>semáforo de caducidad</strong> para borrar a tiempo. La pestaña <b>Tabla</b> es el editor completo.
        </p>
      </div>

      {shaped ? (
        <ViewTabs
          storageKey="ubicacion-view"
          views={[
            { key: "vista", label: "Vista", icon: <IconArchivador />, node: <LocationsView columns={shaped.columns} rows={shaped.rows} team={members} /> },
            { key: "tabla", label: "Tabla", icon: <IconTabla />, node: <DataTableView team={members} table={shaped} /> },
          ]}
        />
      ) : null}
    </div>
  );
}
