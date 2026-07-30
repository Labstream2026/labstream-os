"use client";

import * as React from "react";
import { File as FileIcon, FileText, Film, Image as ImageIcon, Loader2, Music } from "lucide-react";
import { cn } from "@/lib/utils";

// ── La miniatura de una pieza del disco ────────────────────────────────────────
// Una sola pieza para las TRES pantallas donde se busca material (la galería, la ficha del
// disco y el selector de los entregables). Antes cada una resolvía esto a su manera —o no lo
// resolvía: la ficha y el selector enseñaban solo el nombre del archivo, así que encontrar
// «ese plano» obligaba a abrirlos de uno en uno.
//
// Hace tres cosas que sueltas no valen nada:
//
//  1. PINTA EL PÓSTER que fabrica la GPU de LabTem. No se transcodifica nada aquí: el póster
//     ya existe en el disco y la app lo cachea en WebP la primera vez que alguien lo mira.
//  2. DICE «PREPARANDO» cuando el póster todavía no está. Es la diferencia entre informar y
//     parecer roto: sin esto el navegador pinta su icono de imagen partida —justo lo que se
//     ve hoy en la galería mientras la fábrica vacía el atraso de 185 carpetas.
//  3. BARRE EL VÍDEO al pasar el ratón, con la tira de 20 fotogramas que la fábrica ya deja
//     hecha (`.sprite.jpg`). Se pide SOLO al entrar el ratón: pedirla para las 300 piezas de
//     una entrega al pintar sería mover megas que casi nadie va a mirar.

// Fijo a propósito, igual que en la fábrica (deploy/labtem/hacer-proxies.sh): la tira son
// 20 fotogramas en UNA fila. Si cambia allí, cambia aquí.
const TIRA_FOTOGRAMAS = 20;

export type TipoPieza = "video" | "foto" | "doc" | "audio";

function IconoTipo({ tipo, className }: { tipo: TipoPieza; className?: string }) {
  const C = tipo === "video" ? Film : tipo === "foto" ? ImageIcon : tipo === "audio" ? Music : tipo === "doc" ? FileText : FileIcon;
  return <C className={className} />;
}

export function Miniatura({
  thumb,
  tira,
  tipo,
  alto = "fila",
  // `true` solo donde hay fábrica de copias ligeras (el disco de LabTem): ahí la ausencia de
  // póster significa «aún no fabricado». En un disco sin fábrica significa «no habrá», y
  // prometer «preparando» sería mentir.
  preparandoSiFalta = false,
  className,
}: {
  thumb: string; // URL del póster (ya con ?v=<mtime> para poder cachear fuerte)
  tira?: string | null; // URL de la tira de barrido; null = esta pieza no se barre
  tipo: TipoPieza;
  alto?: "fila" | "tarjeta";
  preparandoSiFalta?: boolean;
  className?: string;
}) {
  const [estado, setEstado] = React.useState<"cargando" | "ok" | "sin">("cargando");
  const [barriendo, setBarriendo] = React.useState(false);
  const [tiraLista, setTiraLista] = React.useState(false);
  const [fotograma, setFotograma] = React.useState(0);
  const caja = React.useRef<HTMLDivElement>(null);

  // Un documento no tiene póster que esperar: se queda en su icono y no pide nada al servidor.
  const pidePoster = tipo === "video" || tipo === "foto";
  const puedeBarrer = Boolean(tira) && tipo === "video" && estado === "ok";

  // La tira se carga la PRIMERA vez que el ratón entra, y se queda cacheada por el navegador.
  React.useEffect(() => {
    if (!barriendo || !tira || tiraLista) return;
    const img = new Image();
    img.onload = () => setTiraLista(true);
    img.src = tira; // 404 (clip corto o sin fabricar) → nunca se pone lista: se sigue viendo el póster
  }, [barriendo, tira, tiraLista]);

  const mover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tiraLista || !caja.current) return;
    const r = caja.current.getBoundingClientRect();
    const razon = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setFotograma(Math.min(TIRA_FOTOGRAMAS - 1, Math.floor(razon * TIRA_FOTOGRAMAS)));
  };

  const esTarjeta = alto === "tarjeta";
  const marco = cn(
    "relative shrink-0 overflow-hidden bg-muted",
    esTarjeta ? "aspect-video w-full rounded-lg" : "h-8 w-14 rounded border border-border",
    className,
  );

  return (
    <div
      ref={caja}
      className={marco}
      onMouseEnter={() => puedeBarrer && setBarriendo(true)}
      onMouseLeave={() => {
        setBarriendo(false);
        setFotograma(0);
      }}
      onMouseMove={puedeBarrer ? mover : undefined}
    >
      {/* El póster. Va en <img> pelado a propósito: lo sirve nuestra propia ruta leyendo del
          disco, y el optimizador de next/image no puede con eso. */}
      {pidePoster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          loading="lazy"
          onLoad={() => setEstado("ok")}
          onError={() => setEstado("sin")}
          className={cn(
            "size-full object-cover transition-opacity",
            estado === "ok" ? "opacity-100" : "opacity-0",
            barriendo && tiraLista && "opacity-0",
          )}
        />
      ) : null}

      {/* El barrido: la tira de 20 fotogramas se mueve por detrás con background-position. */}
      {puedeBarrer && barriendo && tiraLista ? (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${tira})`,
              backgroundSize: `${TIRA_FOTOGRAMAS * 100}% 100%`,
              backgroundPositionX: `${(fotograma / (TIRA_FOTOGRAMAS - 1)) * 100}%`,
              backgroundRepeat: "no-repeat",
            }}
          />
          {/* Dónde va el barrido dentro del clip: sin esto no se sabe si vas por el principio
              o por el final. */}
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black/30">
            <span
              className="block h-full bg-primary transition-[width] duration-75"
              style={{ width: `${((fotograma + 1) / TIRA_FOTOGRAMAS) * 100}%` }}
            />
          </span>
        </>
      ) : null}

      {/* Estados: cargando · preparando (la fábrica aún no llegó) · sin vista previa. */}
      {estado !== "ok" ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
          {!pidePoster ? (
            <IconoTipo tipo={tipo} className={esTarjeta ? "size-6" : "size-4"} />
          ) : estado === "cargando" ? (
            <Loader2 className={cn("animate-spin opacity-50", esTarjeta ? "size-5" : "size-3.5")} />
          ) : preparandoSiFalta ? (
            <>
              <IconoTipo tipo={tipo} className={cn("opacity-60", esTarjeta ? "size-5" : "size-3.5")} />
              {esTarjeta ? (
                <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">preparando…</span>
              ) : null}
            </>
          ) : (
            <IconoTipo tipo={tipo} className={cn("opacity-60", esTarjeta ? "size-6" : "size-4")} />
          )}
        </span>
      ) : null}
    </div>
  );
}

// La etiqueta que acompaña a la miniatura en las filas, donde no cabe el texto «preparando»
// debajo. Se exporta aparte para que cada lista decida dónde ponerla.
export function EtiquetaPreparando({ className }: { className?: string }) {
  return (
    <span
      title="LabTem todavía no ha fabricado la copia ligera de esta pieza"
      className={cn(
        "shrink-0 rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
        className,
      )}
    >
      preparando
    </span>
  );
}
