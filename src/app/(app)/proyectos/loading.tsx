import { Skeleton } from "@/components/ui/skeleton";

// El esqueleto tiene que ocupar EL MISMO sitio que la página, o al terminar de cargar el contenido
// pega un salto. Antes este contenedor era `max-w-6xl px-4 py-6 sm:px-6` y la página `max-w-7xl
// px-4 py-5 sm:px-8 sm:py-6`: dos anchos distintos y dos paddings distintos, y se notaba.
// La forma también es la de ahora: una barra y una franja, no cuatro pastillas y una rejilla.
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-5 sm:px-8 sm:py-6">
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-44 rounded-lg" />
        <Skeleton className="h-8 min-w-40 flex-1 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-24 rounded-full" />
        ))}
      </div>

      <div className="mt-3 flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-64 shrink-0 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
