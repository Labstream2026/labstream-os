"use client";

import * as React from "react";
import { FileText, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Pestaña «Comercial» del cliente: Facturación + Propuestas unificadas ──
// Eran dos pestañas de primer nivel y la barra no cabía. Ahora es UNA con un sub-conmutador
// (aprobado por prototipo): la plata del cliente vive junta. Los dos paneles llegan armados
// del servidor como nodos; sin permiso de finanzas, `facturacion` viene null y esto se
// reduce a Propuestas sin conmutador (no se enseña un botón a una vista prohibida).

export function ClientComercial({
  facturacion,
  propuestas,
  facturacionCount,
  propuestasCount,
}: {
  facturacion: React.ReactNode | null;
  propuestas: React.ReactNode;
  facturacionCount: number;
  propuestasCount: number;
}) {
  const [sub, setSub] = React.useState<"facturacion" | "propuestas">(facturacion ? "facturacion" : "propuestas");
  React.useEffect(() => {
    if (!facturacion) return;
    const t = setTimeout(() => {
      const v = window.localStorage.getItem("cliente-comercial-sub");
      if (v === "propuestas" || v === "facturacion") setSub(v);
    }, 0);
    return () => clearTimeout(t);
  }, [facturacion]);
  const cambia = (v: "facturacion" | "propuestas") => {
    setSub(v);
    window.localStorage.setItem("cliente-comercial-sub", v);
  };

  if (!facturacion) return <>{propuestas}</>;

  const tabs = [
    { key: "facturacion" as const, label: "Facturación", Icon: Receipt, n: facturacionCount },
    { key: "propuestas" as const, label: "Propuestas", Icon: FileText, n: propuestasCount },
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
        {tabs.map(({ key, label, Icon, n }) => (
          <button
            key={key}
            type="button"
            onClick={() => cambia(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              sub === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" /> {label}
            {n > 0 ? (
              <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums", sub === key ? "bg-primary/15 text-primary" : "bg-muted-foreground/15 text-muted-foreground")}>
                {n}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div key={sub} className="animate-in fade-in slide-in-from-bottom-1 duration-200">
        {sub === "facturacion" ? facturacion : propuestas}
      </div>
    </div>
  );
}
