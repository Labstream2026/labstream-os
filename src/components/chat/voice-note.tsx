"use client";

import * as React from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

// Reproductor de nota de voz estilo WhatsApp: play/pausa, onda real (amplitudes
// decodificadas con Web Audio), duración y clic para buscar. La reproducción usa un
// <audio> normal, así que funciona aunque el navegador no pueda decodificar la onda.

const BARS = 40;

let sharedCtx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx) sharedCtx = new AC();
  return sharedCtx;
}

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function VoiceNote({ src }: { src: string }) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = React.useState<number[]>(() => Array.from({ length: BARS }, () => 0.4));
  const [playing, setPlaying] = React.useState(false);
  const [cur, setCur] = React.useState(0);
  const [dur, setDur] = React.useState(0);

  // Decodifica el audio para dibujar la onda (best-effort; si falla, deja la onda por defecto).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ac = getCtx();
        if (!ac) return;
        const res = await fetch(src);
        const raw = await res.arrayBuffer();
        const audio = await ac.decodeAudioData(raw);
        const data = audio.getChannelData(0);
        const block = Math.floor(data.length / BARS) || 1;
        const out: number[] = [];
        let max = 0;
        for (let i = 0; i < BARS; i++) {
          let sum = 0;
          for (let j = 0; j < block; j++) { const v = data[i * block + j] || 0; sum += v * v; }
          const rms = Math.sqrt(sum / block);
          out.push(rms);
          if (rms > max) max = rms;
        }
        const norm = out.map((v) => (max > 0 ? Math.max(0.12, v / max) : 0.4));
        if (!cancelled) setPeaks(norm);
      } catch {
        /* sin onda decodificada: queda la barra por defecto, la reproducción sigue OK */
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };

  const onSeek = (e: React.MouseEvent<HTMLButtonElement>) => {
    const a = audioRef.current;
    if (!a || !Number.isFinite(dur) || dur <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = frac * dur;
  };

  const progress = dur > 0 && Number.isFinite(dur) ? cur / dur : 0;

  return (
    <div className="flex w-64 max-w-full items-center gap-2.5 rounded-2xl border border-border bg-background px-3 py-2">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const a = e.currentTarget;
          // Chrome a veces reporta duration = Infinity en webm de MediaRecorder: se fuerza un
          // seek grande para que recalcule la duración real.
          if (!Number.isFinite(a.duration)) {
            const fix = () => { a.removeEventListener("timeupdate", fix); if (Number.isFinite(a.duration)) setDur(a.duration); a.currentTime = 0; };
            a.addEventListener("timeupdate", fix);
            a.currentTime = 1e101;
          } else {
            setDur(a.duration);
          }
        }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pausar nota de voz" : "Reproducir nota de voz"}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        {playing ? <Pause className="size-4" /> : <Play className="ml-0.5 size-4" />}
      </button>
      <button
        type="button"
        onClick={onSeek}
        aria-label="Buscar en la nota de voz"
        className="flex h-7 min-w-0 flex-1 items-center gap-[2px]"
      >
        {peaks.map((p, i) => (
          <span
            key={i}
            className={cn("w-[2px] shrink-0 rounded-full", i / BARS <= progress ? "bg-primary" : "bg-muted-foreground/30")}
            style={{ height: `${Math.max(10, Math.round(p * 100))}%` }}
          />
        ))}
      </button>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{playing ? fmt(cur) : fmt(dur)}</span>
    </div>
  );
}
