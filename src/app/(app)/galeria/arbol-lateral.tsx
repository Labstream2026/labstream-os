"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, FolderTree, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { tone } from "@/lib/colors";
import type { GaleriaFolder } from "@/lib/nas-galeria";
import type { DuenoRama, NivelesArbol } from "@/lib/galeria-arbol";

// ── El árbol de la galería ─────────────────────────────────────────────────────
// Antes, «una carpeta» se veía de dos formas distintas según la profundidad: en la raíz era una
// tarjeta con portada, peso y conteo; un clic dentro y pasaba a ser un chip de texto en una fila
// delgada. Navegar hacia dentro te QUITABA información, y para cambiar de entrega había que
// volver a la raíz y esperar a que se releyera todo.
//
// Aquí la estructura está siempre a la vista y es la misma a cualquier profundidad: cliente →
// entrega → subcarpeta, con el punto de color del cliente. Cambiar de entrega es un clic.
//
// Lo que ya viene desplegado lo manda el servidor (espinaDelArbol), así que la rama donde estás
// se pinta abierta en el primer render y no parpadea. Abrir OTRA rama pide su nivel a
// /api/galeria/carpetas, que es una lectura de directorio, no un escaneo.

export function ArbolGaleria({
  rel,
  niveles,
  duenos,
}: {
  rel: string;
  niveles: NivelesArbol;
  duenos: Record<string, DuenoRama>;
}) {
  const router = useRouter();
  // Los niveles del servidor son la base; lo que se abre a mano se acumula encima.
  const [extra, setExtra] = React.useState<NivelesArbol>({});
  const [cargando, setCargando] = React.useState<string | null>(null);
  // Plegado MANUAL: solo guarda las ramas que alguien cerró o abrió a propósito. Lo demás lo
  // decide la ruta actual, así que al navegar el árbol se acomoda solo.
  const [tocado, setTocado] = React.useState<Record<string, boolean>>({});
  const [cajon, setCajon] = React.useState(false);

  // El servidor manda niveles nuevos en cada navegación: lo suyo manda y lo pedido a mano se
  // conserva para las ramas que él no conoce.
  const todos = React.useMemo<NivelesArbol>(() => ({ ...extra, ...niveles }), [extra, niveles]);

  // ¿Está esta rama en el camino de la carpeta actual? Entonces sale abierta.
  const enElCamino = React.useCallback(
    (r: string) => rel === r || rel.startsWith(`${r}/`),
    [rel],
  );
  const abierta = (r: string) => tocado[r] ?? enElCamino(r);

  const alternar = async (r: string) => {
    const va = !abierta(r);
    setTocado((t) => ({ ...t, [r]: va }));
    // Solo se pide si se abre y no se conoce todavía. `[]` cuenta como conocido (leída y vacía).
    if (va && !todos[r]) {
      setCargando(r);
      try {
        const res = await fetch(`/api/galeria/carpetas?rel=${encodeURIComponent(r)}`);
        const d = res.ok ? ((await res.json()) as { folders: GaleriaFolder[] }) : null;
        setExtra((e) => ({ ...e, [r]: d?.folders ?? [] }));
      } catch {
        setExtra((e) => ({ ...e, [r]: [] })); // no se pudo leer: se deja vacía en vez de reintentar en bucle
      } finally {
        setCargando(null);
      }
    }
  };

  const ir = (r: string) => {
    setCajon(false);
    router.push(r ? `/galeria?rel=${encodeURIComponent(r)}` : "/galeria");
  };

  const cuerpo = (
    <nav aria-label="Carpetas de la galería" className="text-[12.5px]">
      <button
        type="button"
        onClick={() => ir("")}
        className={cn(
          "mb-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left font-semibold transition-colors",
          rel === "" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <FolderTree className="size-3.5 shrink-0" />
        Todas las entregas
      </button>
      <Rama
        padre=""
        niveles={todos}
        duenos={duenos}
        rel={rel}
        nivel={0}
        abierta={abierta}
        alternar={alternar}
        cargando={cargando}
        ir={ir}
      />
    </nav>
  );

  return (
    <>
      {/* Móvil: el árbol no cabe al lado, así que es un cajón. El botón dice DÓNDE estás, que es
          la mitad del trabajo que hacía la fila de migas. */}
      <div className="mb-3 md:hidden">
        <button
          type="button"
          onClick={() => setCajon(true)}
          className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm"
        >
          <FolderTree className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-medium">
            {rel ? (rel.split("/").pop() ?? "").replace(/_/g, " ") : "Todas las entregas"}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">Cambiar</span>
        </button>
      </div>

      {cajon && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setCajon(false)}
            aria-hidden
          />
          <div className="relative flex max-h-full w-[17rem] flex-col overflow-y-auto border-r border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Entregas_LAB</p>
              <button type="button" onClick={() => setCajon(false)} aria-label="Cerrar" className="rounded p-1 hover:bg-muted">
                <X className="size-4" />
              </button>
            </div>
            {cuerpo}
          </div>
        </div>
      )}

      {/* Escritorio: fijo al hacer scroll, para que el mapa no se vaya al bajar por 20.000 piezas. */}
      <aside className="hidden shrink-0 md:sticky md:top-4 md:block md:w-52 md:self-start">
        <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Entregas_LAB
        </p>
        <div className="max-h-[calc(100vh-7rem)] overflow-y-auto pr-1">{cuerpo}</div>
      </aside>
    </>
  );
}

