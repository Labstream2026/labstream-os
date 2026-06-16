"use client";

import * as React from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Límite de error del área autenticada: si una página falla al renderizar en el
// servidor (p. ej. una caída transitoria de la base de datos), mostramos esta
// pantalla en lugar del error crudo "ERROR …", con un botón para reintentar sin
// recargar toda la app.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [retrying, setRetrying] = React.useState(false);

  React.useEffect(() => {
    // Reintento automático una vez para errores transitorios.
    console.error("[app] error de render:", error.message, error.digest);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">No se pudo cargar esta página</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Ocurrió un error temporal en el servidor. Suele resolverse al reintentar.
        </p>
        {error.digest ? (
          <p className="text-[11px] text-muted-foreground/70">Ref: {error.digest}</p>
        ) : null}
      </div>
      <Button
        onClick={() => {
          setRetrying(true);
          reset();
        }}
        disabled={retrying}
      >
        <RotateCw className={retrying ? "animate-spin" : ""} />
        Reintentar
      </Button>
    </div>
  );
}
