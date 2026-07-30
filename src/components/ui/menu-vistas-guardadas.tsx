"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Bookmark, Plus, Trash2 } from "lucide-react";
import { MenuBarra, MenuGrupo, MenuOpcion, MenuSeparador, cerrarMenu } from "@/components/ui/barra-menu";
import { setSavedViews } from "@/app/(app)/perfil/preference-actions";

// ── Vistas guardadas, en cualquier pantalla (extra 5) ──────────────────────────
// Antes solo «Mis tareas» guardaba vistas, y las enseñaba en una fila propia debajo de los
// filtros. El mecanismo ya era genérico por superficie (setSavedViews(surface, …) y
// parseSavedViews(json, surface)), así que aquí solo se le pone una cara reutilizable — sin
// migración y sin tocar la forma en que se guardan.
//
// Una vista es solo la cadena de query con nombre: por eso funciona en cualquier superficie que
// tenga sus filtros en la URL, y por eso aplicarla es una navegación normal.

export type VistaGuardada = { id: string; name: string; query: string };

type Props = {
  // Clave de la superficie: "revisiones", "mis-tareas", "notas", "chat".
  superficie: string;
  // Qué parámetros de la URL forman parte de la vista. Se listan a propósito en vez de copiar la
  // query entera: parámetros como ?nota= o ?msg= abren UNA cosa concreta y no deben quedar
  // congelados dentro de una vista guardada.
  claves: readonly string[];
  iniciales: VistaGuardada[];
};

// Botón propio en la barra. Es la forma original y la que sigue usando «Mis tareas».
// El número del botón sale del estado y no de la prop: al guardar una vista, el servidor no
// revalida nada, así que leer `iniciales` dejaría el contador una vista por detrás.
export function MenuVistasGuardadas(props: Props) {
  const v = useVistasGuardadas(props);
  return (
    <MenuBarra etiqueta="Vistas" icono={<Bookmark />} activos={v.vistas.length} alineado="derecha" titulo="Vistas guardadas">
      <Lista {...v} />
    </MenuBarra>
  );
}

// Las mismas vistas SIN botón propio, para colgarlas dentro de otro menú. «Vista» y «Vistas», uno
// al lado del otro, se leen como lo mismo y se llevaban 100 px de una barra que quiere caber en
// una línea; dentro de «Vista» son un grupo más, junto a «Agrupar por» y «Cómo se ve».
export function VistasGuardadas(props: Props) {
  return <Lista {...useVistasGuardadas(props)} />;
}

function useVistasGuardadas({
  superficie,
  claves,
  iniciales,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // La lista se guarda en estado para poder pintar el cambio antes de que el servidor confirme.
  // La resincronización con la prop se hace DURANTE el render (el patrón «ajustar estado cuando
  // cambia una prop» de react.dev) y no en un efecto: un setState dentro de un efecto provoca un
  // render en cascada, y aquí no hace falta ninguno.
  const [vistas, setVistas] = React.useState<VistaGuardada[]>(iniciales);
  const [servidor, setServidor] = React.useState<VistaGuardada[]>(iniciales);
  if (servidor !== iniciales) {
    setServidor(iniciales);
    setVistas(iniciales);
  }
  const [, empezarGuardado] = React.useTransition();

  const persistir = (v: VistaGuardada[]) => {
    setVistas(v);
    empezarGuardado(() => { void setSavedViews(superficie, v); });
  };

  const queryActual = () => {
    const params = new URLSearchParams();
    for (const k of claves) { const val = sp.get(k); if (val) params.set(k, val); }
    return params.toString();
  };

  const guardarActual = () => {
    const nombre = window.prompt("Nombre de la vista guardada:");
    if (!nombre?.trim()) return;
    // El id se saca del reloj, que en un manejador de evento del navegador es legítimo (no es
    // render): solo tiene que ser único dentro de la lista del usuario.
    persistir([...vistas, { id: `${Date.now()}`, name: nombre.trim().slice(0, 60), query: queryActual() }]);
  };

  const aplicar = (v: VistaGuardada) => router.push(v.query ? `${pathname}?${v.query}` : pathname, { scroll: false });

  // La vista que coincide con lo que estás viendo ahora mismo sale marcada.
  const actual = queryActual();

  return { vistas, persistir, guardarActual, aplicar, actual };
}

function Lista({
  vistas,
  persistir,
  guardarActual,
  aplicar,
  actual,
}: ReturnType<typeof useVistasGuardadas>) {
  return (
    <>
      {/* La cabecera va SIEMPRE, también con la lista vacía: colgado dentro de «Vista», debajo de
          «Cómo se ve», un «Guardar lo de ahora» suelto no dice de qué habla. */}
      <MenuGrupo>Vistas guardadas</MenuGrupo>
      {vistas.length ? (
        <>
          {vistas.map((v) => (
            // Fila con dos acciones (aplicar y borrar), así que no es un MenuOpcion: el botón de
            // borrar tiene que quedar FUERA del que aplica, o borrar aplicaría la vista primero.
            <div key={v.id} className="flex items-center gap-1 rounded-md pr-1 hover:bg-muted">
              <button
                type="button"
                onClick={(e) => { cerrarMenu(e); aplicar(v); }}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{v.name}</span>
                {v.query === actual ? <span className="shrink-0 text-[10px] font-semibold text-primary">en uso</span> : null}
              </button>
              <button
                type="button"
                onClick={() => persistir(vistas.filter((x) => x.id !== v.id))}
                aria-label={`Borrar la vista ${v.name}`}
                title="Borrar esta vista"
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <MenuSeparador />
        </>
      ) : null}
      <MenuOpcion icono={<Plus />} marca={false} onClick={guardarActual}>
        Guardar lo de ahora
      </MenuOpcion>
      {!vistas.length ? (
        <p className="px-2 pb-1.5 pt-0.5 text-[11px] leading-snug text-muted-foreground">
          Filtra como quieras y guárdalo con un nombre; vuelve con un clic desde aquí.
        </p>
      ) : null}
    </>
  );
}
