import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Desplegable del Resumen ── cada área del proyecto vive plegada con IDENTIDAD propia:
// tile de color + título + su dato clave en la cabecera (la lees sin abrir). <details>
// nativo — componente de SERVIDOR, sin estado ni JS, mismo patrón que ya usaba la Propuesta.
// La pestaña pasa de ~9 tarjetas abiertas a una pantalla: el pulso arriba y el resto se abre
// solo cuando hace falta (p. ej. Solicitudes llega con defaultOpen si hay pendientes).
export function ResumenSection({
  icon: Icon,
  tile,
  iconCls,
  title,
  titleExtra,
  hint,
  defaultOpen = false,
  bodyClass,
  children,
}: {
  icon: LucideIcon;
  // Clases del tile (fondo) y del icono — el color es la identidad del área.
  tile: string;
  iconCls: string;
  title: string;
  // Nodo extra pegado al título (badge de conteo, pila de avatares…).
  titleExtra?: React.ReactNode;
  // Dato clave visible SIN abrir (la frase del cliente, conteos, entrega/privacidad…).
  hint?: React.ReactNode;
  defaultOpen?: boolean;
  bodyClass?: string;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group/rs overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 [&::-webkit-details-marker]:hidden">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tile)}>
          <Icon className={cn("size-[18px]", iconCls)} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-tight">
            {title}
            {titleExtra}
          </span>
          {hint ? <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{hint}</span> : null}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/rs:rotate-180" />
      </summary>
      <div className={cn("border-t border-border p-4", bodyClass)}>{children}</div>
    </details>
  );
}
