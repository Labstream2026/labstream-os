"use client";

import * as React from "react";
import { ArrowUpRight, Eraser, Loader2, Pencil, Square, Type, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Lienzo de anotación de PORTADAS ──
// Deliberadamente INDEPENDIENTE del lienzo de las revisiones de video (review-stage.tsx), que
// está atado a la captura de fotograma y al timecode y no se toca. Aquí, al ser una imagen
// fija, se puede ofrecer más: lápiz, flecha, rectángulo y texto, cuatro colores, deshacer por
// figura y limpiar.
//
// Las figuras se guardan en coordenadas NORMALIZADAS (0-1), así que redimensionar la ventana o
// girar el móvil no descoloca nada (el fallo que tiene el lienzo de video). Al enviar se aplana
// todo sobre la imagen original en un JPEG comprimido — igual que las correcciones de video, para
// que la anotación se vea en la campana, en el correo y en el panel sin reconstruir trazos.
//
// La imagen vive en NUESTRO origen (/api/files-asset), así que el canvas no queda «tainted» y
// toDataURL funciona sin CORS.

type Pt = { x: number; y: number };
type Shape =
  | { kind: "pen"; color: string; pts: Pt[] }
  | { kind: "arrow"; color: string; from: Pt; to: Pt }
  | { kind: "rect"; color: string; from: Pt; to: Pt }
  | { kind: "text"; color: string; at: Pt; text: string };

type Tool = "pen" | "arrow" | "rect" | "text";

const COLORS = ["#ff3b30", "#ffd60a", "#32d74b", "#ffffff"];
const MAX_EDGE = 1400; // lado largo del JPEG resultante
const SIZE_CAP = 480_000; // ~480 KB en base64, como las correcciones de video

// Dibuja una figura en un contexto ya escalado a (w, h) píxeles.
function paint(ctx: CanvasRenderingContext2D, s: Shape, w: number, h: number, unit: number) {
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = Math.max(2, unit * 3);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const P = (p: Pt) => ({ x: p.x * w, y: p.y * h });

  if (s.kind === "pen") {
    if (s.pts.length < 2) return;
    ctx.beginPath();
    const a = P(s.pts[0]);
    ctx.moveTo(a.x, a.y);
    for (const p of s.pts.slice(1)) {
      const q = P(p);
      ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    return;
  }
  if (s.kind === "rect") {
    const a = P(s.from);
    const b = P(s.to);
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    return;
  }
  if (s.kind === "arrow") {
    const a = P(s.from);
    const b = P(s.to);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const head = Math.max(10, unit * 14);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(ang - Math.PI / 7), b.y - head * Math.sin(ang - Math.PI / 7));
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(ang + Math.PI / 7), b.y - head * Math.sin(ang + Math.PI / 7));
    ctx.stroke();
    return;
  }
  // texto
  const p = P(s.at);
  const size = Math.max(14, unit * 26);
  ctx.font = `700 ${size}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "top";
  ctx.lineWidth = Math.max(3, unit * 5);
  ctx.strokeStyle = "rgba(0,0,0,.55)";
  ctx.strokeText(s.text, p.x, p.y);
  ctx.fillStyle = s.color;
  ctx.fillText(s.text, p.x, p.y);
}

export function CoverAnnotator({
  src,
  name,
  pending = false,
  promptTexto = "Escribe la nota que va sobre la portada:",
  onSend,
  onCancel,
}: {
  src: string;
  name: string;
  pending?: boolean;
  // Pregunta de la herramienta de TEXTO (la galería de fotos la usa con su propio texto).
  promptTexto?: string;
  // Devuelve el JPEG aplanado (o null si no se dibujó nada) + la nota escrita.
  onSend: (drawing: string | null, body: string) => void;
  onCancel: () => void;
}) {
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [shapes, setShapes] = React.useState<Shape[]>([]);
  const [tool, setTool] = React.useState<Tool>("pen");
  const [color, setColor] = React.useState(COLORS[0]);
  const [body, setBody] = React.useState("");
  const [live, setLive] = React.useState<Shape | null>(null);
  const [ready, setReady] = React.useState(false);

  // Repinta la capa de trabajo (pantalla). Se re-ejecuta al cambiar figuras o tamaño.
  const redraw = React.useCallback(() => {
    const c = canvasRef.current;
    const box = boxRef.current;
    if (!c || !box) return;
    const r = box.getBoundingClientRect();
    if (c.width !== Math.round(r.width) || c.height !== Math.round(r.height)) {
      c.width = Math.round(r.width);
      c.height = Math.round(r.height);
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const unit = c.width / 400; // grosor relativo al ancho visible
    for (const s of shapes) paint(ctx, s, c.width, c.height, unit);
    if (live) paint(ctx, live, c.width, c.height, unit);
  }, [shapes, live]);

  React.useEffect(() => {
    redraw();
  }, [redraw]);

  // Coordenadas normalizadas (0-1) → inmunes a redimensionar/rotar.
  React.useEffect(() => {
    const onResize = () => redraw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [redraw]);

  // Los punteros se enganchan de forma NATIVA al canvas (no con los props onPointer* de React):
  // el lienzo se monta dentro de un portal a <body> y ahí la delegación de eventos de React no
  // llega. Con addEventListener funciona siempre, y además permite `passive: false` para que
  // el dedo dibuje en vez de arrastrar la página.
  // La herramienta/color activos se leen desde una ref para que los listeners nativos (que se
  // registran una sola vez) siempre vean el valor vigente sin re-suscribirse en cada cambio.
  const state = React.useRef({ tool, color, pending, promptTexto });
  React.useEffect(() => {
    state.current = { tool, color, pending, promptTexto };
  });

  React.useEffect(() => {
    const c = canvasRef.current;
    const box = boxRef.current;
    if (!c || !box) return;

    const rel = (e: PointerEvent): Pt => {
      const r = box.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    };
    const span = (a: Pt, b: Pt) => Math.abs(b.x - a.x) + Math.abs(b.y - a.y);

    const onDown = (e: PointerEvent) => {
      const { tool: t, color: col, pending: busy } = state.current;
      if (busy) return;
      e.preventDefault();
      const p = rel(e);
      // La captura del puntero es un extra (seguir el trazo fuera del lienzo): si el navegador
      // la rechaza, el dibujo debe funcionar igual.
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* sin captura */
      }
      if (t === "text") {
        const text = window.prompt(state.current.promptTexto)?.trim();
        if (text) setShapes((s) => [...s, { kind: "text", color: col, at: p, text: text.slice(0, 60) }]);
        return;
      }
      if (t === "pen") setLive({ kind: "pen", color: col, pts: [p] });
      else setLive({ kind: t, color: col, from: p, to: p });
    };

    const onMove = (e: PointerEvent) => {
      const p = rel(e);
      setLive((s) => {
        if (!s) return s;
        if (s.kind === "pen") return { ...s, pts: [...s.pts, p] };
        if (s.kind === "text") return s;
        return { ...s, to: p };
      });
    };

    const onUp = () => {
      setLive((s) => {
        if (!s) return null;
        // Descarta toques accidentales por DISTANCIA recorrida (no por número de puntos): un
        // trazo corto y rápido genera pocos puntos y es perfectamente válido.
        let meaningful = true;
        if (s.kind === "pen") {
          let d = 0;
          for (let i = 1; i < s.pts.length; i++) d += span(s.pts[i - 1], s.pts[i]);
          meaningful = d > 0.012;
        } else if (s.kind !== "text") {
          meaningful = span(s.from, s.to) > 0.02;
        }
        if (meaningful) setShapes((prev) => [...prev, s]);
        return null;
      });
    };

    c.addEventListener("pointerdown", onDown, { passive: false });
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerup", onUp);
    c.addEventListener("pointercancel", onUp);
    return () => {
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointermove", onMove);
      c.removeEventListener("pointerup", onUp);
      c.removeEventListener("pointercancel", onUp);
    };
  }, []);

  // Aplana: imagen original + figuras, en JPEG bajo el tope de tamaño.
  const flatten = (): string | null => {
    const img = imgRef.current;
    if (!img || shapes.length === 0) return null;
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    if (!nw || !nh) return null;
    const scale = Math.min(1, MAX_EDGE / Math.max(nw, nh));
    const w = Math.round(nw * scale);
    const h = Math.round(nh * scale);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    try {
      ctx.drawImage(img, 0, 0, w, h);
    } catch {
      return null; // imagen de otro origen: no se puede aplanar
    }
    const unit = w / 400;
    for (const s of shapes) paint(ctx, s, w, h, unit);
    // toDataURL LANZA SecurityError si el canvas quedó «teñido» por una imagen de otro origen (una
    // foto ENLAZADA de Google Drive: drawImage no falla, pero teñir sí). Iba fuera de try/catch, así
    // que el error subía por send()→onClick y se perdían el dibujo Y la nota en silencio. Ahora se
    // atrapa: el dibujo se descarta pero la nota (body) sigue su curso en send().
    try {
      for (const q of [0.72, 0.6, 0.5, 0.4, 0.32]) {
        const url = c.toDataURL("image/jpeg", q);
        if (url.length <= SIZE_CAP) return url;
      }
      return c.toDataURL("image/jpeg", 0.3);
    } catch {
      return null; // canvas teñido (imagen de otro origen): no se puede exportar el dibujo
    }
  };

  const send = () => {
    const drawing = flatten();
    if (!drawing && !body.trim()) return;
    onSend(drawing, body.trim());
  };

  const toolBtn = (t: Tool, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={tool === t}
      onClick={() => setTool(t)}
      className={cn(
        "grid size-9 place-items-center rounded-lg border transition-colors",
        tool === t ? "border-transparent bg-primary text-primary-foreground" : "border-white/15 text-white/80 hover:bg-white/10",
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="relative mx-auto max-h-[52vh] min-h-0 w-full max-w-sm" ref={boxRef}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt={name}
          onLoad={() => {
            setReady(true);
            redraw();
          }}
          draggable={false}
          className="max-h-[52vh] w-full select-none rounded-lg object-contain"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 size-full touch-none rounded-lg"
          style={{ cursor: tool === "text" ? "text" : "crosshair" }}
        />
        {!ready ? (
          <div className="absolute inset-0 grid place-items-center rounded-lg bg-black/40">
            <Loader2 className="size-5 animate-spin text-white/70" />
          </div>
        ) : null}
      </div>

      {/* Herramientas */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {toolBtn("pen", "Lápiz", <Pencil className="size-4" />)}
        {toolBtn("arrow", "Flecha", <ArrowUpRight className="size-4" />)}
        {toolBtn("rect", "Recuadro", <Square className="size-4" />)}
        {toolBtn("text", "Texto", <Type className="size-4" />)}
        <span className="mx-1 h-6 w-px bg-white/15" />
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            aria-pressed={color === c}
            onClick={() => setColor(c)}
            style={{ backgroundColor: c }}
            className={cn("size-6 rounded-full border-2 transition-transform", color === c ? "scale-110 border-white" : "border-white/25")}
          />
        ))}
        <span className="mx-1 h-6 w-px bg-white/15" />
        <button
          type="button"
          title="Deshacer"
          aria-label="Deshacer"
          disabled={shapes.length === 0}
          onClick={() => setShapes((s) => s.slice(0, -1))}
          className="grid size-9 place-items-center rounded-lg border border-white/15 text-white/80 hover:bg-white/10 disabled:opacity-40"
        >
          <Undo2 className="size-4" />
        </button>
        <button
          type="button"
          title="Limpiar todo"
          aria-label="Limpiar todo"
          disabled={shapes.length === 0}
          onClick={() => setShapes([])}
          className="grid size-9 place-items-center rounded-lg border border-white/15 text-white/80 hover:bg-white/10 disabled:opacity-40"
        >
          <Eraser className="size-4" />
        </button>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Explica el cambio (opcional)… el dibujo se envía con la nota."
        className="w-full resize-none rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-primary"
      />

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={pending} className="rounded-lg px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 disabled:opacity-50">
          Cancelar
        </button>
        <button
          type="button"
          onClick={send}
          disabled={pending || (shapes.length === 0 && !body.trim())}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : null} Enviar al equipo
        </button>
      </div>
    </div>
  );
}
