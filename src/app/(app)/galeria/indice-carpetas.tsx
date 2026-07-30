"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight, Folder, LayoutGrid, List, Search, SortAsc } from "lucide-react";
import { cn } from "@/lib/utils";
import { tone } from "@/lib/colors";
import { cerrarMenu, usePreferenciaLocal } from "@/components/ui/barra-menu";
import { Miniatura } from "@/components/discos/miniatura";
import type { GaleriaFolder } from "@/lib/nas-galeria";

// El CLIENTE al que está vinculada una carpeta: su tarjeta se tiñe con su color (la misma
// paleta que su cabecera y sus chips en la barra), así el índice se organiza a simple vista
// sin leer los nombres uno a uno.
export type DuenoIndice = { nombre: string; color: string | null };

// ── El índice de entregas ──────────────────────────────────────────────────────
// El mismo lenguaje que la ficha del disco y el explorador de Operaciones: UNA tarjeta con
// la barra arriba (buscar, ordenar, vista), las carpetas como fichas bajas teñidas con el
// color de su cliente, y el pie con el estado. Los datos que costaron ganarse se conservan:
// cada carpeta sigue enseñando sus piezas, su peso y la fecha de su material MÁS NUEVO (la
// fecha de la CARPETA es un dato falso: cualquier escritura la actualiza entera).
//
// Eso hay que ir a buscarlo al disco, así que el índice se pinta al instante con lo que ya
// se sabe (el nombre) y cada ficha se completa cuando llega su resumen, de cuatro en cuatro
// para no ahogar el NFS.
//
// La vista de LISTA es donde viven las miniaturas de la raíz: cada fila lleva la portada de
// su material más nuevo, en el mismo tamaño de las filas del resto de la app.

type Resumen = {
  piezas: number;
  bytes: number;
  ultimoMs: number;
  portadaRel: string | null;
  truncado: boolean;
};

type Orden = "reciente" | "nombre" | "tamano";

const ORDENES: { id: Orden; etiqueta: string }[] = [
  { id: "reciente", etiqueta: "Más reciente" },
  { id: "nombre", etiqueta: "Nombre" },
  { id: "tamano", etiqueta: "Tamaño" },
];

const A_LA_VEZ = 4;

function pesar(bytes: number): string {
  if (bytes <= 0) return "";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const n = bytes / 1024 ** i;
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
}

const FECHA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric" });
function fecha(ms: number): string {
  return ms ? FECHA.format(new Date(ms)) : "";
}

