"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Heart, ImageOff, Loader2, MessageSquare, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoverAnnotator } from "@/components/covers/cover-annotator";
import { DetailsAutoClose } from "@/components/details-auto-close";
import { cerrarMenu } from "@/components/ui/barra-menu";
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

// Imagen con APARICIÓN SUAVE (fundido al cargar, sin el salto gris→foto) y MARCADOR elegante si no
// hay vista previa (un RAW que ni FFmpeg abre, o un archivo que ya no está en el disco) en vez de
// un icono de imagen rota. Respeta prefers-reduced-motion.
function FotoImg({ src, alt, className, onDims }: { src: string; alt: string; className?: string; onDims?: (el: HTMLImageElement) => void }) {
  const [cargada, setCargada] = React.useState(false);
  const [rota, setRota] = React.useState(false);
  if (rota) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-1 bg-muted/60 text-muted-foreground", className)}>
        <ImageOff className="size-6 opacity-40" />
        <span className="px-2 text-center text-[10px] leading-tight opacity-70">Sin vista previa</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      // Una imagen ya en caché dispara `load` ANTES de que React enganche el handler (SSR +
      // hidratación) y sin esto quedaba invisible (opacity-0) para siempre en la segunda visita.
      ref={(el) => {
        if (!el || !el.complete || cargada || rota) return;
        if (el.naturalWidth > 0) {
          setCargada(true);
          onDims?.(el);
        } else setRota(true);
      }}
      onLoad={(e) => {
        setCargada(true);
        onDims?.(e.currentTarget);
      }}
      onError={() => setRota(true)}
      className={cn("transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none", cargada ? "opacity-100" : "opacity-0", className)}
    />
  );
}

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
  // enrutar esto por la cola offline queda como mejora aparte.) `tono: "info"` reutiliza el mismo
  // canal para confirmaciones neutras («Preparando tu descarga…»).
  const [aviso, setAviso] = React.useState<{ msg: string; tono: "error" | "info" } | null>(null);
  const avisoTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mostrarAviso = React.useCallback((msg: string, tono: "error" | "info" = "error") => {
    setAviso({ msg, tono });
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAviso(null), tono === "info" ? 3000 : 4000);
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
        const r = await setPhotoPick(token, p.id, next, p.clientNote ?? undefined);
        if (!r.ok) {
          update(p.id, { pick: antes }); // revertir: no quedó guardado
          mostrarAviso(r.message);
        }
      } catch {
        update(p.id, { pick: antes });
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
        const r = await setPhotoPick(token, p.id, p.pick, note);
        if (!r.ok) {
          update(p.id, { clientNote: antes });
          mostrarAviso(r.message);
        }
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
        // La acción devuelve resultado TIPADO para los fallos esperados (rate-limit, foto
        // excluida a mitad de sesión): sin mirarlo, el dibujo se daba por guardado y el
        // estudio nunca lo recibía — pérdida silenciosa.
        const r = await setPhotoDrawing(token, p.id, drawing, note || undefined);
        if (!r.ok) {
          update(p.id, { marca: antesMarca, clientNote: antesNota });
          mostrarAviso(r.message);
        }
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
    // «Sin marcar» = lo que aún NO has mirado: ni elegida/descartada ni comentada. Así el filtro
    // casa exacto con el conteo «Sin marcar · N» (antes el filtro incluía las pendientes comentadas
    // y el número no coincidía con lo que aparecía).
    if (filtro === "sin") return p.pick === "PENDIENTE" && !(p.clientNote ?? "").trim();
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

  // La MEMBRESÍA del visor se CONGELA al abrirlo (ids), pero los datos viven: con el filtro
  // «Sin marcar» activo, dar ♥ dentro del visor sacaba la foto de `visibles` al instante →
  // idxAbierta -1 → el visor SE CERRABA solo en pleno flujo estrella (filtrar lo pendiente y
  // decidir una a una). Congelando ids, la foto recién marcada sigue ahí y el filtro se
  // re-aplica al cerrar.
  const [idsVisor, setIdsVisor] = React.useState<string[] | null>(null);
  const porId = new Map(photos.map((p) => [p.id, p] as const));
  const listaVisor: GalleryPhoto[] =
    abierta && idsVisor ? (idsVisor.map((id) => porId.get(id)).filter(Boolean) as GalleryPhoto[]) : visibles;
  const idxAbierta = abierta ? listaVisor.findIndex((p) => p.id === abierta) : -1;
  const fotoAbierta = idxAbierta >= 0 ? listaVisor[idxAbierta] : null;

  // `conNota` = abrir el visor con el campo de comentario ya desplegado (desde el botón 💬 de la
  // cuadrícula: un solo clic para comentar, no dos).
  const [pedirNota, setPedirNota] = React.useState(false);
  function abrir(id: string, conNota = false) {
    setPedirNota(conNota);
    setIdsVisor(visibles.map((p) => p.id)); // congelar la membresía con el filtro del momento
    setAbierta(id);
  }
  // Sin useCallback a propósito: el compilador de React memoiza solo, y la memoización manual
  // sobre `visibles` (que se re-deriva en cada render) no se puede conservar (lint del repo).
  function navegar(d: number) {
    setAbierta((cur) => {
      if (!listaVisor.length) return null;
      const i = listaVisor.findIndex((p) => p.id === cur);
      return listaVisor[(i + d + listaVisor.length) % listaVisor.length].id;
    });
  }

  const arDe = (p: GalleryPhoto) => arVisto[p.id] ?? p.ar;

  return (
    <div className="space-y-5">
      {/* Cierra los <details data-autoclose> al pulsar fuera / Escape. La sala no monta el shell
          de (app), así que hay que traerlo aquí — sin él, el menú «Descargar» quedaba abierto. */}
      <DetailsAutoClose />
      {/* Destino oculto de las descargas: si el ZIP responde error (413 son demasiadas, 429 espera,
          404 sin originales), el JSON carga AQUÍ dentro —invisible— en vez de reemplazar la galería
          y sacar al cliente de su sala. En éxito, el `attachment` dispara la descarga igual.
          El onLoad LEE ese JSON (mismo origen) y lo muestra: antes «Descargar» fallaba en silencio
          y el consejo «baja por tandas» del 413 jamás llegaba al cliente. */}
      <iframe
        name="ls-descarga"
        title="descarga"
        className="hidden"
        aria-hidden="true"
        onLoad={(e) => {
          try {
            const texto = e.currentTarget.contentDocument?.body?.textContent?.trim();
            if (!texto) return; // about:blank inicial o descarga normal (attachment: no navega)
            const j = JSON.parse(texto) as { error?: string };
            if (j?.error) mostrarAviso(j.error);
          } catch {
            /* no era JSON de error: nada que avisar */
          }
        }}
      />
      {/* Aviso de guardado fallido (antes se perdía en silencio) o confirmación neutra. Por ENCIMA
          del visor y del anotador (z-130): con z-50 el aviso quedaba pintado DETRÁS del fondo
          negro del visor y un ♥ fallido parecía «des-marcarse solo». */}
      {aviso ? (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-[140] flex justify-center px-4">
          <div
            className={cn(
              "pointer-events-auto max-w-sm rounded-xl border px-4 py-2.5 text-center text-[13px] font-medium shadow-lg backdrop-blur",
              aviso.tono === "info"
                ? "border-border bg-card/95 text-foreground"
                : "border-amber-400/40 bg-amber-500/95 text-black",
            )}
          >
            {aviso.msg}
          </div>
        </div>
      ) : null}
      {/* ── Héroe: la portada recibe al cliente ── */}
      {coverSrc ? (
        <section className="relative -mt-1 flex min-h-[19rem] items-end overflow-hidden rounded-2xl border border-white/10 md:min-h-[24rem]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverSrc}
            alt=""
            onLoad={(e) => { e.currentTarget.style.opacity = "1"; }}
            // En caché, `load` dispara antes de la hidratación: sin esto la portada quedaba invisible.
            ref={(el) => { if (el && el.complete && el.naturalWidth > 0) el.style.opacity = "1"; }}
            style={{ opacity: 0 }}
            className="absolute inset-0 size-full object-cover transition-opacity duration-[900ms] ease-out motion-reduce:transition-none motion-reduce:!opacity-100"
          />
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
                      <FotoImg
                        src={p.src}
                        alt={p.filename}
                        // Foto sin dimensiones conocidas (Drive): al cargar se corrige la proporción
                        // real y la fila se re-acomoda una sola vez.
                        onDims={(el) => {
                          if (!el.naturalWidth || !el.naturalHeight) return;
                          const real = Math.min(2.8, Math.max(0.4, el.naturalWidth / el.naturalHeight));
                          if (Math.abs(real - ar) > 0.01) setArVisto((cur) => (cur[p.id] ? cur : { ...cur, [p.id]: real }));
                        }}
                        className="size-full object-cover group-hover:scale-[1.03]"
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
                          "absolute right-2 top-2 flex gap-1.5 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
                          (esLiked || conNota) && "md:opacity-100",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setPick(p, "ME_GUSTA")}
                          aria-pressed={esLiked}
                          title={esLiked ? "Quitar de elegidas" : "Me gusta"}
                          className={cn(
                            "flex size-8 items-center justify-center rounded-full backdrop-blur-sm transition-transform hover:scale-110 active:scale-95",
                            esLiked ? "bg-primary text-primary-foreground" : "bg-black/55 text-white hover:bg-black/75",
                          )}
                        >
                          {/* key por estado → al ELEGIR el corazón se re-monta y hace un «pop». */}
                          <Heart key={esLiked ? "on" : "off"} className={cn("size-4", esLiked && "fill-current animate-in zoom-in-50 duration-300 motion-reduce:animate-none")} />
                        </button>
                        <button
                          type="button"
                          onClick={() => abrir(p.id, true)}
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
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            <span>
              {filtro === "elegidas" ? "Aún no has elegido ninguna — toca el ♥ de tus favoritas." :
               filtro === "comentadas" ? "Aún no has comentado ninguna foto." :
               filtro === "sin" ? "¡Ya las miraste todas! 🎉" : "Nada con este filtro."}
            </span>
            <button
              type="button"
              onClick={() => setFiltro("todas")}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:text-foreground"
            >
              Ver todas
            </button>
          </div>
        ) : null}
      </div>

      {/* ── Barra flotante: conteo, filtros y cierre ──
          bottom con safe-area: el layout global lleva viewport-fit=cover y sin esto la barra
          quedaba sobre el home-indicator del iPhone (los toques disparaban el gesto del sistema). */}
      <div className="pointer-events-none sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex justify-center">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-border bg-card/90 px-3 py-2 shadow-2xl backdrop-blur-xl">
          {/* key por conteo → al elegir/quitar, el contador hace un pequeño «pop»: confirmación de
              que la acción viajó (junto al aviso de error, éxito y fallo quedan bien distinguibles). */}
          <span key={liked} className="inline-flex animate-in zoom-in-95 items-center gap-1.5 pl-1 pr-1 text-[13px] font-semibold duration-300 motion-reduce:animate-none">
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
              aria-pressed={filtro === k}
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
            <details data-autoclose className="relative">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                <Download className="size-3.5" /> Descargar
              </summary>
              <div className="absolute bottom-full right-0 mb-2 w-60 rounded-xl border border-border bg-popover p-1 shadow-2xl">
                <a
                  href={`/api/fotos/${deliverableId}/zip?que=cliente&t=${encodeURIComponent(token)}`}
                  target="ls-descarga"
                  onClick={(e) => {
                    cerrarMenu(e);
                    mostrarAviso("Preparando tu descarga… el ZIP empieza solo en unos segundos.", "info");
                  }}
                  className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-muted"
                >
                  Todas mis fotos <span className="text-xs tabular-nums text-muted-foreground">{descargables}</span>
                </a>
                {liked > 0 ? (
                  <a
                    href={`/api/fotos/${deliverableId}/zip?que=elegidas&t=${encodeURIComponent(token)}`}
                    target="ls-descarga"
                    onClick={(e) => {
                      cerrarMenu(e);
                      mostrarAviso("Preparando tu descarga… el ZIP empieza solo en unos segundos.", "info");
                    }}
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
          total={listaVisor.length}
          lista={listaVisor}
          arDe={arDe}
          soloLectura={soloLectura}
          abrirNota={pedirNota}
          onCerrar={() => { setAbierta(null); setPedirNota(false); setIdsVisor(null); }}
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
  abrirNota,
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
  abrirNota?: boolean;
  onCerrar: () => void;
  onNavegar: (d: number) => void;
  onIr: (id: string) => void;
  onPick: (p: GalleryPhoto, pick: string) => void;
  onNota: (p: GalleryPhoto, note: string) => void;
  onMarca: (p: GalleryPhoto, drawing: string | null, note: string) => void;
}) {
  // Se abre con la nota desplegada si la foto ya tenía comentario, o si se entró por el botón 💬.
  const [notaAbierta, setNotaAbierta] = React.useState(abrirNota || !!(foto.clientNote ?? "").trim());
  const [cargandoImg, setCargandoImg] = React.useState(true); // spinner mientras llega la foto grande
  const filmRef = React.useRef<HTMLDivElement>(null);
  const touch = React.useRef<{ x: number; y: number; ignorar: boolean } | null>(null);

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
    setCargandoImg(true);
    // El panel de nota SIGUE al contenido: si la foto a la que llegas ya tiene tu comentario,
    // se enseña (antes era invisible al navegar); si no tiene, se recoge.
    setNotaAbierta(!!(foto.clientNote ?? "").trim());
  }

  // Bloquea el scroll del FONDO mientras el visor está abierto (en móvil, arrastrar sobre los
  // bordes movía la galería de atrás). Se restaura al cerrar.
  React.useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

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
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${idx + 1} de ${total}: ${foto.filename}`}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md animate-in fade-in duration-200 motion-reduce:animate-none"
      onTouchStart={(e) => {
        const t = e.target as HTMLElement;
        // La tira de miniaturas se scrollea en horizontal y el textarea selecciona texto: un
        // gesto que EMPIEZA ahí no debe cambiar de foto (con el textarea, además, el remonte
        // por key se comía la nota a medio escribir sin disparar el blur que la guarda).
        const ignorar = !!(filmRef.current?.contains(t) || t.closest("textarea"));
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ignorar };
      }}
      onTouchEnd={(e) => {
        const t0 = touch.current;
        touch.current = null;
        if (!t0 || t0.ignorar) return;
        const dx = e.changedTouches[0].clientX - t0.x;
        const dy = e.changedTouches[0].clientY - t0.y;
        // Claramente horizontal (no un scroll diagonal): dx manda sobre dy con margen.
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) onNavegar(dx < 0 ? 1 : -1);
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

      <div className="relative flex min-h-0 flex-1 items-center justify-center gap-2 px-2 md:gap-4 md:px-4">
        <button
          type="button"
          onClick={() => onNavegar(-1)}
          aria-label="Anterior"
          className="z-10 hidden size-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/70 hover:text-white sm:flex"
        >
          <ChevronLeft className="size-5" />
        </button>
        {/* Spinner mientras la foto grande no está en caché: antes el centro quedaba en negro y se
            sentía «roto» en conexiones lentas. */}
        {cargandoImg ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Loader2 className="size-8 animate-spin text-white/50" />
          </div>
        ) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={foto.id + (foto.marca && verMarca ? "·marca" : "")}
          src={foto.marca && verMarca ? foto.marca : foto.srcXl}
          alt={foto.filename}
          onLoad={() => setCargandoImg(false)}
          ref={(el) => { if (el && el.complete && el.naturalWidth > 0 && cargandoImg) setCargandoImg(false); }}
          className={cn(
            "max-h-full min-h-0 max-w-full rounded-lg object-contain shadow-2xl transition-opacity duration-300 motion-reduce:transition-none",
            cargandoImg ? "opacity-0" : "opacity-100",
          )}
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

      <div className="flex flex-col items-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
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
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium text-white hover:bg-white/10",
                (foto.clientNote ?? "").trim() ? "border-primary/60" : "border-white/20",
              )}
            >
              <MessageSquare className={cn("size-4", (foto.clientNote ?? "").trim() && "fill-primary/30 text-primary")} />
              {(foto.clientNote ?? "").trim() ? "Tu comentario" : "Comentar"}
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
            placeholder="¿Qué te gustaría ajustar en esta foto? Se guarda solo."
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
