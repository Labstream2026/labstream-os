"use client";

import * as React from "react";
import Link from "next/link";
import { RotateCw, ShieldAlert, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { esNoAutorizado } from "@/lib/authz-error";

// Límite de error del área autenticada. Distingue DOS casos:
//  · Falta de PERMISOS (digest NO_AUTORIZADO o mensaje "No autorizado"): la acción no está
//    permitida para el rol del usuario — se explica en claro y se invita a contactar al
//    administrador, en vez de mostrar una pantalla rota (la mayoría de "errores" que veía
//    el equipo eran esto).
//  · Error real del servidor (BD caída, bug): pantalla genérica con reintento.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [retrying, setRetrying] = React.useState(false);
  const denied = esNoAutorizado(error);

  React.useEffect(() => {
    console.error("[app] error de render:", error.message, error.digest);
  }, [error]);

  if (denied) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/15">
          <ShieldAlert className="size-7 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">Esta acción no está permitida</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Tu rol no tiene permiso para hacer esto. Si crees que deberías poder,
            contacta al administrador para que te dé acceso.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setRetrying(true);
              reset();
            }}
            disabled={retrying}
          >
            <RotateCw className={retrying ? "animate-spin" : ""} />
            Volver a la página
          </Button>
          <Button asChild>
            <Link href="/">
              <Home />
              Ir al inicio
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">No se pudo cargar esta página</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Ocurrió un error temporal en el servidor. Suele resolverse al reintentar.
          Si estabas intentando una acción y esto se repite, puede que tu rol no tenga
          permiso — contacta al administrador.
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
