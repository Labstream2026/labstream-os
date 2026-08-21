"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Heart, MessageSquare, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoverAnnotator } from "@/components/covers/cover-annotator";
import { setPhotoDrawing, setPhotoPick } from "./actions";

// ── La galería de selección del cliente ──
// Rediseño 2026-08: de cuadrícula de recortes cuadrados a una galería de estudio: héroe con la
// portada del set, capítulos (secciones), filas justificadas que respetan la proporción de cada
// toma, visor a pantalla completa con teclado/deslizamiento y una barra flotante con el conteo.
//
// El corazón es el gesto principal; el «no me gusta» vive en el visor, secundario — un cliente
// elige favoritas, no reprueba fotos. Todo se guarda al instante (optimista), como antes.
//
// La misma pieza sirve la revisión interna del equipo (`soloLectura`): ahí se MIRA la galería
// exacta que verá el cliente, sin poder marcar por él.

export type GalleryPhoto = {
  id: string;
  filename: string;
  // MINIATURA (~480 px) para la cuadrícula y la tira: el cliente no debe cargar megas para ver
  // postales. La VISTA (~1600 px) es solo para el visor. Ninguna audita como descarga.
  src: string;
  srcXl: string;
  pick: string; // PENDIENTE | ME_GUSTA | NO_ME_GUSTA
  clientNote: string | null;
  seccion: string | null;
  ar: number; // proporción ancho/alto (respaldo 1.5 si no se conoce)
  // La foto RAYADA por el cliente (URL del JPEG aplanado), null si no ha marcado nada.
  marca: string | null;
};

type Filtro = "todas" | "elegidas" | "comentadas" | "sin";

