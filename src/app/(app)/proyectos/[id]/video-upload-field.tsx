"use client";

import * as React from "react";

// Campo de subida de material que, si el archivo es un VIDEO, captura en el cliente un
// fotograma de portada + la duración (canvas, sin ffmpeg) y los deja en inputs ocultos
// (`poster` = data URL JPEG, `durationSec`) para que la server action los reciba.
// Degrada suave: si no es video, o el navegador no puede procesarlo, los ocultos van
// vacíos y no pasa nada (la subida funciona igual). Reemplaza a un <input type="file">.
export function VideoUploadField({
  name,
  title,
  className,
  accept,
}: {
  name: string;
  title?: string;
  className?: string;
  accept?: string;
}) {
  const [poster, setPoster] = React.useState("");
  const [durationSec, setDurationSec] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPoster("");
    setDurationSec("");
    const file = e.currentTarget.files?.[0];
    if (!file || !file.type.startsWith("video/")) return;

    setBusy(true);
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      setBusy(false);
    };

    video.onloadedmetadata = () => {
      const d = video.duration;
      if (Number.isFinite(d) && d > 0) setDurationSec(String(Math.round(d)));
      // Un fotograma con contenido: 1 s o el 10% del video, lo que sea menor (evita el negro inicial).
      const t = Math.min(1, (Number.isFinite(d) && d > 0 ? d : 2) * 0.1);
      try {
        video.currentTime = t;
      } catch {
        finish();
      }
    };
    video.onseeked = () => {
      if (settled) return;
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h) {
          const scale = Math.min(1, 480 / w); // miniatura ligera
          const cw = Math.round(w * scale);
          const ch = Math.round(h * scale);
          const cv = document.createElement("canvas");
          cv.width = cw;
          cv.height = ch;
          const ctx = cv.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, cw, ch);
            for (const q of [0.6, 0.5, 0.4]) {
              const data = cv.toDataURL("image/jpeg", q);
              if (data.length <= 200_000) {
                setPoster(data);
                break;
              }
            }
          }
        }
      } catch {
        // El object URL es del mismo origen: no debería contaminar el canvas. Si pasa, sin poster.
      }
      finish();
    };
    video.onerror = finish;
    video.src = url;
  }

  return (
    <>
      <input type="file" name={name} title={title} accept={accept} onChange={onChange} className={className} />
      <input type="hidden" name="poster" value={poster} />
      <input type="hidden" name="durationSec" value={durationSec} />
      {busy ? <span className="text-[11px] text-muted-foreground">Generando miniatura…</span> : null}
    </>
  );
}
