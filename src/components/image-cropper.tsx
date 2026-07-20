"use client";

import * as React from "react";
import { X, Check, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

// REENCUADRE con zoom antes de subir una imagen (foto/portada de cliente y proyecto).
// Sin dependencias: pointer events (mouse Y táctil — arrastrar para mover, pellizco de dos
// dedos o rueda/deslizador para zoom) + canvas para exportar el recorte. El servidor
// re-optimiza igual (sharp → WebP), así que aquí solo se decide el ENCUADRE.
export function ImageCropper({
  file,
  aspect,
  title = "Reencuadrar imagen",
  outWidth = 1600,
  onCancel,
  onDone,
}: {
  file: File;
  aspect: number; // ancho/alto del encuadre (1 = cuadrado, 3.2 = portada)
  title?: string;
  outWidth?: number; // ancho máximo del archivo exportado
  onCancel: () => void;
  onDone: (cropped: File) => void;
}) {
  const [url] = React.useState(() => URL.createObjectURL(file));
  React.useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const boxRef = React.useRef<HTMLDivElement>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const [nat, setNat] = React.useState({ w: 0, h: 0 });
  const [zoom, setZoom] = React.useState(1); // 1 = la imagen CUBRE justo el encuadre
  const [pos, setPos] = React.useState({ x: 0, y: 0 }); // esquina de la imagen en px de la vista
  const [busy, setBusy] = React.useState(false);
  const ready = box.w > 0 && nat.w > 0;

  const MAX_ZOOM = 5;
  const coverScale = React.useCallback(
    () => (nat.w && box.w ? Math.max(box.w / nat.w, box.h / nat.h) : 1),
    [nat, box],
  );
  const scaleFor = React.useCallback((z: number) => coverScale() * z, [coverScale]);

  // La imagen nunca deja huecos: la esquina se acota para que siempre cubra el encuadre.
  const clampPos = React.useCallback(
    (p: { x: number; y: number }, z: number) => {
      const s = scaleFor(z);
      const minX = box.w - nat.w * s;
      const minY = box.h - nat.h * s;
      return { x: Math.min(0, Math.max(minX, p.x)), y: Math.min(0, Math.max(minY, p.y)) };
    },
    [scaleFor, box, nat],
  );

  // Mide el recuadro (y re-acota al girar el teléfono / redimensionar).
  React.useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  React.useEffect(() => {
    if (ready) setPos((p) => clampPos(p, zoom));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box]);

  // Al cargar la imagen: centrada, cubriendo el encuadre.
  const onLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const n = { w: img.naturalWidth, h: img.naturalHeight };
    setNat(n);
    const el = boxRef.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    const s = Math.max(w / n.w, h / n.h);
    setZoom(1);
    setPos({ x: (w - n.w * s) / 2, y: (h - n.h * s) / 2 });
  };

  // Zoom manteniendo FIJO el punto bajo el cursor/pellizco.
  const zoomAt = React.useCallback(
    (pt: { x: number; y: number }, nextZoom: number) => {
      const nz = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
      setPos((p) => {
        const s0 = scaleFor(zoom);
        const s1 = scaleFor(nz);
        const imgPt = { x: (pt.x - p.x) / s0, y: (pt.y - p.y) / s0 };
        return clampPos({ x: pt.x - imgPt.x * s1, y: pt.y - imgPt.y * s1 }, nz);
      });
      setZoom(nz);
    },
    [zoom, scaleFor, clampPos],
  );

  // ── Arrastre + pellizco con pointer events (unifica mouse y táctil) ──
  const pointers = React.useRef(new Map<number, { x: number; y: number }>());
  const gesture = React.useRef<{ mode: "drag"; start: { x: number; y: number }; pos: { x: number; y: number } } | { mode: "pinch"; dist: number; zoom: number } | null>(null);

  const rel = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const pinchState = () => {
    const [a, b] = [...pointers.current.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    boxRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, rel(e));
    if (pointers.current.size === 1) {
      gesture.current = { mode: "drag", start: rel(e), pos };
    } else if (pointers.current.size === 2) {
      gesture.current = { mode: "pinch", dist: pinchState().dist, zoom };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, rel(e));
    const g = gesture.current;
    if (!g) return;
    if (g.mode === "pinch" && pointers.current.size >= 2) {
      const { dist, mid } = pinchState();
      if (g.dist > 0) zoomAt(mid, g.zoom * (dist / g.dist));
    } else if (g.mode === "drag" && pointers.current.size === 1) {
      const now = rel(e);
      setPos(clampPos({ x: g.pos.x + (now.x - g.start.x), y: g.pos.y + (now.y - g.start.y) }, zoom));
    }
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 1) {
      // De pellizco a arrastre sin saltos: re-ancla con el dedo que queda.
      const [p] = [...pointers.current.values()];
      gesture.current = { mode: "drag", start: p, pos };
    } else if (pointers.current.size === 0) {
      gesture.current = null;
    }
  };

  // Rueda del mouse = zoom al cursor. Nativo con passive:false (React registra wheel pasivo
  // y preventDefault no funcionaría → la página haría scroll debajo del modal).
  React.useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const pt = { x: e.clientX - r.left, y: e.clientY - r.top };
      zoomAt(pt, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, zoomAt]);

  // Escape cancela.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exporta el encuadre elegido a un archivo (JPEG; el servidor lo vuelve WebP).
  const done = () => {
    const img = imgRef.current;
    if (!img || !ready || busy) return;
    setBusy(true);
    const s = scaleFor(zoom);
    const sx = -pos.x / s;
    const sy = -pos.y / s;
    const sw = box.w / s;
    const sh = box.h / s;
    // No agrandar más allá del recorte real (evita archivos inflados sin detalle).
    const W = Math.max(320, Math.min(outWidth, Math.round(sw)));
    const H = Math.round(W / aspect);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setBusy(false); return; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    canvas.toBlob(
      (blob) => {
        if (!blob) { setBusy(false); return; }
        const name = `${file.name.replace(/\.[^.]+$/, "") || "imagen"}.jpg`;
        onDone(new File([blob], name, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  };

  const s = scaleFor(zoom);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button type="button" onClick={onCancel} aria-label="Cancelar" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>

        {/* Encuadre: arrastra para mover; pellizco/rueda/deslizador para zoom. */}
        <div
          ref={boxRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          className="relative w-full cursor-grab touch-none select-none overflow-hidden rounded-lg bg-black active:cursor-grabbing"
          style={{ aspectRatio: String(aspect) }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={url}
            alt=""
            draggable={false}
            onLoad={onLoad}
            className="pointer-events-none absolute left-0 top-0 max-w-none"
            style={ready ? { width: nat.w * s, height: nat.h * s, transform: `translate(${pos.x}px, ${pos.y}px)` } : { opacity: 0 }}
          />
          {/* Rejilla de tercios, sutil, para componer el encuadre. */}
          <div className="pointer-events-none absolute inset-0 opacity-30">
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/70" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/70" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/70" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/70" />
          </div>
        </div>

        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Arrastra para reencuadrar · pellizca (celular) o usa la rueda/el deslizador para el zoom
        </p>

        <div className="mt-2 flex items-center gap-2 px-1">
          <ZoomOut className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => zoomAt({ x: box.w / 2, y: box.h / 2 }, Number(e.target.value))}
            aria-label="Zoom"
            className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
          <ZoomIn className="size-4 shrink-0 text-muted-foreground" />
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">
            Cancelar
          </button>
          <button
            type="button"
            onClick={done}
            disabled={!ready || busy}
            className={cn("inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50")}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Usar imagen
          </button>
        </div>
      </div>
    </div>
  );
}
