"use client";

import * as React from "react";
import { Camera, ChevronDown, Download, ExternalLink, Images, LayoutGrid, Play, Rows3, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeliveryGroupKey } from "@/lib/delivery-groups";

// ── Galería de entregas del cliente (portal del invitado) ──
// Lo aprobado y entregado, como una entrega premium. DOS vistas que el cliente alterna a gusto y
// se recuerdan por dispositivo:
//   · ROLLOS  (A): una tira horizontal por proyecto, tipo carrete de cine — panorámico.
//   · MOSAICO (B): un muro que respeta el formato de cada pieza (vertical/apaisado) — denso.
// En ambas, tocar una pieza la abre en ZOOM (lightbox): el video final se REPRODUCE ahí mismo
// (streaming del máster), con su descarga, formatos y portada. Los proyectos archivados no
// desaparecen: bajan a su sección plegada y su material sigue disponible.

export type HubItem = {
  id: string;
  name: string;
  number: number | null;
  group: DeliveryGroupKey;
  typeLabel: string;
  cover: string | null;
  coverDownload: string | null;
  versionNumber: number | null;
  approvedLabel: string;
  play: string | null; // reproducción en línea del máster (video local); null = fotos o Drive
  download: { href: string; external: boolean } | null;
  renditions: { id: string; label: string; url: string }[];
  photos: { count: number; liked: number; thumbs: string[]; galleryUrl: string } | null;
};

export type HubCover = { id: string; name: string; view: string; download: string };

export type HubProject = {
  id: string;
  name: string;
  emoji: string | null;
  bannerUrl: string | null;
  accentHex: string | null;
  archived: boolean;
  finished: boolean;
  deliveredLabel: string | null;
  items: HubItem[];
  covers: HubCover[];
};

type FilterKey = "todo" | DeliveryGroupKey | "portadas";
type Vista = "rollos" | "mosaico";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todo", label: "Todo" },
  { key: "reels", label: "Reels" },
  { key: "videos", label: "Videos" },
  { key: "fotos", label: "Fotos" },
  { key: "otros", label: "Otros" },
  { key: "portadas", label: "Portadas" },
];

const VISTA_KEY = "ls:galeria:vista:v1";

// El aspecto de una pieza: los reels son verticales; el resto del video, apaisado.
const isVertical = (g: DeliveryGroupKey) => g === "reels";

// ── El zoom (lightbox) ──
type LB = { kind: "video"; i: HubItem } | { kind: "cover"; c: HubCover };

