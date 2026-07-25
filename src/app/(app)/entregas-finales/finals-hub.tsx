"use client";

import * as React from "react";
import { Camera, ChevronDown, Download, ExternalLink, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeliveryGroupKey } from "@/lib/delivery-groups";

// ── Entregas finales 2.0 (portal del invitado) ──
// Biblioteca de descargas agrupada POR PROYECTO: cada proyecto con su banner y color, todo su
// material junto (reels, videos, fotos, portadas) y los proyectos archivados en su propia
// sección plegada — el material no desaparece cuando el proyecto se cierra.

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
  deliveredLabel: string | null; // «entregado el 12 de julio»
  items: HubItem[];
  covers: HubCover[];
};

type FilterKey = "todo" | DeliveryGroupKey | "portadas";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todo", label: "Todo" },
  { key: "reels", label: "Reels" },
  { key: "videos", label: "Videos" },
  { key: "fotos", label: "Fotos" },
  { key: "otros", label: "Otros" },
  { key: "portadas", label: "Portadas" },
];

function ItemCard({ i }: { i: HubItem }) {
  if (i.photos) {
    return (
      <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/40">
        {i.photos.thumbs.length > 0 ? (
          <div className="grid grid-cols-3 gap-0.5 bg-muted/40">
            {i.photos.thumbs.map((src, k) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={k} src={src} alt="" loading="lazy" className="aspect-square w-full object-cover" />
            ))}
          </div>
        ) : (
          <div className="flex aspect-[3/1] items-center justify-center bg-muted/40">
            <Camera className="size-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold" title={i.name}>{i.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {i.photos.count} fotos{i.photos.liked ? ` · ♥ ${i.photos.liked} elegidas` : ""}
            </p>
          </div>
          <a
            href={i.photos.galleryUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Abrir galería ↗
          </a>
        </div>
      </article>
    );
  }

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/40">
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        <div className="absolute inset-0 flex items-center justify-center">
          <Play className="size-6 text-muted-foreground" />
        </div>
        {i.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={i.cover} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
        ) : null}
        {i.versionNumber ? (
          <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">v{i.versionNumber} final</span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-sm font-semibold" title={i.name}>{i.name}</p>
        <p className="truncate text-xs text-muted-foreground">{i.typeLabel}</p>
        <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">✓ {i.approvedLabel}</p>
        <div className="mt-auto flex items-center gap-1.5 pt-1.5">
          {i.download ? (
            <a
              href={i.download.href}
              {...(i.download.external ? { target: "_blank", rel: "noreferrer" } : { download: "" })}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              {i.download.external ? <ExternalLink className="size-3.5" /> : <Download className="size-3.5" />}
              {i.download.external ? "Abrir" : "Descargar"}
            </a>
          ) : (
            <span className="flex-1 text-center text-[11px] text-muted-foreground">Pídele el archivo al equipo</span>
          )}
          {i.coverDownload ? (
            <a
              href={i.coverDownload}
              download=""
              title="Descargar la portada aprobada de este video"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Download className="size-3" /> Portada
            </a>
          ) : null}
          {i.renditions.length > 0 ? (
            <details className="relative">
              <summary
                className="flex cursor-pointer list-none items-center gap-0.5 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent"
                title="Otros formatos"
              >
                Formatos <ChevronDown className="size-3" />
              </summary>
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-popover p-1 shadow-lg">
                {i.renditions.map((r) => (
                  <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="block truncate rounded-md px-2 py-1.5 text-xs hover:bg-accent">
                    {r.label}
                  </a>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ProjectBlock({ p, filter }: { p: HubProject; filter: FilterKey }) {
  const items = p.items.filter((i) => filter === "todo" || i.group === filter);
  const covers = filter === "todo" || filter === "portadas" ? p.covers : [];
  if (items.length === 0 && covers.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      {/* Cabecera del proyecto: banda de portada (si hay) + nombre + meta. */}
      {p.bannerUrl ? (
        <div className="relative h-16 w-full overflow-hidden sm:h-20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.bannerUrl} alt="" className="size-full object-cover" loading="lazy" />
        </div>
      ) : p.accentHex ? (
        <div aria-hidden className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${p.accentHex}, transparent 80%)` }} />
      ) : null}
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-4 pb-1 pt-3">
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
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((i) => (
          <ItemCard key={i.id} i={i} />
        ))}
        {covers.map((c) => (
          <a
            key={c.id}
            href={c.download}
            download=""
            title={`Descargar ${c.name}`}
            className="group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.view} alt={c.name} loading="lazy" className="aspect-video w-full object-cover" />
            <p className="truncate px-2 py-1.5 text-[11px] font-medium" title={c.name}>🖼️ {c.name}</p>
          </a>
        ))}
      </div>
    </section>
  );
}

export function FinalsHub({ projects }: { projects: HubProject[] }) {
  const [filter, setFilter] = React.useState<FilterKey>("todo");

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
      <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
        Aún no hay entregas aprobadas. Cuando apruebes tus piezas, aquí quedará tu biblioteca para descargarlas cuando quieras.
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {active.map((p) => (
        <ProjectBlock key={p.id} p={p} filter={filter} />
      ))}

      {archived.length > 0 ? (
        <details className="rounded-2xl border border-dashed border-border bg-muted/30 open:bg-transparent">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
            📦 Proyectos archivados · {archived.length} — el material sigue disponible para descargar
          </summary>
          <div className="space-y-4 px-4 pb-4">
            {archived.map((p) => (
              <ProjectBlock key={p.id} p={p} filter={filter} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
