"use client";

import * as React from "react";
import { addReviewComment, setReviewDecision } from "./actions";

export type ReviewVersion = {
  number: number;
  notes: string | null;
  kind: "video" | "image" | "youtube" | "vimeo" | "drive_file" | "drive_folder" | "other" | "none";
  src: string | null;
  openUrl: string | null;
  fileName: string | null;
  timecodeCapable: boolean;
};

type Comment = {
  id: string;
  authorName: string;
  body: string;
  timecode: number | null;
  versionNumber: number | null;
  drawing: { image?: string } | null;
  fromClient: boolean;
  createdAt: string;
};

type PlayerApi = { getTime: () => number | null; seek: (t: number) => void };

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function ReviewClient({
  token,
  versions,
  comments,
  status,
  allowDrawings,
}: {
  token: string;
  versions: ReviewVersion[];
  comments: Comment[];
  status: string;
  allowDrawings: boolean;
}) {
  const [vIdx, setVIdx] = React.useState(0);
  const version = versions[vIdx] ?? versions[0];
  const playerRef = React.useRef<PlayerApi | null>(null);

  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  const [tc, setTc] = React.useState<number | null>(null);
  const [drawOpen, setDrawOpen] = React.useState(false);
  const [drawing, setDrawing] = React.useState<string | null>(null); // dataURL PNG
  const [pending, start] = React.useTransition();

  React.useEffect(() => setName(localStorage.getItem("review_name") || ""), []);

  // Comentarios de la versión seleccionada (y los sin versión).
  const vComments = comments
    .filter((c) => c.versionNumber == null || c.versionNumber === version?.number)
    .sort((a, b) => (a.timecode ?? 1e9) - (b.timecode ?? 1e9));

  const grabTime = () => {
    const t = playerRef.current?.getTime();
    if (t != null) setTc(t);
  };
  const seek = (t: number) => playerRef.current?.seek(t);

  const submit = () => {
    if (!body.trim() && !drawing) return;
    localStorage.setItem("review_name", name);
    const fd = new FormData();
    fd.set("authorName", name);
    fd.set("body", body);
    if (tc != null) fd.set("timecode", String(tc));
    if (version) fd.set("versionNumber", String(version.number));
    if (drawing) fd.set("drawingData", JSON.stringify({ image: drawing, timecode: tc }));
    start(async () => {
      await addReviewComment(token, fd);
      setBody(""); setTc(null); setDrawing(null); setDrawOpen(false);
    });
  };

  const decide = (d: string) => {
    if (!confirm(d === "APROBADO" ? "¿Aprobar este entregable?" : "¿Solicitar cambios?")) return;
    localStorage.setItem("review_name", name);
    start(() => setReviewDecision(token, d, name));
  };

  return (
    <div className="grid gap-6 md:grid-cols-[1.6fr_1fr]">
      {/* Material */}
      <div>
        {versions.length > 1 ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Versión:</span>
            {versions.map((v, i) => (
              <button key={v.number} onClick={() => { setVIdx(i); setTc(null); setDrawing(null); setDrawOpen(false); }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${i === vIdx ? "bg-primary text-primary-foreground" : "border border-border hover:bg-accent"}`}>
                v{v.number}
              </button>
            ))}
          </div>
        ) : null}

        <MediaViewer version={version} apiRef={playerRef} drawOpen={drawOpen} onDrawn={setDrawing} />

        {version?.notes ? (
          <p className="mt-2 rounded-md bg-card px-3 py-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">Notas v{version.number}:</span> {version.notes}</p>
        ) : null}

        {/* Herramientas */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {version?.openUrl ? (
            <a href={version.openUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Abrir original ↗</a>
          ) : null}
          {allowDrawings ? (
            <button onClick={() => setDrawOpen((o) => !o)} className={`rounded-md border px-2.5 py-1 text-xs font-medium ${drawOpen ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"}`}>
              {drawOpen ? "✏️ Dibujando — toca el material" : "✏️ Dibujar / anotar"}
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground">El dibujo/captura requieren el modo «dibujos» — pídeselo al productor.</span>
          )}
          {drawing ? <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Anotación lista para adjuntar</span> : null}
        </div>

        {/* Decisión */}
        {status !== "APROBADO" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => decide("APROBADO")} disabled={pending} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Aprobar entregable</button>
            <button onClick={() => decide("CORRECCIONES")} disabled={pending} className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-500/10 dark:text-amber-300">Solicitar cambios</button>
          </div>
        ) : (
          <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">✅ Has aprobado este entregable. ¡Gracias!</p>
        )}
      </div>

      {/* Comentarios */}
      <div className="flex flex-col">
        <h2 className="mb-2 text-sm font-semibold">Comentarios ({vComments.length})</h2>
        <div className="mb-3 max-h-[46vh] flex-1 space-y-2 overflow-y-auto">
          {vComments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay comentarios. Marca un momento del video o escribe la primera nota.</p>
          ) : (
            vComments.map((c) => (
              <div key={c.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.authorName}</span>
                  {!c.fromClient ? <span className="rounded bg-secondary px-1.5 text-[10px] text-secondary-foreground">equipo</span> : null}
                  {c.timecode != null ? (
                    <button onClick={() => seek(c.timecode!)} className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary hover:bg-primary/20">{fmtTime(c.timecode)}</button>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-foreground/90">{c.body}</p>
                {c.drawing?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.drawing.image} alt="Anotación" className="mt-2 w-full rounded-md border border-border" />
                ) : null}
              </div>
            ))
          )}
        </div>

        {/* Nuevo comentario */}
        <div className="space-y-2 rounded-xl border border-border bg-card p-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Escribe tu comentario…" className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <div className="flex items-center justify-between gap-2">
            {version?.timecodeCapable ? (
              <button onClick={grabTime} type="button" title="Pausa el video, mira el segundo y márcalo aquí" className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent">
                {tc != null ? `⏱ ${fmtTime(tc)}` : "Marcar momento"}
              </button>
            ) : <span />}
            <button onClick={submit} disabled={pending || (!body.trim() && !drawing)} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {pending ? "Enviando…" : "Comentar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Visor de medios con captura/anotación ──
function MediaViewer({ version, apiRef, drawOpen, onDrawn }: {
  version: ReviewVersion | undefined;
  apiRef: React.MutableRefObject<PlayerApi | null>;
  drawOpen: boolean;
  onDrawn: (dataUrl: string | null) => void;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const ytRef = React.useRef<HTMLIFrameElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytPlayer = React.useRef<any>(null);

  // API del reproductor según el tipo de fuente.
  React.useEffect(() => {
    if (!version) { apiRef.current = null; return; }
    if (version.kind === "video") {
      apiRef.current = {
        getTime: () => videoRef.current?.currentTime ?? null,
        seek: (t) => { if (videoRef.current) { videoRef.current.currentTime = t; videoRef.current.play().catch(() => {}); } },
      };
    } else if (version.kind === "youtube") {
      apiRef.current = {
        getTime: () => { try { return ytPlayer.current?.getCurrentTime?.() ?? null; } catch { return null; } },
        seek: (t) => { try { ytPlayer.current?.seekTo?.(t, true); } catch { /* noop */ } },
      };
    } else {
      apiRef.current = { getTime: () => null, seek: () => {} };
    }
  }, [version, apiRef]);

  // Carga la IFrame API de YouTube y crea el reproductor (para leer el segundo).
  React.useEffect(() => {
    if (version?.kind !== "youtube" || !ytRef.current) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const make = () => { if (!cancelled && (window as any).YT && ytRef.current) ytPlayer.current = new (window as any).YT.Player(ytRef.current); };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).YT?.Player) make();
    else {
      const id = "yt-iframe-api";
      if (!document.getElementById(id)) {
        const s = document.createElement("script");
        s.id = id; s.src = "https://www.youtube.com/iframe_api";
        document.body.appendChild(s);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev = (window as any).onYouTubeIframeAPIReady;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).onYouTubeIframeAPIReady = () => { prev?.(); make(); };
    }
    return () => { cancelled = true; };
  }, [version]);

  if (!version || version.kind === "none" || !version.src) {
    return <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">Sin material para esta versión.</div>;
  }

  // Elemento del que se puede capturar el fotograma (video/imagen del mismo origen);
  // null en embeds: YouTube/Vimeo/Drive son iframes de otro origen y el navegador no
  // deja leer sus píxeles. En esos casos el cliente pega o sube una captura para anotarla.
  const captureTarget = () => (version?.kind === "video" ? videoRef.current : version?.kind === "image" ? imgRef.current : null);
  const canCapture = version?.kind === "video" || version?.kind === "image";
  const overlay = drawOpen ? (
    <DrawOverlay captureEl={captureTarget} canCapture={canCapture} onResult={onDrawn} />
  ) : null;

  if (version.kind === "video") {
    return (
      <div className="relative">
        <video ref={videoRef} src={version.src} controls crossOrigin="anonymous" className="w-full rounded-xl border border-border bg-black" />
        {overlay}
      </div>
    );
  }
  if (version.kind === "image") {
    return (
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={imgRef} src={version.src} crossOrigin="anonymous" alt="Material" className="w-full rounded-xl border border-border" />
        {overlay}
      </div>
    );
  }
  if (version.kind === "youtube" || version.kind === "vimeo" || version.kind === "drive_file" || version.kind === "drive_folder") {
    return (
      <div className="relative">
        <iframe ref={ytRef} src={version.src} className="aspect-video w-full rounded-xl border border-border bg-black" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
        {overlay}
      </div>
    );
  }
  // other → enlace
  return (
    <a href={version.openUrl ?? version.src} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm">
      <span className="font-medium">Ver el material en una pestaña nueva</span>
      <span className="break-all text-muted-foreground">{version.openUrl ?? version.src}</span>
    </a>
  );
}

type Stroke = { x: number; y: number }[];

// Lienzo de anotación. Compone un JPEG con un fondo + los trazos rojos. El fondo es,
// por prioridad: (1) una captura que el cliente pegó/subió — sirve para Drive,
// YouTube y Vimeo, donde el navegador no puede leer el iframe; (2) el fotograma del
// <video>/<img> del mismo origen; (3) si nada de eso, un fondo oscuro con los trazos.
function DrawOverlay({ captureEl, canCapture, onResult }: {
  captureEl: () => HTMLVideoElement | HTMLImageElement | null;
  canCapture: boolean;
  onResult: (dataUrl: string | null) => void;
}) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const strokes = React.useRef<Stroke[]>([]);
  const drawingNow = React.useRef(false);
  const bgImg = React.useRef<HTMLImageElement | null>(null);
  const [bgUrl, setBgUrl] = React.useState<string | null>(null);

  const ctx = () => ref.current?.getContext("2d") ?? null;
  const redraw = () => {
    const c = ref.current, g = ctx();
    if (!c || !g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.strokeStyle = "#ef4444"; g.lineWidth = 3; g.lineCap = "round"; g.lineJoin = "round";
    for (const s of strokes.current) { g.beginPath(); s.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); }
  };
  const commit = () => {
    const c = ref.current; if (!c) return;
    const src = bgImg.current ?? captureEl();
    onResult(composite(src, strokes.current, { w: c.width, h: c.height }));
  };

  React.useEffect(() => {
    const c = ref.current; if (!c) return;
    const r = c.getBoundingClientRect(); c.width = r.width; c.height = r.height;
  }, []);

  // Carga una captura (pegada o subida) como fondo de la anotación.
  const loadBg = (file: File | Blob | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const img = new Image();
      img.onload = () => { bgImg.current = img; setBgUrl(url); commit(); };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };
  const loadBgRef = React.useRef(loadBg);
  loadBgRef.current = loadBg;

  // Pegar (Ctrl/Cmd+V) una imagen del portapapeles mientras se anota.
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (item) { e.preventDefault(); loadBgRef.current(item.getAsFile()); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div className="absolute inset-0">
      {bgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bgUrl} alt="" className="absolute inset-0 h-full w-full rounded-xl bg-black object-contain" />
      ) : null}
      <canvas
        ref={ref}
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none rounded-xl"
        onPointerDown={(e) => { drawingNow.current = true; strokes.current.push([pos(e)]); (e.target as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (!drawingNow.current) return; strokes.current[strokes.current.length - 1].push(pos(e)); redraw(); }}
        onPointerUp={() => { drawingNow.current = false; commit(); }}
      />
      {!bgUrl && !canCapture ? (
        <div className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit max-w-[90%] rounded-md bg-black/70 px-3 py-1 text-center text-[11px] text-white">
          Pega (Ctrl/Cmd+V) o sube una captura del momento para anotarla
        </div>
      ) : null}
      <div className="absolute right-2 top-2 flex gap-1.5">
        <label className="cursor-pointer rounded bg-white/90 px-2 py-1 text-[11px] font-medium text-neutral-700 shadow hover:bg-white">
          Subir captura
          <input type="file" accept="image/*" className="hidden" onChange={(e) => loadBg(e.target.files?.[0] ?? null)} />
        </label>
        <button onClick={() => { strokes.current = []; bgImg.current = null; setBgUrl(null); redraw(); onResult(null); }} className="rounded bg-white/90 px-2 py-1 text-[11px] font-medium text-neutral-700 shadow hover:bg-white">Limpiar</button>
      </div>
    </div>
  );
}

// Compone un fondo (imagen/fotograma) + los trazos en un JPEG. Dibuja la fuente
// directamente; si no hay fuente o falla por CORS, usa fondo oscuro con los trazos.
function composite(source: HTMLImageElement | HTMLVideoElement | null, strokes: Stroke[], box: { w: number; h: number }): string | null {
  if (!strokes.length && !source) return null;
  const natW = source ? ((source as HTMLVideoElement).videoWidth || (source as HTMLImageElement).naturalWidth || source.clientWidth) : 0;
  const natH = source ? ((source as HTMLVideoElement).videoHeight || (source as HTMLImageElement).naturalHeight || source.clientHeight) : 0;
  const bgW = natW || box.w || 800;
  const bgH = natH || box.h || 450;
  const scale = Math.min(1, 800 / bgW);
  const cw = Math.round(bgW * scale), ch = Math.round(bgH * scale);
  const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
  const g = cv.getContext("2d"); if (!g) return null;
  let drew = false;
  if (source && natW) { try { g.drawImage(source, 0, 0, cw, ch); drew = true; } catch { /* CORS */ } }
  if (!drew) { g.fillStyle = "#0f172a"; g.fillRect(0, 0, cw, ch); }
  const sx = cw / box.w, sy = ch / box.h;
  g.strokeStyle = "#ef4444"; g.lineWidth = 3 * sx; g.lineCap = "round"; g.lineJoin = "round";
  for (const s of strokes) { g.beginPath(); s.forEach((p, i) => (i ? g.lineTo(p.x * sx, p.y * sy) : g.moveTo(p.x * sx, p.y * sy))); g.stroke(); }
  try { return cv.toDataURL("image/jpeg", 0.7); } catch { return null; }
}
