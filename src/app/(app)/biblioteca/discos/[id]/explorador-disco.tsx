"use client";

import * as React from "react";
import { Check, ChevronRight, Copy, Download, ExternalLink, Folder, LayoutGrid, List, Loader2, RefreshCw, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreferenciaLocal } from "@/components/ui/barra-menu";
import { Miniatura, type TipoPieza } from "@/components/discos/miniatura";
import { nivelDelDisco } from "../../explorar-actions";
import type { NivelEntrada } from "@/lib/disco-raiz";

// Explorador de SOLO LECTURA de un disco montado, dentro de su ficha: se ve qué hay sin salir
// de la Biblioteca. Para trabajar sobre los archivos (subir, mover, renombrar) el pie manda a
// Operaciones o a la Galería, que ya tienen esas manos y sus permisos.

const IMG = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "heic", "tif", "tiff", "dng", "cr2", "cr3", "nef", "arw"]);
const VID = new Set(["mp4", "m4v", "mov", "mkv", "webm", "avi", "mxf", "mts", "m2ts", "braw", "r3d", "prores"]);
const AUD = new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg"]);

function extDe(name: string): string {
  return (name.split(".").pop() || "").toLowerCase();
}
function tipoDe(name: string): TipoPieza {
  const e = extDe(name);
  if (VID.has(e)) return "video";
  if (IMG.has(e)) return "foto";
  if (AUD.has(e)) return "audio";
  return "doc";
}

function tam(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
const FECHA = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric" });
function fecha(ms: number): string {
  return ms ? FECHA.format(new Date(ms)) : "";
}

// ── El panel de detalle ────────────────────────────────────────────────────────
// Elegir una pieza no debería obligar a salir de la carpeta para saber qué es. Aquí está lo
// que se necesita para decidir: el fotograma en grande (con barrido, si lo tiene), el peso, la
// fecha y —lo que más se usa— la RUTA, que es exactamente lo que hay que teclear en el mapa
// del material y hasta ahora se copiaba a mano mirando la pantalla.
function PanelDetalle({
  pieza,
  urls,
  hrefBase,
  onCerrar,
}: {
  pieza: NivelEntrada;
  urls: { tipo: TipoPieza; thumb: string; tira: string | null; descarga: string; preparando: boolean };
  hrefBase: string;
  onCerrar: () => void;
}) {
  // La carpeta que CONTIENE la pieza: es a donde lleva «Abrir carpeta» para trabajar con ella.
  const carpetaPadre = pieza.rel.includes("/") ? pieza.rel.slice(0, pieza.rel.lastIndexOf("/")) : "";
  const [copiado, setCopiado] = React.useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(pieza.rel);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* sin permiso de portapapeles: la ruta se ve entera abajo y se puede seleccionar */
    }
  };

  const btn = "inline-flex items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent";

  return (
    <aside className="w-full shrink-0 border-t border-border bg-muted/20 p-4 lg:w-72 lg:border-l lg:border-t-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pieza elegida</p>
        <button type="button" onClick={onCerrar} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Cerrar el panel">
          <X className="size-3.5" />
        </button>
      </div>

      <div className="mt-2">
        <Miniatura thumb={urls.thumb} tira={urls.tira} tipo={urls.tipo} alto="tarjeta" hay={pieza.miniatura} preparandoSiFalta={urls.preparando} />
      </div>

      <p className="mt-2.5 break-words text-sm font-medium">{pieza.name}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {[tam(pieza.size), fecha(pieza.mtimeMs)].filter(Boolean).join(" · ")}
      </p>

      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dónde está</p>
      <p className="mt-1 break-all rounded-md bg-background px-2 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {pieza.rel}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => void copiar()} className={btn} title="Copiar la ruta para pegarla en el mapa del material">
          {copiado ? <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="size-3.5" />}
          {copiado ? "Copiada" : "Copiar ruta"}
        </button>
        <a href={urls.descarga} className={btn}>
          <Download className="size-3.5" /> Descargar
        </a>
        <a href={`${hrefBase}${encodeURIComponent(carpetaPadre)}`} className={btn}>
          <ExternalLink className="size-3.5" /> Abrir carpeta
        </a>
      </div>
    </aside>
  );
}

