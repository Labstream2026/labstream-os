import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    // La MISMA geometría que calendario/page.tsx: a sangre y con su padding. Antes este
    // esqueleto se centraba en max-w-6xl y la página va a ancho completo, así que al cargar el
    // calendario daba un tirón entero de estrecho a ancho.
    <div className="flex h-full flex-col px-4 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Skeleton className="h-7 w-40" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
