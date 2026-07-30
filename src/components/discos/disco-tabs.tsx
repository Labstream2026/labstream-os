import Link from "next/link";
import { HardDrive, Images } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Discos del estudio: una sola pestaña en el menú, dos discos dentro ──
// Operaciones_LAB (el árbol de trabajo, volumen 5) y la galería de entregas (LabTem) eran dos
// entradas separadas del menú; ahora comparten esta cabecera y se cambia de disco aquí, como
// pestañas. Cada disco conserva su ruta (/operaciones, /galeria): los enlaces profundos con
// ?path= / ?rel= que ya circulan siguen abriendo donde apuntaban.
// Cada uno mantiene su color de identidad (naranja el drive de trabajo, rosa la galería).
export function DiscoTabs({
  activo,
  hayOps,
  hayGaleria,
  derecha,
}: {
  activo: "operaciones" | "galeria";
  hayOps: boolean;
  hayGaleria: boolean;
  derecha?: React.ReactNode;
}) {
  const tab = (on: boolean) =>
    cn(
      "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
      on ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <nav aria-label="Discos" className="inline-flex items-center rounded-full border border-border bg-muted/50 p-1">
        {hayOps ? (
          <Link href="/operaciones" aria-current={activo === "operaciones" ? "page" : undefined} className={tab(activo === "operaciones")}>
            <HardDrive className="size-4 text-[#F47A20]" /> Operaciones_LAB
          </Link>
        ) : null}
        {hayGaleria ? (
          <Link href="/galeria" aria-current={activo === "galeria" ? "page" : undefined} className={tab(activo === "galeria")}>
            <Images className="size-4 text-pink-500" /> Galería · LabTem
          </Link>
        ) : null}
      </nav>
      {derecha ? <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">{derecha}</div> : null}
    </div>
  );
}