export function PhotoGallery({
  token,
  deliverableId = null,
  descargables = 0,
  photos: initial,
  setName,
  clientName,
  coverSrc,
  soloLectura = false,
}: {
  token: string;
  // Para armar el enlace de descarga del cliente (ZIP por token). null en la revisión interna.
  deliverableId?: string | null;
  // Cuántas fotos de la galería son archivos reales (no enlaces de Drive): si 0, no hay ZIP.
  descargables?: number;
  photos: GalleryPhoto[];
  setName: string;
  clientName: string | null;
  coverSrc: string | null;
  soloLectura?: boolean;
}) {
  // Copia local optimista, con ajuste-durante-render si el servidor re-renderiza con datos nuevos.
  const [photos, setPhotos] = React.useState(initial);
  const [prev, setPrev] = React.useState(initial);
  if (initial !== prev) {
    setPrev(initial);
    setPhotos(initial);
  }

  const [filtro, setFiltro] = React.useState<Filtro>("todas");
  // Proporciones corregidas al cargar cada imagen (fotos de Drive llegan sin dimensiones).
  const [arVisto, setArVisto] = React.useState<Record<string, number>>({});
  const [abierta, setAbierta] = React.useState<string | null>(null); // id en el visor
  const galRef = React.useRef<HTMLDivElement>(null);

  const [, startTransition] = React.useTransition();
  // Aviso cuando un guardado NO llegó. Antes el error se tragaba: el cliente veía su elección
  // puesta (anillo naranja) pero el servidor nunca la registraba → se perdía en silencio. Ahora
  // se REVIERTE el cambio optimista y se avisa para que reintente. (La sala monta OfflineProvider;
  // enrutar esto por la cola offline queda como mejora aparte.)
  const [aviso, setAviso] = React.useState<string | null>(null);
  const avisoTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mostrarAviso = React.useCallback((msg: string) => {
    setAviso(msg);
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAviso(null), 4000);
  }, []);

  function update(id: string, patch: Partial<GalleryPhoto>) {
    setPhotos((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function setPick(p: GalleryPhoto, pick: string) {
    if (soloLectura) return;
    // Toggle: volver a tocar el mismo estado lo deja en PENDIENTE.
    const next = p.pick === pick ? "PENDIENTE" : pick;
    const antes = p.pick;
    update(p.id, { pick: next });
    startTransition(async () => {
      try {
        await setPhotoPick(token, p.id, next, p.clientNote ?? undefined);
      } catch {
        update(p.id, { pick: antes }); // revertir: no quedó guardado
        mostrarAviso("No pudimos guardar tu elección. Revisa tu conexión y vuelve a tocarla.");
      }
    });
  }

  function saveNote(p: GalleryPhoto, note: string) {
    if (soloLectura) return;
    const antes = p.clientNote ?? null;
    update(p.id, { clientNote: note });
    startTransition(async () => {
      try {
        await setPhotoPick(token, p.id, p.pick, note);
      } catch {
        update(p.id, { clientNote: antes });
        mostrarAviso("No pudimos guardar tu comentario. Revisa tu conexión y reinténtalo.");
      }
    });
  }

  // El cliente rayó la foto (o quitó sus marcas). La vista se actualiza al instante con el
  // dataURL local; el servidor guarda el JPEG aplanado y el estudio lo verá por su URL.
  function saveMarca(p: GalleryPhoto, drawing: string | null, note: string) {
    if (soloLectura) return;
    const antesMarca = p.marca ?? null;
    const antesNota = p.clientNote ?? null;
    update(p.id, { marca: drawing, ...(note ? { clientNote: note } : {}) });
    startTransition(async () => {
      try {
        await setPhotoDrawing(token, p.id, drawing, note || undefined);
      } catch {
        update(p.id, { marca: antesMarca, clientNote: antesNota });
        mostrarAviso("No pudimos guardar tu marca. Revisa tu conexión y vuelve a enviarla.");
      }
    });
  }

  const liked = photos.filter((p) => p.pick === "ME_GUSTA").length;
  const comentadas = photos.filter((p) => (p.clientNote ?? "").trim()).length;
  const sinMarcar = photos.filter((p) => p.pick === "PENDIENTE" && !(p.clientNote ?? "").trim()).length;

  const visibles = photos.filter((p) => {
    if (filtro === "elegidas") return p.pick === "ME_GUSTA";
    if (filtro === "comentadas") return !!(p.clientNote ?? "").trim();
    if (filtro === "sin") return p.pick === "PENDIENTE";
    return true;
  });

  // Capítulos en orden de aparición. Si hay secciones con nombre, las fotos sueltas de la raíz
  // se agrupan bajo «Galería»; si nada tiene sección, no se pinta encabezado.
  const grupos: { titulo: string | null; fotos: GalleryPhoto[] }[] = [];
  for (const p of visibles) {
    const t = p.seccion ?? null;
    const g = grupos.find((x) => x.titulo === t);
    if (g) g.fotos.push(p);
    else grupos.push({ titulo: t, fotos: [p] });
  }
  const haySecciones = grupos.some((g) => g.titulo);

  const idxAbierta = abierta ? visibles.findIndex((p) => p.id === abierta) : -1;
  const fotoAbierta = idxAbierta >= 0 ? visibles[idxAbierta] : null;

  function abrir(id: string) {
    setAbierta(id);
  }
  // Sin useCallback a propósito: el compilador de React memoiza solo, y la memoización manual
  // sobre `visibles` (que se re-deriva en cada render) no se puede conservar (lint del repo).
  function navegar(d: number) {
    setAbierta((cur) => {
      if (!visibles.length) return null;
      const i = visibles.findIndex((p) => p.id === cur);
      return visibles[(i + d + visibles.length) % visibles.length].id;
    });
  }

  const arDe = (p: GalleryPhoto) => arVisto[p.id] ?? p.ar;

  return (
    <div className="space-y-5">
      {/* Destino oculto de las descargas: si el ZIP responde error (413 son demasiadas, 429 espera,
          404 sin originales), el JSON carga AQUÍ dentro —invisible— en vez de reemplazar la galería
          y sacar al cliente de su sala. En éxito, el `attachment` dispara la descarga igual. */}
      <iframe name="ls-descarga" title="descarga" className="hidden" aria-hidden="true" />
      {/* Aviso de guardado fallido (antes se perdía en silencio). */}
      {aviso ? (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
          <div className="pointer-events-auto max-w-sm rounded-xl border border-amber-400/40 bg-amber-500/95 px-4 py-2.5 text-center text-[13px] font-medium text-black shadow-lg backdrop-blur">
            {aviso}
          </div>
        </div>
      ) : null}
      {/* ── Héroe: la portada recibe al cliente ── */}
      {coverSrc ? (
        <section className="relative -mt-1 flex min-h-[19rem] items-end overflow-hidden rounded-2xl border border-white/10 md:min-h-[24rem]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverSrc} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/20" />
          <div className="relative flex w-full flex-wrap items-end gap-4 p-6 md:p-8">
            <div className="min-w-0 flex-1">
              {clientName ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Para {clientName}</p>
              ) : null}
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white md:text-5xl">{setName}</h1>
              <p className="mt-2 text-sm text-white/75">
                {photos.length} fotografía{photos.length === 1 ? "" : "s"}
                {soloLectura ? " · tal como la verá el cliente" : liked ? ` · llevas ${liked} elegida${liked === 1 ? "" : "s"} ♥` : " · elige tus favoritas ♥"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => galRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
            >
              Ver la galería <ChevronDown className="size-4" />
            </button>
          </div>
        </section>
      ) : null}

      {/* ── Capítulos + filas justificadas ── */}
      <div ref={galRef} className="scroll-mt-20 space-y-6">
        {grupos.map((g) => (
          <section key={g.titulo ?? "·raiz"}>
            {haySecciones ? (
              <div className="mb-2.5 flex items-baseline gap-3">
                <h2 className="text-lg font-semibold tracking-tight">{g.titulo ?? "Galería"}</h2>
                <span className="text-xs text-muted-foreground">{g.fotos.length} foto{g.fotos.length === 1 ? "" : "s"}</span>
                <span className="h-px flex-1 bg-border" />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 [--fh:10rem] md:[--fh:13.5rem]">
              {g.fotos.map((p) => {
                const esLiked = p.pick === "ME_GUSTA";
                const esNo = p.pick === "NO_ME_GUSTA";
                const conNota = !!(p.clientNote ?? "").trim();
                const ar = arDe(p);
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "group relative overflow-hidden rounded-xl bg-card ring-2 ring-transparent transition-shadow",
                      esLiked && "ring-primary",
                      esNo && "opacity-60",
                    )}
                    style={{ height: "var(--fh)", flexGrow: ar * 100, flexBasis: `calc(${ar} * var(--fh))` }}
                  >
                    <button type="button" onClick={() => abrir(p.id)} className="absolute inset-0 w-full cursor-zoom-in" title="Ampliar">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.src}
                        alt={p.filename}
                        loading="lazy"
                        onLoad={(e) => {
                          // Foto sin dimensiones conocidas (Drive): al cargar se corrige la
                          // proporción real y la fila se re-acomoda una sola vez.
                          const el = e.currentTarget;
                          if (!el.naturalWidth || !el.naturalHeight) return;
                          const real = Math.min(2.8, Math.max(0.4, el.naturalWidth / el.naturalHeight));
                          if (Math.abs(real - ar) > 0.01) setArVisto((cur) => (cur[p.id] ? cur : { ...cur, [p.id]: real }));
                        }}
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>

                    {/* Insignias: marca (rayada), nota y descarte. */}
                    <div className="pointer-events-none absolute left-2 top-2 flex gap-1">
                      {p.marca ? (
                        <span title="Tiene marcas dibujadas" className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Pencil className="size-3" />
                        </span>
                      ) : null}
                      {conNota ? (
                        <span className="flex size-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                          <MessageSquare className="size-3" />
                        </span>
                      ) : null}
                      {esNo ? (
                        <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">No va</span>
                      ) : null}
                    </div>

                    {/* Acciones: siempre visibles en el celular, al pasar el mouse en escritorio. */}
                    {!soloLectura ? (
                      <div
                        className={cn(
                          "absolute right-2 top-2 flex gap-1.5 transition-opacity md:opacity-0 md:group-hover:opacity-100",
                          (esLiked || conNota) && "md:opacity-100",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setPick(p, "ME_GUSTA")}
                          aria-pressed={esLiked}
                          title={esLiked ? "Quitar de elegidas" : "Me gusta"}
                          className={cn(
                            "flex size-8 items-center justify-center rounded-full backdrop-blur-sm transition-transform hover:scale-110",
                            esLiked ? "bg-primary text-primary-foreground" : "bg-black/55 text-white hover:bg-black/75",
                          )}
                        >
                          <Heart className={cn("size-4", esLiked && "fill-current")} />
                        </button>
                        <button
                          type="button"
                          onClick={() => abrir(p.id)}
                          title="Comentar esta foto"
                          className={cn(
                            "flex size-8 items-center justify-center rounded-full backdrop-blur-sm transition-transform hover:scale-110",
                            conNota ? "bg-white text-black" : "bg-black/55 text-white hover:bg-black/75",
                          )}
                        >
                          <MessageSquare className="size-4" />
                        </button>
                      </div>
                    ) : null}

                    <span className="pointer-events-none absolute bottom-1.5 left-2.5 max-w-[80%] truncate text-[10.5px] text-white/90 opacity-0 drop-shadow transition-opacity group-hover:opacity-100">
                      {p.filename}
                    </span>
                  </div>
                );
              })}
              <span aria-hidden className="grow-[9999]" />
            </div>
          </section>
        ))}
        {visibles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">Nada con este filtro.</p>
        ) : null}
      </div>

      {/* ── Barra flotante: conteo, filtros y cierre ── */}
      <div className="pointer-events-none sticky bottom-3 z-30 flex justify-center">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-border bg-card/90 px-3 py-2 shadow-2xl backdrop-blur-xl">
          <span className="inline-flex items-center gap-1.5 pl-1 pr-1 text-[13px] font-semibold">
            <Heart className="size-3.5 fill-primary text-primary" />
            {liked === 1 ? "1 elegida" : `${liked} elegidas`}
          </span>
          {(
            [
              ["todas", "Todas"],
              ["elegidas", "Elegidas"],
              ["comentadas", "Comentadas"],
              ["sin", "Sin marcar"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFiltro(k)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                filtro === k ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              {k === "comentadas" && comentadas ? ` · ${comentadas}` : ""}
              {k === "sin" && sinMarcar ? ` · ${sinMarcar}` : ""}
            </button>
          ))}
          {/* Descargar MIS fotos: originales en ZIP (todas las que veo, o mis elegidas). Solo el
              cliente (no la revisión interna), solo si hay archivos reales (no puros enlaces de
              Drive), y por el token de la sala — sin cuenta. El menú abre HACIA ARRIBA porque la
              barra vive pegada abajo. */}
          {!soloLectura && deliverableId && token && descargables > 0 ? (
            <details className="relative">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                <Download className="size-3.5" /> Descargar
              </summary>
              <div className="absolute bottom-full right-0 mb-2 w-60 rounded-xl border border-border bg-popover p-1 shadow-2xl">
                <a
                  href={`/api/fotos/${deliverableId}/zip?que=cliente&t=${encodeURIComponent(token)}`}
                  target="ls-descarga"
                  className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-muted"
                >
                  Todas mis fotos <span className="text-xs tabular-nums text-muted-foreground">{descargables}</span>
                </a>
                {liked > 0 ? (
                  <a
                    href={`/api/fotos/${deliverableId}/zip?que=elegidas&t=${encodeURIComponent(token)}`}
                    target="ls-descarga"
                    className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-muted"
                  >
                    <span className="inline-flex items-center gap-1.5"><Heart className="size-3.5 fill-primary text-primary" /> Mis elegidas</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{liked}</span>
                  </a>
                ) : null}
                <p className="px-2.5 pb-1 pt-1.5 text-[10.5px] text-muted-foreground">Un ZIP con los archivos originales, en carpetas por sección.</p>
              </div>
            </details>
          ) : null}
          {/* Solo cuando hay decisión que tomar: en BORRADOR (deliverableId null) no existe el ancla
              #decision-fotos, así que el botón no haría nada — se oculta. */}
          {!soloLectura && deliverableId ? (
            <button
              type="button"
              onClick={() => document.getElementById("decision-fotos")?.scrollIntoView({ behavior: "smooth", block: "center" })}
              className="ml-1 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
            >
              Terminé mi selección ✓
            </button>
          ) : null}
        </div>
      </div>

      {fotoAbierta ? (
        <Visor
          foto={fotoAbierta}
          idx={idxAbierta}
          total={visibles.length}
          lista={visibles}
          arDe={arDe}
          soloLectura={soloLectura}
          onCerrar={() => setAbierta(null)}
          onNavegar={navegar}
          onIr={(id) => setAbierta(id)}
          onPick={setPick}
          onNota={saveNote}
          onMarca={saveMarca}
        />
      ) : null}
    </div>
  );
}

// ── El visor a pantalla completa ──
function Visor({
  foto,
  idx,
  total,
  lista,
  arDe,
  soloLectura,
  onCerrar,
  onNavegar,
  onIr,
  onPick,
  onNota,
  onMarca,
}: {
  foto: GalleryPhoto;
  idx: number;
  total: number;
  lista: GalleryPhoto[];
  arDe: (p: GalleryPhoto) => number;
  soloLectura: boolean;
  onCerrar: () => void;
  onNavegar: (d: number) => void;
  onIr: (id: string) => void;
  onPick: (p: GalleryPhoto, pick: string) => void;
  onNota: (p: GalleryPhoto, note: string) => void;
  onMarca: (p: GalleryPhoto, drawing: string | null, note: string) => void;
}) {
  const [notaAbierta, setNotaAbierta] = React.useState(!!(foto.clientNote ?? "").trim());
  const filmRef = React.useRef<HTMLDivElement>(null);
  const touch = React.useRef<number | null>(null);

  // Lienzo de anotación abierto (portal a <body>: dentro de este overlay con backdrop-blur, un
  // `fixed` anidado quedaría preso del ancestro filtrado — la lección de Portadas 2.0).
  const [rayando, setRayando] = React.useState(false);
  const host = typeof document === "undefined" ? null : document.body;

  // Con marcas se abre ENSEÑANDO las marcas (es lo que el cliente quiso decir); el chip permite
  // ver la foto limpia. Ajuste-durante-render al cambiar de foto.
  const [verMarca, setVerMarca] = React.useState(true);
  const [fotoPrev, setFotoPrev] = React.useState(foto.id);
  if (foto.id !== fotoPrev) {
    setFotoPrev(foto.id);
    setVerMarca(true);
    setRayando(false);
  }

  // Teclado: ← → navegar, F me gusta, C comentar, Esc cerrar. (Escribiendo la nota, solo Esc.)
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (rayando) return; // el lienzo está abierto: las flechas no deben cambiar la foto debajo
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA") {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      // preventDefault en las teclas atendidas: sin él, la «c» que abre el comentario aterrizaba
      // DENTRO del textarea recién enfocado (quedaba «cEsta para…»), y las flechas hacían
      // scroll de la página debajo del visor.
      if (e.key === "ArrowRight") onNavegar(1);
      else if (e.key === "ArrowLeft") onNavegar(-1);
      else if (e.key === "Escape") onCerrar();
      else if (!soloLectura && (e.key === "f" || e.key === "F")) onPick(foto, "ME_GUSTA");
      else if (!soloLectura && (e.key === "c" || e.key === "C")) setNotaAbierta(true);
      else return;
      e.preventDefault();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [foto, onNavegar, onCerrar, onPick, soloLectura, rayando]);

  // La miniatura activa de la tira siempre a la vista, y los vecinos precargados.
  React.useEffect(() => {
    filmRef.current?.querySelector(`[data-id="${foto.id}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    for (const d of [1, -1]) {
      const vecino = lista[(idx + d + lista.length) % lista.length];
      if (vecino) new Image().src = vecino.srcXl;
    }
  }, [foto.id, idx, lista]);

  const esLiked = foto.pick === "ME_GUSTA";
  const esNo = foto.pick === "NO_ME_GUSTA";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md"
      onTouchStart={(e) => {
        touch.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 48) onNavegar(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex items-center gap-3 px-4 py-3 text-sm text-white/70">
        <span className="tabular-nums">
          {idx + 1} / {total}
        </span>
        <span className="min-w-0 truncate font-medium text-white">{foto.filename}</span>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="ml-auto flex size-9 items-center justify-center rounded-full border border-white/15 text-white hover:bg-white/10"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-2 md:gap-4 md:px-4">
        <button
          type="button"
          onClick={() => onNavegar(-1)}
          aria-label="Anterior"
          className="hidden size-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/70 hover:text-white sm:flex"
        >
          <ChevronLeft className="size-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={foto.id + (foto.marca && verMarca ? "·marca" : "")}
          src={foto.marca && verMarca ? foto.marca : foto.srcXl}
          alt={foto.filename}
          className="max-h-full min-h-0 max-w-full rounded-lg object-contain shadow-2xl"
        />
        <button
          type="button"
          onClick={() => onNavegar(1)}
          aria-label="Siguiente"
          className="hidden size-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/70 hover:text-white sm:flex"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="flex flex-col items-center gap-3 px-4 pb-4 pt-3">
        {/* Con marcas: alternar entre lo que rayó el cliente y la foto limpia (también en la
            revisión interna — el editor necesita ver ambas). */}
        {foto.marca ? (
          <div className="flex items-center gap-1 rounded-full border border-white/15 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setVerMarca(true)}
              className={cn("rounded-full px-3 py-1", verMarca ? "bg-primary text-primary-foreground" : "text-white/70 hover:text-white")}
            >
              ✏️ Con marcas
            </button>
            <button
              type="button"
              onClick={() => setVerMarca(false)}
              className={cn("rounded-full px-3 py-1", !verMarca ? "bg-white text-black" : "text-white/70 hover:text-white")}
            >
              Original
            </button>
          </div>
        ) : null}
        {!soloLectura ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => onPick(foto, "ME_GUSTA")}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                esLiked ? "border-primary bg-primary text-primary-foreground" : "border-white/20 text-white hover:bg-white/10",
              )}
            >
              <Heart className={cn("size-4", esLiked && "fill-current")} /> {esLiked ? "Elegida" : "Me gusta"}
            </button>
            <button
              type="button"
              onClick={() => setRayando(true)}
              title="Raya sobre la foto lo que cambiarías: círculos, flechas, texto"
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                foto.marca ? "border-primary/60 text-white hover:bg-white/10" : "border-white/20 text-white hover:bg-white/10",
              )}
            >
              <Pencil className="size-4" /> {foto.marca ? "Volver a marcar" : "Marcar la foto"}
            </button>
            <button
              type="button"
              onClick={() => setNotaAbierta((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              <MessageSquare className="size-4" /> Comentar
            </button>
            <button
              type="button"
              onClick={() => onPick(foto, "NO_ME_GUSTA")}
              title="Marcarla como descartada"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors",
                esNo ? "border-rose-400 bg-rose-500 text-white" : "border-white/15 text-white/60 hover:bg-white/10 hover:text-white",
              )}
            >
              <X className="size-3.5" /> No va
            </button>
            {foto.marca ? (
              <button
                type="button"
                onClick={() => onMarca(foto, null, "")}
                title="Borrar tus marcas de esta foto"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-2 text-xs font-medium text-white/60 hover:bg-white/10 hover:text-white"
              >
                Quitar marcas
              </button>
            ) : null}
          </div>
        ) : null}

        {!soloLectura && notaAbierta ? (
          <textarea
            autoFocus={!(foto.clientNote ?? "").trim()}
            key={foto.id}
            defaultValue={foto.clientNote ?? ""}
            onBlur={(e) => {
              if (e.target.value !== (foto.clientNote ?? "")) onNota(foto, e.target.value);
            }}
            rows={2}
            placeholder="Cuéntanos qué ves en esta foto… se guarda solo."
            className="w-full max-w-xl rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40"
          />
        ) : soloLectura && (foto.clientNote ?? "").trim() ? (
          <p className="max-w-xl text-center text-sm italic text-white/80">«{foto.clientNote}»</p>
        ) : null}

        <div ref={filmRef} className="flex max-w-full gap-1.5 overflow-x-auto p-1">
          {lista.map((p) => (
            <button
              key={p.id}
              data-id={p.id}
              type="button"
              onClick={() => onIr(p.id)}
              className={cn(
                "h-10 shrink-0 overflow-hidden rounded-md border-2 transition-opacity",
                p.id === foto.id ? "border-white opacity-100" : p.pick === "ME_GUSTA" ? "border-primary opacity-90" : "border-transparent opacity-45 hover:opacity-80",
              )}
              style={{ width: `${Math.round(40 * Math.min(2, Math.max(0.6, arDe(p))))}px` }}
              aria-label={p.filename}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.src} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>

        <p className="hidden text-[11px] text-white/40 md:block">
          <Tecla>←</Tecla> <Tecla>→</Tecla> navegar{!soloLectura ? (
            <>
              {" "}· <Tecla>F</Tecla> me gusta · <Tecla>C</Tecla> comentar
            </>
          ) : null}{" "}
          · <Tecla>Esc</Tecla> cerrar
        </p>
      </div>

      {/* Lienzo de anotación (el MISMO de Portadas: lápiz, flecha, recuadro, texto, colores).
          En portal a <body>: un fixed anidado bajo el backdrop-blur de este visor quedaría
          preso del ancestro filtrado. Se dibuja SIEMPRE sobre la foto limpia. */}
      {rayando && host
        ? createPortal(
            <div role="dialog" aria-modal="true" aria-label={`Marcar ${foto.filename}`} className="fixed inset-0 z-[130] flex flex-col bg-black/95 p-4 backdrop-blur-sm">
              <div className="mb-2 flex items-center gap-2 text-white">
                <p className="min-w-0 truncate text-sm font-semibold">✏️ Marca sobre «{foto.filename}» lo que cambiarías</p>
                <button
                  type="button"
                  onClick={() => setRayando(false)}
                  aria-label="Cerrar"
                  className="ml-auto grid size-8 place-items-center rounded-lg text-white/80 hover:bg-white/15"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto">
                <CoverAnnotator
                  src={foto.srcXl}
                  name={foto.filename}
                  promptTexto="Escribe la nota que va sobre la foto:"
                  onSend={(drawing, body) => {
                    // Solo nota sin dibujo → es un comentario normal (no borra marcas previas).
                    if (drawing) onMarca(foto, drawing, body);
                    else if (body) onNota(foto, body);
                    setRayando(false);
                    setVerMarca(true);
                  }}
                  onCancel={() => setRayando(false)}
                />
              </div>
            </div>,
            host,
          )
        : null}
    </div>
  );
}

function Tecla({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-sans text-[10px]">{children}</kbd>;
}