function Lightbox({ media, onClose }: { media: LB; onClose: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Bloquea el scroll del fondo mientras el zoom está abierto.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in duration-200 sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <X className="size-5" />
      </button>

      <div
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* El medio: video que se reproduce, o imagen (portada / video de Drive). */}
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
          {media.kind === "video" && media.i.play ? (
            <video
              src={media.i.play}
              poster={media.i.cover ?? undefined}
              controls
              autoPlay
              playsInline
              className="max-h-[70vh] w-full object-contain"
            />
          ) : media.kind === "video" ? (
            media.i.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={media.i.cover} alt="" className="max-h-[70vh] w-full object-contain" />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center text-white/30">
                <Play className="size-12" />
              </div>
            )
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.c.view} alt={media.c.name} className="max-h-[70vh] w-full object-contain" />
          )}
        </div>

        {/* Pie: nombre + acciones (descargar, portada, formatos). */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border p-3.5">
          <div className="mr-auto min-w-0">
            <p className="truncate text-sm font-semibold" title={media.kind === "video" ? media.i.name : media.c.name}>
              {media.kind === "video" ? media.i.name : media.c.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {media.kind === "video"
                ? `${media.i.typeLabel}${media.i.versionNumber ? ` · v${media.i.versionNumber} final` : ""} · ${media.i.approvedLabel}`
                : "Portada aprobada"}
            </p>
          </div>

          {media.kind === "cover" ? (
            <a href={media.c.download} download="" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Download className="size-4" /> Descargar
            </a>
          ) : (
            <>
              {media.i.download ? (
                <a
                  href={media.i.download.href}
                  {...(media.i.download.external ? { target: "_blank", rel: "noreferrer" } : { download: "" })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  {media.i.download.external ? <ExternalLink className="size-4" /> : <Download className="size-4" />}
                  {media.i.download.external ? "Abrir original" : "Descargar"}
                </a>
              ) : null}
              {media.i.coverDownload ? (
                <a href={media.i.coverDownload} download="" title="Descargar la portada de este video" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
                  <Download className="size-3.5" /> Portada
                </a>
              ) : null}
              {media.i.renditions.length > 0 ? (
                <details className="relative">
                  <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent">
                    Formatos <ChevronDown className="size-3.5" />
                  </summary>
                  <div className="absolute bottom-full right-0 z-20 mb-1 w-48 rounded-lg border border-border bg-popover p-1 shadow-lg">
                    {media.i.renditions.map((r) => (
                      <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="block truncate rounded-md px-2 py-1.5 text-sm hover:bg-accent">
                        {r.label}
                      </a>
                    ))}
                  </div>
                </details>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Una pieza en la cuadrícula: el fotograma manda; el detalle vive en el zoom ──
function MediaTile({
  i,
  vista,
  onOpen,
}: {
  i: HubItem;
  vista: Vista;
  onOpen: (m: LB) => void;
}) {
  const aspect = isVertical(i.group) ? "aspect-[9/16]" : "aspect-video";
  // En rollos, la altura manda (carrete de cine de altura pareja); en mosaico, el ancho de columna.
  const shell =
    vista === "rollos"
      ? cn("h-48 shrink-0 snap-start sm:h-56", isVertical(i.group) ? "aspect-[9/16]" : "aspect-video")
      : cn("mb-3 w-full break-inside-avoid", aspect);

  // Set de FOTOS: enlaza a su galería de selección (no se reproduce en el zoom).
  if (i.photos) {
    return (
      <a
        href={i.photos.galleryUrl}
        target="_blank"
        rel="noreferrer"
        title={i.name}
        className={cn(
          "group relative block overflow-hidden rounded-xl border border-border bg-muted shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg",
          shell,
        )}
      >
        {i.photos.thumbs[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={i.photos.thumbs[0]} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground"><Camera className="size-7" /></div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
          <Images className="size-3" /> {i.photos.count}
        </span>
        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className="truncate text-sm font-semibold text-white drop-shadow" title={i.name}>{i.name}</p>
          <p className="truncate text-[11px] text-white/80">Ver galería ↗{i.photos.liked ? ` · ♥ ${i.photos.liked}` : ""}</p>
        </div>
      </a>
    );
  }

  // Video (o pieza con portada): abre el zoom.
  return (
    <button
      type="button"
      onClick={() => onOpen({ kind: "video", i })}
      title={i.name}
      className={cn(
        "group relative block overflow-hidden rounded-xl border border-border bg-zinc-900 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg",
        shell,
      )}
    >
      {i.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={i.cover} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-white/25"><Play className="size-9" /></div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />
      {/* Botón de play grande al centro (aparece al pasar el ratón). */}
      <span className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-zinc-900 opacity-0 shadow-xl transition-all duration-200 group-hover:opacity-100 group-hover:scale-105">
        <Play className="size-5 translate-x-0.5 fill-current" />
      </span>
      {i.versionNumber ? (
        <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">v{i.versionNumber} final</span>
      ) : null}
      <div className="absolute inset-x-0 bottom-0 p-2.5">
        <p className="truncate text-sm font-semibold text-white drop-shadow" title={i.name}>{i.name}</p>
        <p className="truncate text-[11px] text-white/80">{i.typeLabel}</p>
      </div>
    </button>
  );
}

function CoverTile({ c, vista, onOpen }: { c: HubCover; vista: Vista; onOpen: (m: LB) => void }) {
  const shell = vista === "rollos" ? "h-48 aspect-video shrink-0 snap-start sm:h-56" : "mb-3 aspect-video w-full break-inside-avoid";
  return (
    <button
      type="button"
      onClick={() => onOpen({ kind: "cover", c })}
      title={c.name}
      className={cn("group relative block overflow-hidden rounded-xl border border-border bg-muted text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg", shell)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={c.view} alt={c.name} loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-2.5">
        <p className="truncate text-[11px] font-semibold text-white drop-shadow">🖼️ {c.name}</p>
      </div>
    </button>
  );
}

function ProjectBlock({ p, filter, vista, onOpen }: { p: HubProject; filter: FilterKey; vista: Vista; onOpen: (m: LB) => void }) {
  const items = p.items.filter((i) => filter === "todo" || i.group === filter);
  const covers = filter === "todo" || filter === "portadas" ? p.covers : [];
  if (items.length === 0 && covers.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      {p.bannerUrl ? (
        <div className="relative h-16 w-full overflow-hidden sm:h-20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.bannerUrl} alt="" className="size-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>
      ) : p.accentHex ? (
        <div aria-hidden className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${p.accentHex}, transparent 80%)` }} />
      ) : null}
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 pb-2 pt-3">
        <h2 className="text-base font-bold tracking-tight">
          {p.emoji ? `${p.emoji} ` : ""}
          {p.name}
        </h2>
        <span className="text-xs text-muted-foreground">
          {p.items.length + p.covers.length} {p.items.length + p.covers.length === 1 ? "archivo" : "archivos"}
          {p.deliveredLabel ? ` · ${p.deliveredLabel}` : ""}
        </span>
        {p.archived ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Archivado</span>
        ) : p.finished ? (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Completo</span>
        ) : null}
      </div>

      {vista === "rollos" ? (
        // Carrete: tira horizontal de altura pareja, deslizable con snap.
        <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-4 pb-4 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
          {items.map((i) => (
            <MediaTile key={i.id} i={i} vista={vista} onOpen={onOpen} />
          ))}
          {covers.map((c) => (
            <CoverTile key={c.id} c={c} vista={vista} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        // Mosaico: muro por columnas que respeta el formato de cada pieza.
        <div className="columns-2 gap-3 px-4 pb-4 sm:columns-3 lg:columns-4">
          {items.map((i) => (
            <MediaTile key={i.id} i={i} vista={vista} onOpen={onOpen} />
          ))}
          {covers.map((c) => (
            <CoverTile key={c.id} c={c} vista={vista} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

export function FinalsHub({ projects }: { projects: HubProject[] }) {
  const [filter, setFilter] = React.useState<FilterKey>("todo");
  const [vista, setVista] = React.useState<Vista>("rollos");
  const [media, setMedia] = React.useState<LB | null>(null);

  // La vista elegida se recuerda por dispositivo (cada cliente ve la que prefiera). Se lee TRAS
  // el montaje a propósito: localStorage no existe en SSR y leerlo en el inicializador daría un
  // desajuste de hidratación. El aviso del linter (setState en efecto) no aplica a este patrón.
  React.useEffect(() => {
    const saved = window.localStorage.getItem(VISTA_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "rollos" || saved === "mosaico") setVista(saved);
  }, []);
  const pickVista = (v: Vista) => {
    setVista(v);
    try {
      window.localStorage.setItem(VISTA_KEY, v);
    } catch {
      /* modo privado: se queda en memoria */
    }
  };

  const active = projects.filter((p) => !p.archived);
  const archived = projects.filter((p) => p.archived);

  const countOf = (k: FilterKey) =>
    projects.reduce(
      (acc, p) => acc + (k === "portadas" ? p.covers.length : p.items.filter((i) => k === "todo" || i.group === k).length) + (k === "todo" ? p.covers.length : 0),
      0,
    );
  const total = countOf("todo");

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
        Aún no hay entregas aprobadas. Cuando apruebes tus piezas, aquí quedará tu galería para verlas y descargarlas cuando quieras.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filtros + interruptor de vista */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const n = countOf(f.key);
            if (f.key !== "todo" && n === 0) return null;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  filter === f.key
                    ? "border-transparent bg-primary/10 text-primary ring-1 ring-primary/40"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label} · {n}
              </button>
            );
          })}
        </div>
        {/* Segmentado Rollos / Mosaico (recordado por dispositivo). */}
        <div className="ml-auto inline-flex overflow-hidden rounded-full border border-border">
          <button
            type="button"
            onClick={() => pickVista("rollos")}
            aria-pressed={vista === "rollos"}
            title="Rollos por proyecto"
            className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors", vista === "rollos" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
          >
            <Rows3 className="size-3.5" /> Rollos
          </button>
          <button
            type="button"
            onClick={() => pickVista("mosaico")}
            aria-pressed={vista === "mosaico"}
            title="Mosaico"
            className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors", vista === "mosaico" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
          >
            <LayoutGrid className="size-3.5" /> Mosaico
          </button>
        </div>
      </div>

      {active.map((p) => (
        <ProjectBlock key={p.id} p={p} filter={filter} vista={vista} onOpen={setMedia} />
      ))}

      {archived.length > 0 ? (
        <details className="rounded-2xl border border-dashed border-border bg-muted/30 open:bg-transparent">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
            📦 Proyectos archivados · {archived.length} — el material sigue disponible
          </summary>
          <div className="space-y-4 px-4 pb-4">
            {archived.map((p) => (
              <ProjectBlock key={p.id} p={p} filter={filter} vista={vista} onOpen={setMedia} />
            ))}
          </div>
        </details>
      ) : null}

      {media ? <Lightbox media={media} onClose={() => setMedia(null)} /> : null}
    </div>
  );
}
