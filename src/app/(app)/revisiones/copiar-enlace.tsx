"use client";

import * as React from "react";
import { Check, Copy, Link2Off } from "lucide-react";
import { cn } from "@/lib/utils";
import { copiarAlPortapapeles } from "@/lib/copiar";

// ── «Copiar enlace», a la vista ────────────────────────────────────────────────
// La acción existía desde siempre, pero dentro del menú ⋯ de la tarjeta: para mandarle la pieza
// al cliente había que acordarse de que estaba ahí. En una pieza que YA está con el cliente,
// copiar su enlace es lo que uno viene a hacer, así que sale al frente.
//
// Solo se pinta donde el enlace sirve (esperando al cliente / con el cliente); en lo que aún se
// revisa no aparece. Si el enlace está revocado o vencido no se esconde: se apaga y lo dice —
// callarlo haría que alguien copiara una puerta cerrada y el cliente llamara preguntando.
export function CopiarEnlace({
  url,
  activo,
  className,
}: {
  url: string;
  activo: boolean;
  className?: string;
}) {
  // null = sin pulsar todavía · true = copiado · false = el navegador no dejó (y hay que decirlo)
  const [copiado, setCopiado] = React.useState<boolean | null>(null);

  if (!activo) {
    return (
      <span
        title="El enlace está revocado o vencido. Reactívalo desde el menú ⋯ antes de mandarlo."
        className={cn(
          "inline-flex items-center justify-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground",
          className,
        )}
      >
        <Link2Off className="size-3" /> Enlace revocado
      </span>
    );
  }

  return (
    <button
      type="button"
      // La tarjeta entera es un <Link> al workspace: sin frenar el evento, copiar además navega.
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ok = await copiarAlPortapapeles(url);
        setCopiado(ok);
        setTimeout(() => setCopiado(null), ok ? 1600 : 3500);
      }}
      title={copiado === false ? "Tu navegador no dejó copiar: ábrelo desde el menú ⋯" : "Copiar el enlace para mandárselo al cliente"}
      className={cn(
        "inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors",
        copiado === true && "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
        copiado === false && "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
        copiado === null && "border-border text-primary hover:border-primary/40 hover:bg-primary/5",
        className,
      )}
    >
      {copiado === true ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copiado === true ? "¡Copiado!" : copiado === false ? "No se pudo copiar" : "Copiar enlace"}
    </button>
  );
}
