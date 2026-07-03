"use client";

import { Donut, Legend, BarRow } from "@/components/charts";
import type { CalendarStatsData } from "./stats-data";

// Panel lateral de estadísticas del calendario (tipo «Estadísticas de tiempo» de Google
// Calendar): distribución por tipo (dona + leyenda), volumen por mes (barras) y datos rápidos.
export function CalendarStatsPanel({ data }: { data: CalendarStatsData }) {
  const max = Math.max(1, ...data.byMonth.map((m) => m.value));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold">Estadísticas de tiempo</h3>
        {data.total === 0 ? (
          <p className="text-sm text-muted-foreground">Sin eventos en el rango visible.</p>
        ) : (
          <>
            <div className="flex justify-center">
              <Donut
                segments={data.byKind
                  .filter((k) => k.value > 0)
                  .map((k) => ({ label: k.label, value: k.value, color: k.color }))}
                centerValue={data.total}
                centerLabel="eventos"
                size={128}
              />
            </div>
            <Legend
              vertical
              className="mt-3"
              items={data.byKind.map((k) => ({ label: k.label, value: k.value, color: k.color }))}
            />
          </>
        )}
      </div>

      {data.total > 0 ? (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold">Por mes</h3>
          <div className="space-y-2">
            {data.byMonth.map((m) => (
              <BarRow
                key={m.key}
                label={<span className="capitalize">{m.label}</span>}
                value={m.value}
                pct={(m.value / max) * 100}
                color="hsl(var(--primary))"
              />
            ))}
          </div>
        </div>
      ) : null}

      {data.total > 0 ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
          <div className="space-y-1">
            <p>⏱️ ≈ {data.timedHours} h en reuniones</p>
            {data.busiest ? (
              <p>
                🔥 Día más ocupado · {data.busiest.label} ({data.busiest.value})
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
