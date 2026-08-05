"use client";

import * as React from "react";
import { Layers } from "lucide-react";
import { IconCliente, IconLista, IconTablero, IconTableroH } from "@/components/icons";
import { MenuBarra, MenuGrupo, MenuOpcion, usePreferenciaLocal } from "@/components/ui/barra-menu";
import { cn } from "@/lib/utils";

// ── Qué vista de /proyectos se está mirando ────────────────────────────────────
// Dos piezas hermanas en vez de un componente que envuelva media pantalla: el SELECTOR va dentro
// de la barra de mandos y el CUERPO debajo, y los dos leen la misma preferencia. No hace falta
// enhebrar estado ni props entre ellos porque `usePreferenciaLocal` avisa a todos sus lectores de
// esta pestaña (el Set de oyentes de barra-menu) — es justo para lo que existe ese Set. Así la
// página sigue siendo un componente de SERVIDOR y las tres vistas se renderizan allí.
//
// El cambio de vista se queda en BOTONES, no en un desplegable, aunque el resto de la barra sí
// use menús. Dos razones: se alterna decenas de veces al día y un menú lo convierte en dos clics;
// y en el teléfono la Tabla es el único sitio donde se puede cambiar el estado de un proyecto
// (arrastrar una tarjeta del Pipeline no responde al dedo), así que esconderla pondría dos toques
// delante de la única acción de escritura que tiene la pantalla en móvil.

const VISTAS = [
  { key: "clientes", label: "Por cliente", Icono: IconCliente },
  { key: "pipeline", label: "Pipeline", Icono: IconTablero },
  { key: "tabla", label: "Tabla", Icono: IconLista },
  { key: "portafolio", label: "Portafolio", Icono: IconTableroH },
] as const;

export type VistaKey = (typeof VISTAS)[number]["key"];

// Se sube a v3 A PROPÓSITO al estrenar «Por cliente». Renombrar la clave deja a todo el equipo en
// la vista por defecto —que ahora es esa— y es la única forma de que la estrenen: quien ya tenía
// «pipeline» guardado no la vería nunca. Es un empujón de una vez; su elección vuelve a mandar en
// cuanto toquen el conmutador. Fuera de un cambio de defecto deliberado, NO renombrarla.
const CLAVE = "proyectos-view-v3";

// Lo guardado puede ser cualquier cosa (una clave vieja, otra pestaña, alguien trasteando en las
// herramientas del navegador). `usePreferenciaLocal` devuelve la cadena tal cual, así que se
// valida aquí: sin esto, un valor huérfano pintaría la pantalla VACÍA y sin ningún error.
function valida(v: string): VistaKey {
  return (VISTAS.find((x) => x.key === v)?.key ?? "clientes") as VistaKey;
}

export function SelectorVista({
  grupo,
  hrefGrupoCliente,
  hrefGrupoEstado,
}: {
  grupo: "cliente" | "estado";
  hrefGrupoCliente: string;
  hrefGrupoEstado: string;
}) {
  const [guardada, poner] = usePreferenciaLocal<VistaKey>(CLAVE, "clientes");
  const vista = valida(guardada);

  return (
    <>
      <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border" role="group" aria-label="Cómo se ve la lista">
        {VISTAS.map(({ key, label, Icono }, i) => {
          const on = vista === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => poner(key)}
              title={label}
              aria-label={label}
              aria-pressed={on}
              className={cn(
                "inline-flex size-8 items-center justify-center transition-colors [&_svg]:size-4",
                i > 0 && "border-l border-border",
                on ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <Icono />
            </button>
          );
        })}
      </div>

      {/* «Agrupar» solo existe en la Tabla. Antes ocupaba sitio también en Pipeline y en
          Portafolio, donde tocarlo no cambiaba absolutamente nada. */}
      {vista === "tabla" ? (
        <MenuBarra
          clave="vista"
          etiqueta={grupo === "estado" ? "Por estado" : "Por cliente"}
          icono={<Layers />}
          alineado="derecha"
          titulo="Cómo se agrupan las filas de la tabla"
        >
          <MenuGrupo>Agrupar la tabla por</MenuGrupo>
          <MenuOpcion activa={grupo === "cliente"} href={hrefGrupoCliente}>Cliente</MenuOpcion>
          <MenuOpcion activa={grupo === "estado"} href={hrefGrupoEstado}>Estado</MenuOpcion>
        </MenuBarra>
      ) : null}
    </>
  );
}

export function CuerpoVista({
  clientes,
  pipeline,
  tabla,
  portafolio,
}: {
  clientes: React.ReactNode;
  pipeline: React.ReactNode;
  tabla: React.ReactNode;
  portafolio: React.ReactNode;
}) {
  const [guardada] = usePreferenciaLocal<VistaKey>(CLAVE, "clientes");
  const nodos: Record<VistaKey, React.ReactNode> = { clientes, pipeline, tabla, portafolio };
  return <>{nodos[valida(guardada)]}</>;
}
