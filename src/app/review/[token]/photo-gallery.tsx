"use client";

import { useState, useTransition } from "react";
import { Heart, X, MessageSquare, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { setPhotoPick } from "./actions";

export type GalleryPhoto = {
  id: string;
  filename: string;
  src: string;
  pick: string; // PENDIENTE | ME_GUSTA | NO_ME_GUSTA
  clientNote: string | null;
};

// Galería de selección del cliente (entregable de fotografía). El cliente marca cada foto
// «me gusta» (♥) o «no me gusta» (✗) y puede dejar una nota. La selección se guarda al instante
// (optimista) vía la acción del portal; no hace falta sesión, la autoriza el token del enlace.
export function PhotoGallery({ token, photos: initial }: { token: string; photos: GalleryPhoto[] }) {
  const [photos, setPhotos] = useState(initial);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [zoom, setZoom] = useState<GalleryPhoto | null>(null);
  const [, startTransition] = useTransition();

  const liked = photos.filter((p) => p.pick === "ME_GUSTA").length;
  const disliked = photos.filter((p) => p.pick === "NO_ME_GUSTA").length;
  const pending = photos.length - liked - disliked;

  function update(id: string, patch: Partial<GalleryPhoto>) {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function setPick(p: GalleryPhoto, pick: string) {
    // Toggle: volver a tocar el mismo estado lo deja en PENDIENTE.
    const next = p.pick === pick ? "PENDIENTE" : pick;
    update(p.id, { pick: next });
    startTransition(async () => {
      try { await setPhotoPick(token, p.id, next, p.clientNote ?? undefined); } catch { /* la UI ya reflejó el intento */ }
    });
  }

  function saveNote(p: GalleryPhoto, note: string) {
    update(p.id, { clientNote: note });
    startTransition(async () => {
      try { await setPhotoPick(token, p.id, p.pick, note); } catch { /* noop */ }
    });
  }

  return (
    <div className="space-y-4">
      {/* Resumen de selección */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <span className="font-semibold">{photos.length} fotos</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><Heart className="size-3" /> {liked} me gustan</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"><X className="size-3" /> {disliked} descartadas</span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">{pending} sin marcar</span>
        <span className="ml-auto text-xs text-muted-foreground">Marca ♥ las que te gustan y ✗ las que no. Se guarda solo.</span>
      </div>

      {/* Cuadrícula */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p) => {
          const liked = p.pick === "ME_GUSTA";
          const disliked = p.pick === "NO_ME_GUSTA";
          return (
            <div key={p.id} className={cn("overflow-hidden rounded-xl border bg-card transition-colors", liked ? "border-emerald-400" : disliked ? "border-rose-300 opacity-70" : "border-border")}>
              <button type="button" onClick={() => setZoom(p)} className="block w-full" title="Ampliar">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.src} alt={p.filename} loading="lazy" className="aspect-square w-full object-cover" />
              </button>
              <div className="flex items-center gap-1 p-1.5">
                <button
                  type="button"
                  onClick={() => setPick(p, "ME_GUSTA")}
                  aria-pressed={liked}
                  className={cn("flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors", liked ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-500/15")}
                  title="Me gusta"
                >
                  <Heart className={cn("size-3.5", liked && "fill-current")} /> Sí
                </button>
                <button
                  type="button"
                  onClick={() => setPick(p, "NO_ME_GUSTA")}
                  aria-pressed={disliked}
                  className={cn("flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium transition-colors", disliked ? "bg-rose-500 text-white" : "bg-muted text-muted-foreground hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-500/15")}
                  title="No me gusta"
                >
                  <X className="size-3.5" /> No
                </button>
                <button
                  type="button"
                  onClick={() => setOpenNote((cur) => (cur === p.id ? null : p.id))}
                  className={cn("flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent", p.clientNote && "text-primary")}
                  title="Añadir un comentario a esta foto"
                >
                  <MessageSquare className="size-3.5" />
                </button>
              </div>
              {openNote === p.id || p.clientNote ? (
                <div className="px-1.5 pb-1.5">
                  <textarea
                    defaultValue={p.clientNote ?? ""}
                    onBlur={(e) => { if (e.target.value !== (p.clientNote ?? "")) saveNote(p, e.target.value); }}
                    rows={2}
                    placeholder="Comentario para esta foto…"
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Visor ampliado */}
      {zoom ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(null)}>
          <button type="button" className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" title="Cerrar"><X className="size-5" /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.src} alt={zoom.filename} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => { setPick(zoom, "ME_GUSTA"); setZoom((z) => (z ? { ...z, pick: z.pick === "ME_GUSTA" ? "PENDIENTE" : "ME_GUSTA" } : z)); }} className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium", zoom.pick === "ME_GUSTA" ? "bg-emerald-500 text-white" : "bg-white/90 text-foreground")}>
              <Heart className={cn("size-4", zoom.pick === "ME_GUSTA" && "fill-current")} /> Me gusta
            </button>
            <button type="button" onClick={() => { setPick(zoom, "NO_ME_GUSTA"); setZoom((z) => (z ? { ...z, pick: z.pick === "NO_ME_GUSTA" ? "PENDIENTE" : "NO_ME_GUSTA" } : z)); }} className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium", zoom.pick === "NO_ME_GUSTA" ? "bg-rose-500 text-white" : "bg-white/90 text-foreground")}>
              <X className="size-4" /> No me gusta
            </button>
          </div>
        </div>
      ) : null}

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Check className="size-3.5" /> Tu selección se guarda automáticamente. El equipo verá qué fotos elegiste.
      </p>
    </div>
  );
}
