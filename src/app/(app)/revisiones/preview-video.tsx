"use client";

import * as React from "react";

// ── Preview en vivo sobre la portada de una tarjeta ────────────────────────────
// Al posar el ratón 350 ms se monta un <video muted> con la MISMA fuente firmada que usa el
// reproductor de revisión (files-asset para lo subido al NAS, review-media para lo de Drive);
// al salir, se desmonta y no queda nada cargado. Quien no posa el ratón no mueve un byte: una
// pantalla con cincuenta piezas pinta cincuenta portadas, no cincuenta videos.
//
// Los 350 ms no son estética: sin la espera, pasear el ratón hacia una tarjeta del fondo
// atraviesa cuatro y dispara cuatro cargas que nadie pidió.
//
// Solo en escritorio (hover real + puntero fino). En el celular no existe el hover: el toque
// abre la revisión, como siempre. Y si el video no carga —una carpeta de Drive sin video, un
// enlace muerto— simplemente se queda la portada: el preview nunca puede dejar la tarjeta peor
// de lo que estaba.
export function PreviewVideo({ src }: { src: string }) {
  const [fase, setFase] = React.useState<"quieta" | "cargando" | "viva">("quieta");
  const [avance, setAvance] = React.useState(0);
  const reloj = React.useRef<number | null>(null);
  // `matchMedia` solo existe en el navegador; se resuelve una vez montados y no por render.
  const conHover = React.useRef(false);
  React.useEffect(() => {
    conHover.current = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    return () => { if (reloj.current) window.clearTimeout(reloj.current); };
  }, []);

  const entrar = () => {
    if (!conHover.current || fase !== "quieta") return;
    reloj.current = window.setTimeout(() => setFase("cargando"), 350);
  };
  const salir = () => {
    if (reloj.current) { window.clearTimeout(reloj.current); reloj.current = null; }
    setFase("quieta");
    setAvance(0);
  };

  return (
    // Cubre la miniatura entera. Va DENTRO del <Link> de la tarjeta y no roba el clic: hacer
    // clic durante el preview navega a la revisión, que es lo que ese clic siempre significó.
    <span className="absolute inset-0" onMouseEnter={entrar} onMouseLeave={salir}>
      {fase !== "quieta" ? (
        <>
          <video
            src={src}
            muted
            playsInline
            autoPlay
            preload="auto"
            // El video aparece con un fundido SOLO cuando ya reproduce: mientras carga, sigue
            // la portada. Así nunca hay un rectángulo negro haciendo tiempo.
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${fase === "viva" ? "opacity-100" : "opacity-0"}`}
            onPlaying={() => setFase("viva")}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration > 0) setAvance((v.currentTime / v.duration) * 100);
            }}
            // Falla → vuelve la portada y no se reintenta en este hover. La pieza se revisa
            // igual con el clic; el preview es cortesía, no un camino crítico.
            onError={salir}
          />
          {fase === "viva" ? (
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-white/25">
              <span className="block h-full bg-primary" style={{ width: `${avance}%` }} />
            </span>
          ) : null}
        </>
      ) : null}
    </span>
  );
}
