"use client";

import * as React from "react";
import { emojiToText } from "@/components/icons/marks";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SlidersHorizontal, Building2, FolderOpen, Flag, Calendar, List, Rows3, EyeOff } from "lucide-react";
import { AtajosBarra, BarraMandos, ChipFiltro, MenuBarra, MenuGrupo, MenuOpcion, MenuSeparador } from "@/components/ui/barra-menu";
import { BuscadorUrl } from "@/components/ui/buscador-url";
import { MenuVistasGuardadas, type VistaGuardada } from "@/components/ui/menu-vistas-guardadas";

type Opt = { value: string; label: string };
type Proj = { id: string; name: string; emoji: string | null };

// Parámetros que forman una vista guardada de esta superficie. `urg` (el tramo de la franja de
// resumen) y `d`/`oculta` (cómo se ve) entran también: una vista guardada es «cómo lo tenía
// puesto», no solo qué filtraba.
export const CLAVES_VISTA = ["estado", "prioridad", "cliente", "proyecto", "q", "grupo", "urg", "d", "oculta"] as const;

// ── Una barra para «Mis tareas» ────────────────────────────────────────────────
// Antes: buscador + Estado + Prioridad + Cliente + Proyecto + Agrupar + Limpiar + Guardar vista
// = ocho mandos en una fila, más OTRA fila debajo con las vistas guardadas. Y todo eso venía
// después de los cuatro cuadros de resumen y del héroe «Ahora sigue», así que en un portátil la
// primera tarea salía justo en el borde de la pantalla o ya por debajo.
//
// Ahora: buscador + tres menús (Filtrar, Vista, Vistas). Los filtros siguen viviendo en la URL —el
// enlace es compartible y una vista guardada no es más que una cadena de query con nombre—, así
// que quien filtra sigue siendo el servidor.
export function TaskFilters({
  statusOptions,
  priorityOptions,
  projectOptions,
  clientOptions,
  hasPersonal,
  initialViews,
}: {
  statusOptions: Opt[];
  priorityOptions: Opt[];
  projectOptions: Proj[];
  clientOptions: { id: string; name: string }[];
  hasPersonal: boolean;
  initialViews: VistaGuardada[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const estado = (sp.get("estado") ?? "").split(",").filter(Boolean);
  const prioridad = (sp.get("prioridad") ?? "").split(",").filter(Boolean);
  const proyecto = sp.get("proyecto") ?? "";
  const cliente = sp.get("cliente") ?? "";
  const grupo = sp.get("grupo") ?? "urgencia";
  const compacta = sp.get("d") === "c";
  const oculta = (sp.get("oculta") ?? "").split(",").filter(Boolean);
  const q = sp.get("q") ?? "";
  // Los que tiñen «Filtrar» son los que ESCONDEN tareas. La agrupación y la densidad no cuentan
  // (no quitan nada de la lista) y por eso viven en «Vista».
  const filtrosPuestos = estado.length + prioridad.length + (cliente ? 1 : 0) + (proyecto ? 1 : 0);

  const pushParams = React.useCallback(
    (next: Record<string, string | null>) => {
      const params = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v == null || v === "") params.delete(k);
        else params.set(k, v);
      }
      const s = params.toString();
      router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [sp, pathname, router],
  );

  const toggleMulti = (key: "estado" | "prioridad", val: string) => {
    const cur = key === "estado" ? estado : prioridad;
    const next = cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val];
    pushParams({ [key]: next.join(",") });
  };
  const toggleOculta = (val: string) => {
    const next = oculta.includes(val) ? oculta.filter((x) => x !== val) : [...oculta, val];
    pushParams({ oculta: next.join(",") });
  };
  const limpiar = () => pushParams({ estado: null, prioridad: null, cliente: null, proyecto: null, q: null, urg: null });

  const etiquetaDe = (opts: Opt[], v: string) => opts.find((o) => o.value === v)?.label ?? v;
  const clienteSel = cliente ? clientOptions.find((c) => c.id === cliente) : null;
  const proyectoSel = proyecto === "personal" ? { name: "🔒 Personales" } : proyecto ? projectOptions.find((p) => p.id === proyecto) : null;

  return (
    <div className="space-y-2.5">
      {/* Los mismos atajos que en las otras tres: «/» busca, «f» filtra, «v» vista. */}
      <AtajosBarra />
      <BarraMandos pegajosa>
        <BuscadorUrl placeholder="Buscar tarea" />

        <MenuBarra clave="filtrar" etiqueta="Filtrar" icono={<SlidersHorizontal />} activos={filtrosPuestos} alineado="derecha">
          {statusOptions.length ? (
            <>
              <MenuGrupo>Estado</MenuGrupo>
              {statusOptions.map((o) => (
                <MenuOpcion key={o.value} activa={estado.includes(o.value)} onClick={() => toggleMulti("estado", o.value)}>
                  {o.label}
                </MenuOpcion>
              ))}
            </>
          ) : null}
          {priorityOptions.length ? (
            <>
              <MenuSeparador />
              <MenuGrupo>Prioridad</MenuGrupo>
              {priorityOptions.map((o) => (
                <MenuOpcion key={o.value} activa={prioridad.includes(o.value)} onClick={() => toggleMulti("prioridad", o.value)}>
                  {o.label}
                </MenuOpcion>
              ))}
            </>
          ) : null}
          {clientOptions.length ? (
            <>
              <MenuSeparador />
              <MenuGrupo>Cliente</MenuGrupo>
              <MenuOpcion activa={!cliente} icono={<Building2 />} onClick={() => pushParams({ cliente: null })}>Todos los clientes</MenuOpcion>
              {clientOptions.map((c) => (
                <MenuOpcion key={c.id} activa={cliente === c.id} onClick={() => pushParams({ cliente: c.id })}>{c.name}</MenuOpcion>
              ))}
            </>
          ) : null}
          {projectOptions.length || hasPersonal ? (
            <>
              <MenuSeparador />
              <MenuGrupo>Proyecto</MenuGrupo>
              <MenuOpcion activa={!proyecto} icono={<FolderOpen />} onClick={() => pushParams({ proyecto: null })}>Todos los proyectos</MenuOpcion>
              {hasPersonal ? (
                <MenuOpcion activa={proyecto === "personal"} onClick={() => pushParams({ proyecto: "personal" })}>🔒 Personales (sin proyecto)</MenuOpcion>
              ) : null}
              {projectOptions.map((p) => (
                <MenuOpcion key={p.id} activa={proyecto === p.id} onClick={() => pushParams({ proyecto: p.id })}>
                  {p.emoji ? `${emojiToText(p.emoji)} ` : ""}{p.name}
                </MenuOpcion>
              ))}
            </>
          ) : null}
          {filtrosPuestos > 0 || q || sp.get("urg") ? (
            <>
              <MenuSeparador />
              <MenuOpcion marca={false} onClick={limpiar}>Limpiar los filtros</MenuOpcion>
            </>
          ) : null}
        </MenuBarra>

        <MenuBarra clave="vista" etiqueta="Vista" icono={compacta ? <List /> : <Rows3 />} alineado="derecha">
          <MenuGrupo>Agrupar por</MenuGrupo>
          <MenuOpcion activa={grupo === "urgencia"} icono={<Calendar />} onClick={() => pushParams({ grupo: null })}>Urgencia</MenuOpcion>
          <MenuOpcion activa={grupo === "proyecto"} icono={<FolderOpen />} onClick={() => pushParams({ grupo: "proyecto" })}>Proyecto</MenuOpcion>
          <MenuOpcion activa={grupo === "prioridad"} icono={<Flag />} onClick={() => pushParams({ grupo: "prioridad" })}>Prioridad</MenuOpcion>
          <MenuSeparador />
          <MenuGrupo>Cuánto detalle</MenuGrupo>
          <MenuOpcion activa={!compacta} icono={<Rows3 />} onClick={() => pushParams({ d: null })}>Cómoda</MenuOpcion>
          <MenuOpcion activa={compacta} icono={<List />} onClick={() => pushParams({ d: "c" })} pista="una línea">Compacta</MenuOpcion>
          <MenuSeparador />
          {/* Quien conoce su día no necesita que se lo resuman: los dos bloques de arriba se
              pueden apagar y se recuperan del orden de 190 px de alto. */}
          <MenuOpcion activa={oculta.includes("resumen")} icono={<EyeOff />} onClick={() => toggleOculta("resumen")}>Ocultar el resumen</MenuOpcion>
          <MenuOpcion activa={oculta.includes("heroe")} icono={<EyeOff />} onClick={() => toggleOculta("heroe")}>Ocultar «Ahora sigue»</MenuOpcion>
        </MenuBarra>

        <MenuVistasGuardadas superficie="mis-tareas" claves={CLAVES_VISTA} iniciales={initialViews} />
      </BarraMandos>

      {/* Lo que está puesto, con su equis: el precio de guardar los mandos en menús. El tramo de la
          franja de resumen pone su propia pastilla desde el servidor, que es quien la calcula. */}
      {filtrosPuestos > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {estado.map((v) => (
            <ChipFiltro key={`e-${v}`} onQuitar={() => toggleMulti("estado", v)}>{etiquetaDe(statusOptions, v)}</ChipFiltro>
          ))}
          {prioridad.map((v) => (
            <ChipFiltro key={`p-${v}`} onQuitar={() => toggleMulti("prioridad", v)}>{etiquetaDe(priorityOptions, v)}</ChipFiltro>
          ))}
          {clienteSel ? <ChipFiltro onQuitar={() => pushParams({ cliente: null })}>{clienteSel.name}</ChipFiltro> : null}
          {proyectoSel ? <ChipFiltro onQuitar={() => pushParams({ proyecto: null })}>{proyectoSel.name}</ChipFiltro> : null}
        </div>
      ) : null}
    </div>
  );
}
