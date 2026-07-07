import { Skeleton } from "@/components/ui/skeleton";

// Esqueleto genérico que Next muestra automáticamente mientras carga CUALQUIER página de la app
// (evita la pantalla en blanco entre navegaciones). Las secciones con un layout muy propio
// pueden añadir su propio loading.tsx; este es el respaldo para todas las demás.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="mt-6 space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