function Rama({
  padre,
  niveles,
  duenos,
  rel,
  nivel,
  abierta,
  alternar,
  cargando,
  ir,
}: {
  padre: string;
  niveles: NivelesArbol;
  duenos: Record<string, DuenoRama>;
  rel: string;
  nivel: number;
  abierta: (r: string) => boolean;
  alternar: (r: string) => void;
  cargando: string | null;
  ir: (r: string) => void;
}) {
  const hijos = niveles[padre];
  if (!hijos || hijos.length === 0) return null;

  return (
    <ul>
      {hijos.map((f) => {
        const activa = rel === f.rel;
        const dueno = duenos[f.rel];
        const t = dueno ? tone(dueno.color) : null;
        const open = abierta(f.rel);
        // Si nunca se ha leído su nivel, se asume que PUEDE tener hijos y se ofrece la flecha:
        // preguntarle al NAS por cada rama solo para saber si dibujar un triángulo sería peor.
        const puedeTener = niveles[f.rel] === undefined || niveles[f.rel]!.length > 0;

        return (
          <li key={f.rel}>
            <div
              className={cn(
                "group/rama flex items-center gap-0.5 rounded-md pr-1 transition-colors",
                activa ? "bg-primary/10" : "hover:bg-muted",
              )}
              style={{ paddingLeft: `${nivel * 10}px` }}
            >
              {puedeTener ? (
                <button
                  type="button"
                  onClick={() => alternar(f.rel)}
                  aria-label={open ? `Plegar ${f.name}` : `Desplegar ${f.name}`}
                  aria-expanded={open}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                >
                  {cargando === f.rel ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <ChevronRight className={cn("size-3 transition-transform", open && "rotate-90")} />
                  )}
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              <button
                type="button"
                onClick={() => ir(f.rel)}
                title={dueno ? `Carpeta de ${dueno.nombre}` : f.name.replace(/_/g, " ")}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left",
                  activa ? "font-semibold text-primary" : "text-foreground/80",
                )}
              >
                {t ? <span className={cn("size-1.5 shrink-0 rounded-full", t.dot)} /> : null}
                <span className="min-w-0 flex-1 truncate">{f.name.replace(/_/g, " ")}</span>
              </button>
            </div>
            {open ? (
              <Rama
                padre={f.rel}
                niveles={niveles}
                duenos={duenos}
                rel={rel}
                nivel={nivel + 1}
                abierta={abierta}
                alternar={alternar}
                cargando={cargando}
                ir={ir}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
