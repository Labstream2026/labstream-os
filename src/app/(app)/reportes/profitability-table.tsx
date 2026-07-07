"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { formatMoney } from "@/lib/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

type Row = {
  projectId: string;
  name: string;
  emoji: string | null;
  estMin: number;
  realMin: number;
  facturado: number;
};

// Tabla de horas y rentabilidad por proyecto. El costo por hora es una preferencia local del
// usuario (localStorage) que permite estimar el costo interno del tiempo y su margen contra lo
// facturado, sin persistir nada en el servidor.
export function ProfitabilityTable({
  rows,
  showMoney,
  currency,
}: {
  rows: Row[];
  showMoney: boolean;
  currency: string;
}) {
  const [costPerHour, setCostPerHour] = React.useState(0);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("reportes:costPerHour");
    const n = raw ? Number(raw) : 0;
    if (Number.isFinite(n) && n > 0) setCostPerHour(n);
  }, []);

  function updateCost(v: number) {
    const n = Number.isFinite(v) && v > 0 ? v : 0;
    setCostPerHour(n);
    if (typeof window !== "undefined") window.localStorage.setItem("reportes:costPerHour", String(n));
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Clock />}
        title="Aún no hay horas registradas"
        description="Registra horas en las tareas para ver rentabilidad."
      />
    );
  }

  const hours = (min: number) => (min / 60).toFixed(1);

  return (
    <div className="space-y-3">
      {showMoney ? (
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Costo por hora (COP)</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={costPerHour || ""}
            onChange={(e) => updateCost(Number(e.target.value))}
            placeholder="0"
            className="w-36 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">Proyecto</th>
              <th className="px-3 py-2.5 text-right font-medium">Estimado (h)</th>
              <th className="px-3 py-2.5 text-right font-medium">Real (h)</th>
              <th className="px-3 py-2.5 text-right font-medium">Desvío</th>
              {showMoney ? (
                <>
                  <th className="px-3 py-2.5 text-right font-medium">Facturado</th>
                  <th className="px-3 py-2.5 text-right font-medium">Costo</th>
                  <th className="px-3 py-2.5 text-right font-medium">Margen</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const desvioMin = r.realMin - r.estMin;
              const desvioH = Math.abs(desvioMin) / 60;
              const overBudget = r.estMin > 0 && r.realMin > r.estMin;
              const costo = (r.realMin / 60) * costPerHour;
              const margen = r.facturado - costo;
              return (
                <tr key={r.projectId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <span>{r.emoji ?? "📁"}</span>
                      <span className="truncate">{r.name}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {r.estMin > 0 ? hours(r.estMin) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{hours(r.realMin)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.estMin === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={cn(
                          "font-medium",
                          overBudget
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {overBudget ? "+" : "−"}
                        {desvioH.toFixed(1)}h
                      </span>
                    )}
                  </td>
                  {showMoney ? (
                    <>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {r.facturado > 0 ? formatMoney(r.facturado, currency) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                        {costPerHour > 0 ? formatMoney(Math.round(costo), currency) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {costPerHour > 0 || r.facturado > 0 ? (
                          <span
                            className={cn(
                              "font-semibold",
                              margen >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400",
                            )}
                          >
                            {formatMoney(Math.round(margen), currency)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
