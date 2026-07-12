"use client";

import { Donut, Legend } from "@/components/charts";
import type { CalendarStatsData } from "./stats-data";

// «Estadísticas de tiempo» del calendario: SOLO la distribución por tipo (dona + leyenda con
// citas/entregas/rodajes/hitos). Va en el sidebar izquierdo (dentro de un desplegable), sin la
// tabla «Por mes» ni el resumen de horas —se quitaron para aprovechar el espacio—.
export function CalendarStatsPanel({ data }: { data: CalendarStatsData }) {
  if (data.total === 0) {
    return <p className="text-sm text-muted-foreground">Sin eventos en el rango visible.</p>;
  }
  return (
    <div>
      <div className="flex justify-center">
        <Donut
          segments={data.byKind
            .filter((k) => k.value > 0)
            .map((k) => ({ label: k.label, value: k.value, color: k.color }))}
          centerValue={data.total}
          centerLabel="eventos"
          size={120}
        />
      </div>
      <Legend
        vertical
        className="mt-3"
        items={data.byKind.map((k) => ({ label: k.label, value: k.value, color: k.color }))}
      />
    </div>
  );
}
