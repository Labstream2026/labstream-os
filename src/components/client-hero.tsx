"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ImagePlus, LayoutGrid, Loader2, Palette, Pencil, Trash2 } from "lucide-react";
import { TONES, tone } from "@/lib/colors";
import { HERO_PRESETS, heroPreset } from "@/lib/client-hero-presets";
import { EntityEmoji, lsMark, emojiToText } from "@/components/icons/marks";
import { cn } from "@/lib/utils";

type SaveResult = { ok: boolean; error?: string };

// ── Cabecera-portada del cliente (estilo Notion, dirección «Cine») ──
// La ficha del cliente y el portal comparten esta pieza: portada ancha (imagen subida,
// preset de la galería o degradado del color) con el nombre encima sobre un velo oscuro.
// En la ficha, quien puede editar tiene los controles EN la propia portada (galería,
// subir, color, quitar) y reencuadra la imagen ARRASTRÁNDOLA (se guarda bannerPosY).
// En el portal el cliente la ve tal cual, solo lectura — misma columna, cero trabajo doble.
export function ClientHero({
  name,
  company,
  description,
  emoji,
  photoUrl,
  logoUrl,
  logoBg,
  color,
  bannerUrl,
  bannerPosY,
  isActive = true,
  stats,
  canEdit = false,
  variant = "ficha",
  onSave,
  onClearCover,
}: {
  name: string;
  company?: string | null;
  description?: string | null;
  emoji: string | null;
  photoUrl: string | null;
  logoUrl: string | null;
  logoBg?: string | null;
  color: string | null;
  bannerUrl: string | null;
  bannerPosY: number | null;
  isActive?: boolean;
  stats?: { proyectos: number; activos: number; cotizaciones: number };
  canEdit?: boolean;
  // "ficha": /clientes/[id] (volver + stats + lápiz). "portal": /inicio del cliente (más baja,
  // subtítulo fijo, sin controles).
  variant?: "ficha" | "portal";
  onSave?: (fd: FormData) => Promise<SaveResult>;
  onClearCover?: () => Promise<SaveResult>;
}) {
  const t = tone(color);
  const preset = heroPreset(bannerUrl);
  // Override optimista de la portada al elegir en la galería o quitar (el refresh del
  // servidor llega después; el contenedor re-monta esta pieza al cambiar bannerUrl).
  const [localBanner, setLocalBanner] = React.useState<string | null | undefined>(undefined);
  const effBanner = localBanner === undefined ? bannerUrl : localBanner;
  const effPreset = localBanner === undefined ? preset : heroPreset(localBanner);
  const isImage = !!effBanner && !effPreset;

  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [galOpen, setGalOpen] = React.useState(false);
  const [colorOpen, setColorOpen] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // ── Reencuadre arrastrando (solo imagen subida + permiso de edición) ──
  const [posY, setPosY] = React.useState<number>(bannerPosY ?? 50);
  const [dragging, setDragging] = React.useState(false);
  const dragStart = React.useRef<{ y: number; pos: number } | null>(null);
  const draggable = isImage && canEdit && !!onSave;

  const run = (build: (fd: FormData) => void, revert?: () => void) => {
    if (!onSave) return;
    const fd = new FormData();
    build(fd);
    setErr(null);
    start(async () => {
      try {
        const r = await onSave(fd);
        if (!r.ok) { setErr(r.error ?? "No se pudo guardar."); revert?.(); }
      } catch {
        setErr("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.");
        revert?.();
      }
    });
  };

  const pickPreset = (key: string) => {
    setGalOpen(false);
    const prev = localBanner;
    setLocalBanner(`preset:${key}`);
    run((fd) => fd.set("bannerPreset", key), () => setLocalBanner(prev));
  };
  const pickColor = (key: string) => {
    setColorOpen(false);
    run((fd) => fd.set("accentColor", key));
  };
  const onFile = (f: File | null) => {
    if (f) run((fd) => fd.set("banner", f));
  };
  const clearCover = () => {
    if (!onClearCover) return;
    setGalOpen(false);
    const prev = localBanner;
    setLocalBanner(null);
    setErr(null);
    start(async () => {
      try {
        const r = await onClearCover();
        if (!r.ok) { setErr(r.error ?? "No se pudo quitar la portada."); setLocalBanner(prev); }
      } catch {
        setErr("No se pudo quitar la portada. Inténtalo de nuevo.");
        setLocalBanner(prev);
      }
    });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable) return;
    // Los botones/enlaces de encima no inician arrastre.
    if ((e.target as HTMLElement).closest("a,button,input")) return;
    dragStart.current = { y: e.clientY, pos: posY };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStart.current;
    if (!s) return;
    const h = e.currentTarget.offsetHeight || 1;
    // Sensibilidad suave: arrastrar todo el alto mueve ~60 puntos de encuadre.
    setPosY(Math.max(0, Math.min(100, s.pos - ((e.clientY - s.y) / h) * 60)));
  };
  const endDrag = () => {
    const s = dragStart.current;
    dragStart.current = null;
    setDragging(false);
    // Guarda solo si de verdad se movió (evita escrituras por un simple clic).
    if (s && Math.abs(s.pos - posY) >= 0.5) run((fd) => fd.set("bannerPosY", String(Math.round(posY))));
  };

  // Marca de agua del degradado: el ícono Labstream del sector si lo hay; si no, el emoji.
  const watermark = lsMark(emoji);
  const watermarkText = watermark ? null : emojiToText(emoji, "");

  const ficha = variant === "ficha";
  const subtitle = ficha
    ? [company, description].filter((s) => s && s.trim()).join(" · ")
    : "Tu espacio en Labstream";

  return (
    <div>
      <div
        className={cn(
          "group relative w-full overflow-hidden rounded-xl border border-border",
          ficha ? "h-28 sm:h-44" : "h-24 sm:h-32",
          draggable && (dragging ? "cursor-grabbing" : "cursor-grab"),
        )}
        style={draggable ? { touchAction: "none" } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* ── Fondo: preset de la galería · imagen subida · degradado del color ── */}
        {effPreset ? (
          <div className="absolute inset-0" style={{ background: effPreset.bg }} />
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={effBanner!}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: `50% ${posY}%` }}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(120deg, ${t.hex} 0%, ${t.hex}cc 55%, ${t.hex}80 100%)` }}
          >
            {/* Bokeh suave (guiño audiovisual) para que el degradado no se vea plano. */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
              <circle cx="332" cy="26" r="52" fill="white" fillOpacity="0.10" />
              <circle cx="378" cy="98" r="30" fill="white" fillOpacity="0.08" />
              <circle cx="44" cy="122" r="44" fill="white" fillOpacity="0.07" />
              <circle cx="122" cy="16" r="22" fill="white" fillOpacity="0.08" />
              <circle cx="232" cy="142" r="17" fill="white" fillOpacity="0.09" />
              <circle cx="288" cy="70" r="9" fill="white" fillOpacity="0.12" />
            </svg>
            {watermark ? (
              <watermark.Icon className="absolute right-4 top-1/2 size-20 -translate-y-1/2 opacity-30 sm:size-28" />
            ) : watermarkText ? (
              <span className="absolute right-5 top-1/2 -translate-y-1/2 text-6xl opacity-25 sm:text-7xl" aria-hidden>{watermarkText}</span>
            ) : null}
          </div>
        )}

        {/* Velo para que el texto blanco se lea sobre cualquier fondo */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />

        {/* Volver (solo ficha) */}
        {ficha ? (
          <Link
            href="/clientes"
            aria-label="Volver a clientes"
            className="absolute left-2.5 top-2.5 z-20 flex size-7 items-center justify-center rounded-md bg-black/40 text-white/90 backdrop-blur transition-colors hover:bg-black/60"
          >
            <ChevronLeft className="size-4" />
          </Link>
        ) : null}

        {/* Chip de encuadre mientras arrastras */}
        {dragging ? (
          <span className="absolute left-1/2 top-2.5 z-20 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
            encuadre {Math.round(posY)}%
          </span>
        ) : draggable ? (
          <span className="pointer-events-none absolute left-1/2 top-2.5 z-10 hidden -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-0.5 text-[11px] font-medium text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 sm:block">
            ↕ arrastra para reencuadrar
          </span>
        ) : null}

        {/* ── Controles de edición: en la propia portada, solo con permiso ── */}
        {canEdit && onSave ? (
          <>
            <div className={cn(
              "absolute right-2.5 top-2.5 z-20 flex gap-1.5 transition-opacity",
              galOpen || colorOpen || pending ? "opacity-100" : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
            )}>
              <button type="button" onClick={() => { setColorOpen(false); setGalOpen((o) => !o); }} disabled={pending} className="inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70 disabled:opacity-50">
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <LayoutGrid className="size-3.5" />} Galería
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={pending} title="Subir una imagen (se recorta a 1600×500)" className="inline-flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70 disabled:opacity-50">
                <ImagePlus className="size-3.5" /> Subir
              </button>
              <button type="button" onClick={() => { setGalOpen(false); setColorOpen((o) => !o); }} title="Color del cliente" className="inline-flex items-center rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70">
                <Palette className="size-3.5" />
              </button>
              {effBanner && onClearCover ? (
                <button type="button" onClick={clearCover} disabled={pending} title="Quitar la portada (queda el degradado del color)" className="inline-flex items-center rounded-md bg-black/55 px-2 py-1 text-xs font-medium text-white backdrop-blur hover:bg-black/70 disabled:opacity-50">
                  <Trash2 className="size-3.5" />
                </button>
              ) : null}
            </div>

            {/* Galería de portadas (mejora 4): degradado del color, presets CSS y subir imagen */}
            {galOpen ? (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setGalOpen(false)} />
                <div className="absolute right-2.5 top-11 z-30 w-72 rounded-xl border border-border bg-popover p-2.5 shadow-xl">
                  <p className="mb-2 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Galería de portadas</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button type="button" onClick={clearCover} className="overflow-hidden rounded-lg border border-border text-left hover:ring-2 hover:ring-primary/50">
                      <span className="block h-9" style={{ background: `linear-gradient(120deg, ${t.hex}, ${t.hex}99)` }} />
                      <span className="block truncate px-1.5 py-1 text-[10px] font-semibold text-muted-foreground">Degradado del color</span>
                    </button>
                    {HERO_PRESETS.map((p) => (
                      <button key={p.key} type="button" onClick={() => pickPreset(p.key)} className="overflow-hidden rounded-lg border border-border text-left hover:ring-2 hover:ring-primary/50">
                        <span className="block h-9" style={{ background: p.bg }} />
                        <span className="block truncate px-1.5 py-1 text-[10px] font-semibold text-muted-foreground">{p.label}</span>
                      </button>
                    ))}
                    <button type="button" onClick={() => { setGalOpen(false); fileRef.current?.click(); }} className="overflow-hidden rounded-lg border border-dashed border-border text-left hover:ring-2 hover:ring-primary/50">
                      <span className="flex h-9 items-center justify-center bg-muted/50 text-muted-foreground"><ImagePlus className="size-4" /></span>
                      <span className="block truncate px-1.5 py-1 text-[10px] font-semibold text-muted-foreground">Subir imagen…</span>
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {/* Color del cliente (tiñe el degradado, el punto y sus proyectos) */}
            {colorOpen ? (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setColorOpen(false)} />
                <div className="absolute right-2.5 top-11 z-30 grid grid-cols-7 gap-1.5 rounded-xl border border-border bg-popover p-2 shadow-xl">
                  {TONES.map((to) => (
                    <button
                      key={to.key}
                      type="button"
                      onClick={() => pickColor(to.key)}
                      title={to.label}
                      className={cn("size-6 rounded-full ring-offset-2 ring-offset-popover transition hover:scale-110", color === to.key && "ring-2 ring-foreground")}
                      style={{ background: to.hex }}
                    />
                  ))}
                </div>
              </>
            ) : null}

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }} />
          </>
        ) : null}

        {/* ── Contenido: burbuja de foto/emoji + nombre + subtítulo + logo ── */}
        <div className={cn("absolute inset-x-0 bottom-0 z-10 flex items-end gap-3", ficha ? "p-3 sm:p-4" : "p-3")}>
          <div className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/30 bg-white/15 shadow-lg backdrop-blur",
            ficha ? "size-12 text-2xl sm:size-14 sm:text-3xl" : "size-11 text-2xl",
          )}>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={name} draggable={false} className="size-full object-cover" />
            ) : (
              <EntityEmoji value={emoji} fallback="🏢" />
            )}
          </div>
          <div className="min-w-0 flex-1 pb-0.5">
            <div className="flex items-center gap-2">
              <h1 className={cn("truncate font-bold tracking-tight text-white drop-shadow-md", ficha ? "text-xl sm:text-2xl" : "text-lg sm:text-xl")}>{name}</h1>
              {color ? <span className="size-2.5 shrink-0 rounded-full ring-2 ring-white/40" style={{ background: t.hex }} title="Color del cliente" /> : null}
              {ficha && !isActive ? (
                <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">Inactivo</span>
              ) : null}
              {ficha && canEdit ? (
                <a href="#acceso" title="Editar cliente (Ajustes)" aria-label="Editar cliente" className="shrink-0 rounded-md p-1 text-white/60 transition-colors hover:bg-white/15 hover:text-white">
                  <Pencil className="size-3.5" />
                </a>
              ) : null}
            </div>
            <p className="truncate text-xs text-white/85 drop-shadow">
              {subtitle ? <>{subtitle}{stats ? " · " : ""}</> : null}
              {stats ? (
                <>
                  <span className="tabular-nums">{stats.proyectos}</span> proyecto{stats.proyectos === 1 ? "" : "s"} ·{" "}
                  <span className="tabular-nums">{stats.activos}</span> activo{stats.activos === 1 ? "" : "s"} ·{" "}
                  <span className="tabular-nums">{stats.cotizaciones}</span> cotizacion{stats.cotizaciones === 1 ? "" : "es"}
                </>
              ) : null}
            </p>
          </div>
          {logoUrl ? (
            <span className="hidden shrink-0 items-center rounded-md px-2 py-1 shadow sm:flex" style={{ background: logoBg || "rgba(255,255,255,.92)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt={`Logo ${name}`} draggable={false} className="max-h-7 max-w-[5.5rem] object-contain" />
            </span>
          ) : null}
        </div>
      </div>
      {err ? <p className="mt-1.5 text-xs text-destructive">{err}</p> : null}
    </div>
  );
}