// Quita tildes y pasa a minúsculas: buscar «filarmonica» tiene que encontrar «Filarmónica».
function plano(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// La segunda línea de una carpeta: qué tiene dentro, dicho corto.
function metaDe(r: Resumen | undefined): string {
  if (!r) return "leyendo…";
  const partes: string[] = [];
  partes.push(r.piezas > 0 ? `${r.truncado ? "+" : ""}${r.piezas.toLocaleString("es-CO")} ${r.piezas === 1 ? "pieza" : "piezas"}` : "vacía");
  if (r.bytes > 0) partes.push(pesar(r.bytes));
  if (r.ultimoMs > 0) partes.push(fecha(r.ultimoMs));
  return partes.join(" · ");
}

// El cuadro de portada de una ficha: la imagen del material más nuevo, cuadrada y discreta.
// Mientras carga es un hueco quieto (nada parpadea) y si el póster aún no está fabricado el
// cuadro desaparece — un icono roto diría «error» donde solo hay una fábrica en cola.
function CuadroPortada({ rel, v }: { rel: string; v: number }) {
  const [estado, setEstado] = React.useState<"cargando" | "ok" | "sin">("cargando");
  if (estado === "sin") return null;
  return (
    <span className={cn("relative size-11 shrink-0 overflow-hidden rounded-lg", estado !== "ok" && "bg-black/10 dark:bg-white/10")}>
      {/* La sirve nuestra propia ruta leyendo del NAS: next/image no puede con eso. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/galeria/thumb?rel=${encodeURIComponent(rel)}&v=${v}`}
        alt=""
        loading="lazy"
        onLoad={() => setEstado("ok")}
        onError={() => setEstado("sin")}
        className={cn("size-full object-cover", estado === "ok" ? "opacity-100" : "opacity-0")}
      />
    </span>
  );
}

export function IndiceCarpetas({
  folders,
  duenos,
  onAbrir,
  // "indice" = la raíz de la galería: tarjeta completa con barra y pie. "seccion" = las
  // subcarpetas dentro de una entrega: solo las fichas, porque el nivel ya tiene su barra
  // (CabeceraEntrega) y duplicar buscadores confunde más de lo que ayuda.
  variante = "indice",
}: {
  folders: GaleriaFolder[];
  duenos?: Record<string, DuenoIndice>;
  onAbrir: (rel: string) => void;
  variante?: "indice" | "seccion";
}) {
  const [resumenes, setResumenes] = React.useState<Record<string, Resumen>>({});
  const [orden, setOrden] = React.useState<Orden>("reciente");
  const [busca, setBusca] = React.useState("");
  // La misma preferencia por navegador que el resto de exploradores de discos.
  const [vista, setVista] = usePreferenciaLocal<"lista" | "cuadricula">("galeria-indice-vista", "cuadricula");

  // Los resúmenes se piden en tandas y el resultado se guarda por carpeta. `vivo` corta el
  // goteo si se sale de la pantalla a media carga: sin él, seguiría pidiendo carpeta a
  // carpeta contra el NAS después de que nadie mire.
  React.useEffect(() => {
    let vivo = true;
    const pendientes = folders.map((f) => f.rel);
    (async () => {
      for (let i = 0; i < pendientes.length; i += A_LA_VEZ) {
        if (!vivo) return;
        const tanda = pendientes.slice(i, i + A_LA_VEZ);
        const hechos = await Promise.all(
          tanda.map(async (rel) => {
            try {
              const res = await fetch(`/api/galeria/resumen?rel=${encodeURIComponent(rel)}`, { cache: "no-store" });
              if (!res.ok) return null;
              return { rel, datos: (await res.json()) as Resumen };
            } catch {
              return null; // una carpeta ilegible no puede tumbar el índice entero
            }
          }),
        );
        if (!vivo) return;
        setResumenes((prev) => {
          const siguiente = { ...prev };
          for (const h of hechos) if (h) siguiente[h.rel] = h.datos;
          return siguiente;
        });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [folders]);

  const visibles = React.useMemo(() => {
    const q = plano(busca.trim());
    const lista = q ? folders.filter((f) => plano(f.name).includes(q)) : folders.slice();
    lista.sort((a, b) => {
      const ra = resumenes[a.rel];
      const rb = resumenes[b.rel];
      if (orden === "nombre") return a.name.localeCompare(b.name, "es");
      if (orden === "tamano") return (rb?.bytes ?? 0) - (ra?.bytes ?? 0);
      // Por reciente: manda la fecha del material. Mientras un resumen no ha llegado se usa
      // la de la carpeta, que es lo único que hay, y la ficha se recoloca sola al llegar.
      return (rb?.ultimoMs || b.mtimeMs) - (ra?.ultimoMs || a.mtimeMs);
    });
    return lista;
  }, [folders, resumenes, orden, busca]);

  // Una ficha baja por carpeta: nombre y contenido a la izquierda y, cuando la carpeta tiene
  // material, su portada en un cuadro a la derecha — pequeña a propósito: identifica sin
  // robarle el protagonismo al nombre. Una carpeta vacía no finge: sin portada no hay cuadro.
  // El color es el del cliente dueño; sin dueño, la carpeta neutra de siempre.
  const fichas = (
    <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3", variante === "indice" && "p-3")}>
      {visibles.map((f) => {
        const r = resumenes[f.rel];
        const dueno = duenos?.[f.rel];
        return (
          <button
            key={f.rel}
            type="button"
            onClick={() => onAbrir(f.rel)}
            title={dueno ? `Carpeta de ${dueno.nombre}` : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left",
              dueno
                ? cn(tone(dueno.color ?? "slate").chip, "hover:brightness-95 dark:hover:brightness-110")
                : "border-border bg-muted/30 hover:bg-accent",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="flex w-full items-center gap-2">
                <Folder className={cn("size-4 shrink-0", dueno ? "opacity-70" : "text-[#F47A20]")} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{f.name.replace(/_/g, " ")}</span>
              </span>
              <span className="block truncate pl-6 text-[10px] opacity-75">{metaDe(r)}</span>
            </span>
            {r?.portadaRel ? <CuadroPortada rel={r.portadaRel} v={r.ultimoMs} /> : null}
          </button>
        );
      })}
    </div>
  );

  // Dentro de una entrega no hay tarjeta propia: las fichas se integran en la sección
  // «Carpetas» del nivel, que ya tiene su barra y su rótulo.
  if (variante === "seccion") return fichas;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* La barra: dónde estás, buscar, ordenar (desplegable) y la vista. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <span className="px-1.5 text-xs font-semibold">Entregas_LAB</span>
        <span className="min-w-0 flex-1" />
        <label className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar entrega…"
            className="w-40 rounded-md border border-border bg-background py-1 pl-8 pr-2 text-xs outline-none focus:border-primary"
          />
        </label>
        <details data-autoclose className="group/ord relative shrink-0">
          <summary className="inline-flex h-7 cursor-pointer list-none items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground [&::-webkit-details-marker]:hidden">
            <SortAsc className="size-3.5" />
            {ORDENES.find((o) => o.id === orden)?.etiqueta}
            <ChevronDown className="size-3 opacity-70 transition-transform group-open/ord:rotate-180" />
          </summary>
          <div className="absolute right-0 z-20 mt-1 flex w-40 flex-col rounded-lg border border-border bg-popover p-1 shadow-lg">
            {ORDENES.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={(e) => {
                  cerrarMenu(e);
                  setOrden(o.id);
                }}
                className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-muted"
              >
                {o.etiqueta}
                {orden === o.id ? <Check className="size-3.5 text-primary" /> : null}
              </button>
            ))}
          </div>
        </details>
        <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border" role="group" aria-label="Vista">
          {([["lista", List, "Lista"], ["cuadricula", LayoutGrid, "Cuadrícula"]] as const).map(([k, Icono, etiqueta]) => (
            <button
              key={k}
              type="button"
              onClick={() => setVista(k)}
              title={etiqueta}
              aria-label={etiqueta}
              aria-pressed={vista === k}
              className={cn(
                "flex size-7 items-center justify-center",
                vista === k ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icono className="size-3.5" />
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">Ninguna entrega se llama así.</p>
      ) : vista === "cuadricula" ? (
        fichas
      ) : (
        <ul className="divide-y divide-border">
          {visibles.map((f) => {
            const r = resumenes[f.rel];
            const dueno = duenos?.[f.rel];
            return (
              <li key={f.rel}>
                <button type="button" onClick={() => onAbrir(f.rel)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/60">
                  {/* La portada del material más nuevo, a tamaño de fila. Si la carpeta tiene
                      portada pero LabTem aún no fabricó su póster, dice «preparando» en vez
                      de fingir un icono roto. */}
                  {r?.portadaRel ? (
                    <Miniatura
                      thumb={`/api/galeria/thumb?rel=${encodeURIComponent(r.portadaRel)}&v=${r.ultimoMs}`}
                      tipo="foto"
                      hay
                      preparandoSiFalta
                    />
                  ) : (
                    <span className="flex h-8 w-14 shrink-0 items-center justify-center rounded border border-border bg-muted">
                      <Folder className="size-4 text-[#F47A20]" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name.replace(/_/g, " ")}</span>
                  {dueno ? (
                    <span className={cn("shrink-0 rounded px-1.5 py-px text-[10px] font-semibold", tone(dueno.color ?? "slate").chip)}>
                      {dueno.nombre}
                    </span>
                  ) : null}
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{metaDe(r)}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        <span>
          {visibles.length === folders.length
            ? `${folders.length} ${folders.length === 1 ? "entrega" : "entregas"}`
            : `${visibles.length} de ${folders.length}`}
          {" · se lee el disco en vivo"}
        </span>
        <a href="#entregas-compartidas" className="ml-auto font-medium text-primary hover:underline">
          Entregas compartidas →
        </a>
      </div>
    </div>
  );
}
