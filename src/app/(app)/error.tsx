"use client";

import * as React from "react";
import Link from "next/link";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { RotateCw, ShieldAlert, Home, ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { esNoAutorizado } from "@/lib/authz-error";

// Límite de error del área autenticada. Distingue TRES casos:
//  · Pestaña OBSOLETA tras un despliegue ("version skew"): el bundle de esta pestaña llama a una
//    Server Action con un id que el servidor nuevo ya no reconoce. Es el caso más importante
//    porque `reset()` NO puede arreglarlo (re-renderiza con el MISMO javascript viejo → mismo
//    error, en bucle) y el texto genérico de abajo culpa a los permisos, mandando al usuario a
//    molestar al administrador por algo que se resuelve recargando. Solo una recarga dura trae
//    el código nuevo.
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
  // El error nace en el CLIENTE (el enmascarado de producción solo aplica a los del servidor), así
  // que la instancia llega intacta al límite y se puede identificar por tipo.
  // El `: boolean` es DELIBERADO, no ruido: el guard nativo devuelve `error is UnrecognizedActionError`,
  // y esa clase no añade ningún miembro sobre `Error`. Como TypeScript compara por ESTRUCTURA, los
  // considera el mismo tipo y, tras el `if (obsoleta) return`, estrecha `error` a `never` en el resto
  // del componente (rompiendo `error.digest` más abajo). Anotarlo descarta el predicado y deja un
  // booleano normal. No quitar.
  const obsoleta: boolean = unstable_isUnrecognizedActionError(error);
  const denied = !obsoleta && esNoAutorizado(error);

  React.useEffect(() => {
    console.error("[app] error de render:", error.message, error.digest);
  }, [error]);

  if (obsoleta) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-500/15">
          <ArrowDownToLine className="size-7 text-sky-600 dark:text-sky-400" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">Hay una versión nueva de la app</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Esta pestaña llevaba abierta desde antes de la última actualización, así que lo
            que acabas de hacer no llegó a guardarse. No es culpa tuya ni de tus permisos:
            recarga y podrás continuar.
          </p>
          <p className="max-w-md text-xs text-muted-foreground/80">
            Al recargar se pierde lo que tuvieras escrito sin guardar en esta página.
          </p>
        </div>
        {/* Recarga DURA: `reset()` volvería a montar la página con el MISMO javascript viejo y
            fallaría igual. Solo pidiendo el documento otra vez llega el código nuevo. */}
        <Button onClick={() => window.location.reload()}>
          <RotateCw />
          Recargar la página
        </Button>
      </div>
    );
  }

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
