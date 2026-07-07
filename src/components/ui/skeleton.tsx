import { cn } from "@/lib/utils";

// Placeholder animado (barra que "late") para estados de carga. Se compone para esbozar la
// forma del contenido mientras el servidor responde, en vez de dejar la pantalla en blanco.
// Respeta prefers-reduced-motion (no anima si el usuario lo pidió).
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)} />;
}
