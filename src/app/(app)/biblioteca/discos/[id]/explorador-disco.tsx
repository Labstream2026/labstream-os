"use client";

import * as React from "react";
import {
  ChevronRight,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Film,
  Folder,
  Image as ImageIcon,
  Loader2,
  Music,
  RefreshCw,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { nivelDelDisco } from "../../explorar-actions";
import type { NivelEntrada } from "@/lib/disco-raiz";

// Explorador de SOLO LECTURA de un disco montado, dentro de su ficha: se ve qué hay sin salir
// de la Biblioteca. Para trabajar sobre los archivos (subir, mover, renombrar) el pie manda a
// Operaciones o a la Galería, que ya tienen esas manos y sus permisos.

const IMG = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "heic", "tif", "tiff", "dng", "cr2", "cr3", "nef", "arw"]);
const VID = new Set(["mp4", "m4v", "mov", "mkv", "webm", "avi", "mxf", "mts", "m2ts", "braw", "r3d", "prores"]);
const AUD = new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg"]);
const HOJA = new Set(["xls", "xlsx", "ods", "csv"]);
const DOC = new Set(["pdf", "doc", "docx", "odt", "rtf", "txt", "md", "ppt", "pptx", "srt", "vtt", "fcpxml", "xml"]);

function extDe(name: string): string {
  return (name.split(".").pop() || "").toLowerCase();
}
function IconoArchivo({ name }: { name: string }) {
  const e = extDe(name);
  const cls = "size-4 shrink-0 text-muted-foreground";
  if (IMG.has(e)) return <ImageIcon className={cls} />;
  if (VID.has(e)) return <Film className={cls} />;
  if (AUD.has(e)) return <Music className={cls} />;
  if (HOJA.has(e)) return <FileSpreadsheet className={cls} />;
  if (DOC.has(e)) return <FileText className={cls} />;
  return <FileIcon className={cls} />;
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

export function ExploradorDisco({
  diskId,
  raizNombre,
  hrefBase,
  inicial,
}: {
  diskId: string;
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
    void cargar(destino);
  };

  const migas = rel ? rel.split("/") : [];
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(filtro.trim());
  const cVis = q ? carpetas.filter((c) => norm(c.name).includes(q)) : carpetas;
  const aVis = q ? archivos.filter((a) => norm(a.name).includes(q)) : archivos;

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
        <button
          type="button"
          onClick={() => void cargar(rel)}
          title="Volver a leer el disco"
          className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshCw className={cn("size-3.5", cargando && "animate-spin")} />
        </button>
      </div>

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
          {aVis.map((a) => (
            <li key={a.rel} className="flex items-center gap-3 px-4 py-2">
              <IconoArchivo name={a.name} />
              <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {[tam(a.size), fecha(a.mtimeMs)].filter(Boolean).join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
        {truncado ? <span>Esta carpeta tiene más de 2000 elementos: se muestran los primeros.</span> : <span>Se lee el disco en vivo.</span>}
        <a href={`${hrefBase}${encodeURIComponent(rel)}`} className="ml-auto font-medium text-primary hover:underline">
          Abrir esta carpeta para trabajar →
        </a>
      </div>
    </div>
  );
}
