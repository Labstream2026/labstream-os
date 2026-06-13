"use client";

import * as React from "react";
import { addReviewComment, setReviewDecision } from "./actions";

type Comment = {
  id: string;
  authorName: string;
  body: string;
  timecode: number | null;
  fromClient: boolean;
  createdAt: string;
};

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i;

export function ReviewClient({
  token,
  videoUrl,
  versionNumber,
  comments,
  status,
}: {
  token: string;
  videoUrl: string | null;
  versionNumber: number | null;
  comments: Comment[];
  status: string;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  const [tc, setTc] = React.useState<number | null>(null);
  const [pending, start] = React.useTransition();
  const isVideo = !!videoUrl && VIDEO_EXT.test(videoUrl);

  React.useEffect(() => {
    setName(localStorage.getItem("review_name") || "");
  }, []);

  const grabTime = () => {
    if (videoRef.current) setTc(videoRef.current.currentTime);
  };
  const seek = (t: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = t;
      videoRef.current.play().catch(() => {});
    }
  };

  const submit = () => {
    if (!body.trim()) return;
    localStorage.setItem("review_name", name);
    const fd = new FormData();
    fd.set("authorName", name);
    fd.set("body", body);
    if (tc != null) fd.set("timecode", String(tc));
    if (versionNumber != null) fd.set("versionNumber", String(versionNumber));
    start(async () => {
      await addReviewComment(token, fd);
      setBody("");
      setTc(null);
    });
  };

  const decide = (d: string) => {
    if (!confirm(d === "APROBADO" ? "¿Aprobar este entregable?" : "¿Solicitar cambios?")) return;
    start(() => setReviewDecision(token, d));
  };

  return (
    <div className="grid gap-6 md:grid-cols-[1.6fr_1fr]">
      {/* Reproductor / enlace */}
      <div>
        {isVideo ? (
          <video ref={videoRef} src={videoUrl!} controls className="w-full rounded-xl border border-border bg-black" />
        ) : videoUrl ? (
          <a href={videoUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm">
            <span className="font-medium">Ver el material en una pestaña nueva</span>
            <span className="break-all text-muted-foreground">{videoUrl}</span>
          </a>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Aún no hay una versión cargada para revisar.
          </div>
        )}

        {/* Decisión */}
        {status !== "APROBADO" ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => decide("APROBADO")} disabled={pending} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              Aprobar entregable
            </button>
            <button onClick={() => decide("CORRECCIONES")} disabled={pending} className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-500/10 dark:text-amber-300">
              Solicitar cambios
            </button>
          </div>
        ) : (
          <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            ✅ Has aprobado este entregable. ¡Gracias!
          </p>
        )}
      </div>

      {/* Comentarios */}
      <div className="flex flex-col">
        <h2 className="mb-2 text-sm font-semibold">Comentarios ({comments.length})</h2>
        <div className="mb-3 max-h-[42vh] flex-1 space-y-2 overflow-y-auto">
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sé el primero en comentar.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.authorName}</span>
                  {!c.fromClient ? <span className="rounded bg-secondary px-1.5 text-[10px] text-secondary-foreground">equipo</span> : null}
                  {c.timecode != null ? (
                    <button onClick={() => seek(c.timecode!)} className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary hover:bg-primary/20">
                      {fmtTime(c.timecode)}
                    </button>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-foreground/90">{c.body}</p>
              </div>
            ))
          )}
        </div>

        {/* Nuevo comentario */}
        <div className="space-y-2 rounded-xl border border-border bg-card p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Escribe tu comentario…"
            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center justify-between gap-2">
            {isVideo ? (
              <button onClick={grabTime} type="button" className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent">
                {tc != null ? `⏱ ${fmtTime(tc)}` : "Marcar momento del video"}
              </button>
            ) : <span />}
            <button onClick={submit} disabled={pending || !body.trim()} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {pending ? "Enviando…" : "Comentar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
