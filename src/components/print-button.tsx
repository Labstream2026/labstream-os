"use client";

import { Printer } from "lucide-react";

// Botón que abre el diálogo de impresión del navegador (Imprimir → Guardar como PDF).
// Se oculta al imprimir gracias a la clase `print:hidden`.
export function PrintButton({ label = "Imprimir / PDF" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 print:hidden"
    >
      <Printer className="size-4" /> {label}
    </button>
  );
}