export function ExploradorDisco({
  diskId,
  montaje,
  raizNombre,
  hrefBase,
  inicial,
}: {
  diskId: string;
  // Qué disco es, para pedir la miniatura a la ruta que le corresponde. Solo el de LabTem
  // tiene fábrica de copias ligeras: allí la falta de póster es «aún no fabricado», y en
  // Operaciones es «no habrá» (su ruta hace la miniatura al vuelo, y solo de imágenes).
  montaje: "OPS" | "GALERIA";
  raizNombre: string; // "Operaciones_LAB" | "Entregas_LAB"
  // Prefijo de la pantalla donde SÍ se trabaja con los archivos ("/operaciones?path=").
  // Se pasa como texto y no como función: una función no cruza la frontera servidor→cliente.
  hrefBase: string;
  // La raíz ya viene LEÍDA del servidor: la ficha se pinta con contenido, sin el parpadeo de
  // «cargando…» que deja un hueco cada vez que se abre un disco.
  inicial: { carpetas: NivelEntrada[]; archivos: NivelEntrada[]; truncado: boolean };
}) {
  const [rel, setRel] = React.useState("");
  const [carpetas, setCarpetas] = React.useState<NivelEntrada[]>(inicial.carpetas);
  const [archivos, setArchivos] = React.useState<NivelEntrada[]>(inicial.archivos);
  const [truncado, setTruncado] = React.useState(inicial.truncado);
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [filtro, setFiltro] = React.useState("");
  // La pieza elegida abre el panel de detalle. Se guarda entera (no solo el rel) para poder
  // pintarla sin volver a buscarla en la lista.
  const [sel, setSel] = React.useState<NivelEntrada | null>(null);
  // Lista para leer nombres, cuadrícula para reconocer fotogramas. Se recuerda por navegador:
  // quien busca material a ojo no debería volver a pedirlo cada vez que entra a un disco.
  const [vista, setVista] = usePreferenciaLocal<"lista" | "cuadricula">("disco-vista", "lista");

  const cargar = React.useCallback(
    async (destino: string) => {
      setCargando(true);
      setError(null);
      const r = await nivelDelDisco(diskId, destino);
      setCargando(false);
      if ("error" in r) {
        setCarpetas([]);
        setArchivos([]);
        return setError(r.error);
      }
      setRel(r.rel);
      setCarpetas(r.carpetas);
      setArchivos(r.archivos);
      setTruncado(r.truncado);
    },
    [diskId],
  );

  const ir = (destino: string) => {
    setFiltro("");
    setSel(null); // la pieza elegida era de la carpeta que se deja atrás
    void cargar(destino);
  };

  // Las URL de cada disco: la miniatura, la tira de barrido y el archivo en sí.
  const urls = (e: NivelEntrada) => {
    const v = Math.round(e.mtimeMs);
    const tipo = tipoDe(e.name);
    return {
      tipo,
      thumb:
        montaje === "GALERIA"
          ? `/api/galeria/thumb?rel=${encodeURIComponent(e.rel)}&v=${v}`
          : `/api/ops/thumb?path=${encodeURIComponent(e.rel)}&v=${v}`,
      tira: montaje === "GALERIA" && tipo === "video" ? `/api/galeria/tira?rel=${encodeURIComponent(e.rel)}&v=${v}` : null,
      descarga:
        montaje === "GALERIA"
          ? `/api/galeria/media?rel=${encodeURIComponent(e.rel)}&descargar=1`
          : `/api/ops/file?path=${encodeURIComponent(e.rel)}&download=1`,
      // Solo el disco de LabTem tiene fábrica: allí «sin póster» significa «aún no».
      preparando: montaje === "GALERIA",
    };
  };

  const migas = rel ? rel.split("/") : [];
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(filtro.trim());
  const cVis = q ? carpetas.filter((c) => norm(c.name).includes(q)) : carpetas;
  const aVis = q ? archivos.filter((a) => norm(a.name).includes(q)) : archivos;
  // Piezas de ESTA carpeta que la fábrica aún no ha tocado (solo tiene sentido donde hay
  // fábrica: en Operaciones la falta de miniatura no es una cola, es que no la habrá).
  const pendientes =
    montaje === "GALERIA" ? archivos.filter((a) => !a.miniatura && tipoDe(a.name) !== "doc" && tipoDe(a.name) !== "audio").length : 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Migas + herramientas */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-xs">
          <button
            type="button"
            onClick={() => ir("")}
            className={cn("max-w-[13rem] truncate rounded px-1.5 py-0.5 hover:bg-accent", migas.length === 0 ? "font-semibold" : "text-muted-foreground")}
          >
            {raizNombre}
          </button>
          {migas.map((seg, i) => {
            const destino = migas.slice(0, i + 1).join("/");
            const ultimo = i === migas.length - 1;
            return (
              <React.Fragment key={destino}>
                <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
                <button
                  type="button"
                  onClick={() => ir(destino)}
                  className={cn("max-w-[11rem] truncate rounded px-1.5 py-0.5 hover:bg-accent", ultimo ? "font-semibold" : "text-muted-foreground")}
                >
                  {seg}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <label className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar esta carpeta…"
            className="w-40 rounded-md border border-border bg-background py-1 pl-8 pr-2 text-xs outline-none focus:border-primary"
          />
        </label>
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
        <button
          type="button"
          onClick={() => void cargar(rel)}
          title="Volver a leer el disco"
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className={cn("size-3.5", cargando && "animate-spin")} />
        </button>
      </div>

      {/* Lista y panel de detalle, lado a lado. En pantallas estrechas el panel se apila
          debajo: a media pantalla, dos columnas dejan la lista sin sitio para los nombres. */}
      <div className="flex flex-col lg:flex-row">
      <div className="min-w-0 flex-1">
      {cargando ? (
        <p className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Leyendo el disco…
        </p>
      ) : error ? (
        <p className="px-4 py-10 text-center text-sm text-destructive">{error}</p>
      ) : cVis.length === 0 && aVis.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
          {q ? `Nada coincide con «${filtro}».` : "Esta carpeta está vacía."}
        </p>
      ) : vista === "cuadricula" ? (
        // Cuadrícula: las carpetas primero como tarjetas bajas (son escalones, no destino),
        // y debajo el material a tamaño de fotograma, que es lo que se viene a reconocer.
        <div className="space-y-3 p-3">
          {cVis.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {cVis.map((c) => (
                <button
                  key={c.rel}
                  type="button"
                  onClick={() => ir(c.rel)}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2 text-left hover:bg-accent"
                >
                  <Folder className="size-4 shrink-0 text-[#F47A20]" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{c.name}</span>
                </button>
              ))}
            </div>
          ) : null}
          {aVis.length > 0 ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {aVis.map((a) => {
                const u = urls(a);
                const on = sel?.rel === a.rel;
                return (
                  <button
                    key={a.rel}
                    type="button"
                    onClick={() => setSel(on ? null : a)}
                    className={cn(
                      "overflow-hidden rounded-lg border text-left transition",
                      on ? "border-primary ring-2 ring-primary/25" : "border-border hover:border-border/80 hover:bg-accent/40",
                    )}
                  >
                    <Miniatura thumb={u.thumb} tira={u.tira} tipo={u.tipo} alto="tarjeta" hay={a.miniatura} preparandoSiFalta={u.preparando} />
                    <span className="block px-2 py-1.5">
                      <span className="block truncate text-xs font-medium">{a.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {[tam(a.size), fecha(a.mtimeMs)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {cVis.map((c) => (
            <li key={c.rel}>
              <button type="button" onClick={() => ir(c.rel)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/60">
                <Folder className="size-4 shrink-0 text-[#F47A20]" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
              </button>
            </li>
          ))}
          {aVis.map((a) => {
            const u = urls(a);
            const on = sel?.rel === a.rel;
            return (
              <li key={a.rel}>
                <button
                  type="button"
                  // Elegir la misma pieza dos veces cierra el panel: el clic que la abrió es
                  // el mismo que la cierra, sin buscar una ✕.
                  onClick={() => setSel(on ? null : a)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2 text-left",
                    on ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : "hover:bg-muted/60",
                  )}
                >
                  <Miniatura thumb={u.thumb} tira={u.tira} tipo={u.tipo} hay={a.miniatura} preparandoSiFalta={montaje === "GALERIA"} />
                  <span className={cn("min-w-0 flex-1 truncate text-sm", on && "font-medium")}>{a.name}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {[tam(a.size), fecha(a.mtimeMs)].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      </div>

      {sel ? <PanelDetalle pieza={sel} urls={urls(sel)} hrefBase={hrefBase} onCerrar={() => setSel(null)} /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        {truncado ? <span>Esta carpeta tiene más de 2000 elementos: se muestran los primeros.</span> : <span>Se lee el disco en vivo.</span>}
        {/* Cuántas piezas siguen sin copia ligera. Es la diferencia entre «la app va rara» y
            «la fábrica va por detrás», y ahora se puede decir sin coste: el dato ya vino. */}
        {pendientes > 0 ? (
          <span className="text-amber-600 dark:text-amber-400">
            {pendientes} {pendientes === 1 ? "pieza" : "piezas"} sin copia ligera todavía
          </span>
        ) : null}
        <a href={`${hrefBase}${encodeURIComponent(rel)}`} className="ml-auto font-medium text-primary hover:underline">
          Abrir esta carpeta para trabajar →
        </a>
      </div>
    </div>
  );
}
