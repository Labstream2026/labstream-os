import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { cellsToMap } from "@/lib/table-cells";
import { findLocationsTableId } from "@/lib/wiki-tables";
import { LocationsView } from "./locations-view";
import { ArrowRight, Archive } from "lucide-react";

export const dynamic = "force-dynamic";

// PUENTE. «Ubicación del material» se fusionó con el Mapa del material de la Biblioteca.
//
// Esta ruta no se borra —hay marcadores, enlaces en páginas de la Wiki y gente que la tiene
// en la memoria muscular— y hace una de dos cosas según lo que encuentre:
//
//  · Si la vieja tabla no existe o está vacía (el caso normal, y siempre en instalaciones
//    nuevas): manda directo al mapa. Nadie llega a ver esta pantalla.
//  · Si tiene filas escritas: las enseña EN SOLO LECTURA, con el aviso de la fusión. Así
//    nada de lo que el equipo escribió se pierde ni queda inalcanzable mientras lo pasa al
//    mapa. Lo que ya no está es el editor: la fuente de verdad es el mapa, y dos sitios
//    donde escribir era justo el problema que se vino a resolver.
export default async function UbicacionPage() {
  const tableId = await findLocationsTableId();
  if (!tableId) redirect("/biblioteca?tab=mapa");

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
  if (!table) redirect("/biblioteca?tab=mapa");

  // «Con datos» = alguna celda con algo. La tabla se creaba con una fila sembrada vacía, que
  // no cuenta como contenido: si solo queda eso, no hay nada que conservar.
  const conDatos = table.rows.filter((r) =>
    r.cells.some((c) => c.value !== null && c.value !== "" && JSON.stringify(c.value) !== "[]"),
  );
  if (conDatos.length === 0) redirect("/biblioteca?tab=mapa");

  const members = team.map((m) => ({ id: m.id, name: m.name, initials: m.initials, color: m.avatarColor }));
  const columns = table.columns.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    options: (c.options as { id: string; label: string; color: string }[] | null) ?? null,
  }));
  const rows = conDatos.map((r) => ({ id: r.id, cells: cellsToMap(table.columns, r.cells) }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Archive className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          Esto se fusionó con el Mapa del material
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          La ubicación del material ahora vive en la Biblioteca, enlazada a los proyectos y los discos de
          verdad: aplica la regla 3-2-1, entra en el informe CSV y marca lo que está por caducar. Aquí abajo
          quedan las <strong>{conDatos.length}</strong> {conDatos.length === 1 ? "fila" : "filas"} que se
          escribieron antes de la fusión, <strong>en solo lectura</strong>, para pasarlas al mapa sin perder nada.
        </p>
        <Link
          href="/biblioteca?tab=mapa"
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Ir al Mapa del material <ArrowRight className="size-4" />
        </Link>
      </div>

      <div className="mt-6 mb-3">
        <h2 className="text-lg font-semibold">Registro anterior (archivo)</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Agrupado por disco, con el semáforo de caducidad de siempre. Ya no se puede editar.
        </p>
      </div>

      <LocationsView columns={columns} rows={rows} team={members} />
    </div>
  );
}
