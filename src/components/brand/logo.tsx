import { cn } from "@/lib/utils";

// Marca Labstream Studio — usa los logos OFICIALES de public/brand/. OJO: los archivos
// están nombrados al revés de lo intuitivo → logo-dark.png es el wordmark NEGRO (para fondo
// claro) y logo.png es el BLANCO (para fondo oscuro). Cambia solo con el tema.
// El tamaño se controla con la ALTURA vía className (p. ej. "h-7"); el ancho es auto.

export const BRAND_ORANGE = "#F47A20";

export function Logo({ className, alt = "Labstream Studio" }: { className?: string; alt?: string }) {
  // Se sirve por /api/brand-logo/<variante>: el logo SUBIDO en Ajustes → Marca si existe, si no
  // el de fábrica. "light" = para fondo claro (tinta oscura); "dark" = para fondo oscuro (blanco).
  return (
    <span className={cn("inline-flex items-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/api/brand-logo/light" alt={alt} className="block h-full w-auto dark:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/api/brand-logo/dark" alt={alt} className="hidden h-full w-auto dark:block" />
    </span>
  );
}

// Marca compacta (espacios estrechos: sidebar plegada, favicons). Cuadro redondeado con
// la "l" del wordmark y el punto naranja característico (derivado de la marca).
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-xl bg-foreground font-bold text-background",
        className,
      )}
      aria-label="Labstream"
    >
      <span className="lowercase leading-none">l</span>
      <span className="absolute bottom-1 right-1 size-1.5 rounded-full" style={{ backgroundColor: BRAND_ORANGE }} />
    </span>
  );
}
