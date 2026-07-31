// ── Transcodificación EN VIVO: el lado de la app ─────────────────────────────────────────
//
// La GPU que convierte vídeo está en LabTem, no aquí. Producción tiene el mismo chip gráfico
// físicamente pero su DSM no trae el driver (cero módulos i915 en disco, comprobado), así que
// el trabajo se le pide por la red local a un servicio que solo escucha ahí dentro
// (`deploy/labtem/vivo/`). Este módulo es el ÚNICO que le habla.
//
// QUÉ APORTA, que no es obvio teniendo ya la fábrica nocturna:
//  - Una pieza SIN copia hecha se puede ver AHORA. Hasta hoy el mensaje era «vuelve mañana», y
//    para material recién subido eso es el día entero.
//  - Cualquier calidad, incluidas las que la escalera no fabricó (un vertical corto no tiene
//    escalera: dura menos de 45 s y no le toca).
// Y qué NO aporta: no sustituye a nada. Una copia hecha sirve a cuantas personas quieran verla
// y no gasta GPU; esto se paga por espectador y por minuto. La copia sigue siendo la vía por
// defecto y esto es la respuesta cuando no la hay o no vale.
//
// SIN CONFIGURAR NO EXISTE. Igual que `NAS_GALERIA_DIR`: si faltan las variables, todas las
// funciones dicen «no» y la app se comporta exactamente como antes. Un portátil de desarrollo o
// un despliegue sin LabTem no rompen nada, simplemente no ofrecen el modo en vivo.

const BASE = (process.env.LABTEM_VIVO_URL || "").replace(/\/+$/, "");
const SECRETO = process.env.LABTEM_VIVO_SECRETO || "";

// El secreto viaja en CABECERA, nunca en la URL: las URLs acaban en los registros del proxy
// inverso y en el historial del navegador, y un secreto en un registro es un secreto quemado.
const CABECERA = "x-labtem-secreto";

export function vivoConfigurado(): boolean {
  return Boolean(BASE && SECRETO);
}

// Las calidades que el servicio admite. Se repite aquí a propósito, aunque LabTem también lo
// valide: así un valor inventado se corta con un 400 inmediato en vez de gastar un viaje de red
// para que lo rechacen al otro lado. Dos cerrojos para la misma puerta, ninguno de adorno.
//
// La calidad se mide por el LADO CORTO, no por la altura: en un vertical de 1080×1920 medir por
// altura ofrecía «1440p» sobre una pieza que todo el mundo llama 1080p. Por el lado corto,
// «720p» significa lo mismo tumbado que de pie.
export const CALIDADES_VIVO = [2160, 1440, 1080, 720, 480, 360] as const;
export type CalidadViva = (typeof CALIDADES_VIVO)[number];

export function esCalidadViva(n: unknown): n is CalidadViva {
  return typeof n === "number" && (CALIDADES_VIVO as readonly number[]).includes(n);
}

export type VivoInfo = {
  codec: string;
  w: number;
  h: number;
  duracion: number | null;
  audio: boolean;
  // La tasa total del archivo y el códec del audio: lo que hace falta para decidir si el
  // ORIGINAL ya sirve tal cual en el navegador, sin gastar GPU (ver `originalApto`).
  tasa: number | null;
  acodec: string;
  // ¿El índice (moov) va adelante? Sin esto el navegador rastrea gigas antes del primer
  // fotograma (los exports de Resolve traen el índice al final). Lo mide LabTem.
  rapido?: boolean;
  gpu: boolean;
  calidades: { calidad: number; w: number; h: number; kbps: number; codecs: string }[];
  libres: number;
};

// ¿El original ya es apto para el navegador tal cual? El MISMO criterio que usaba la fábrica
// para saltarse la copia («el original ya es apto»): contenedor que el navegador abre, H.264,
// 1080p o menos (por PÍXELES, no por altura: un vertical 1080×1920 cuenta como 1080p), tasa
// razonable y audio AAC/MP3 o mudo. Si cumple todo, se reproduce DIRECTO y la GPU ni se entera
// — que con seis plazas es la diferencia entre sobrar y faltar.
export function originalApto(rel: string, info: VivoInfo | null): boolean {
  if (!info) return false;
  const ext = (rel.split(".").pop() || "").toLowerCase();
  if (!["mp4", "m4v", "mov"].includes(ext)) return false;
  if (info.codec !== "h264") return false;
  if (!(info.w > 0 && info.h > 0) || info.w * info.h > 1920 * 1080) return false;
  if (!(typeof info.tasa === "number" && info.tasa > 0 && info.tasa <= 9_000_000)) return false;
  // Y tiene que ARRANCAR rápido: un «apto» con el índice al final (export de Resolve) se
  // queda 20+ s en negro mientras el navegador rastrea el moov — medido con uno de 2,9 GB.
  // Ese va al vivo aunque el códec sea perfecto.
  if (info.rapido !== true) return false;
  return ["", "aac", "mp3"].includes(info.acodec);
}

// ── Salud, con memoria corta ───────────────────────────────────────────────────────────────
// El reproductor pregunta «¿puedo?» antes de ofrecer el menú, y eso pasa en cada apertura de
// cada pieza. Sin memoria, abrir una galería serían decenas de viajes a LabTem para la misma
// respuesta. Con 15 s basta: si el servicio se cae, el modo en vivo desaparece del menú en
// menos de lo que se tarda en abrir la siguiente pieza, y mientras tanto el reproductor ya sabe
// caer solo a la copia de disco.
let saludCache: { hasta: number; valor: { ok: boolean; libres: number; max: number } | null } | null = null;
const SALUD_MS = 15_000;

export async function vivoSalud(): Promise<{ ok: boolean; libres: number; max: number } | null> {
  if (!vivoConfigurado()) return null;
  const ahora = Date.now();
  if (saludCache && saludCache.hasta > ahora) return saludCache.valor;
  let valor: { ok: boolean; libres: number; max: number } | null = null;
  try {
    const r = await fetch(`${BASE}/salud`, { cache: "no-store", signal: AbortSignal.timeout(2500) });
    if (r.ok) {
      const j = (await r.json()) as { ok?: boolean; enCurso?: number; max?: number };
      const max = Number(j?.max ?? 0);
      const enCurso = Number(j?.enCurso ?? 0);
      if (j?.ok && max > 0) valor = { ok: true, libres: Math.max(0, max - enCurso), max };
    }
  } catch {
    // LabTem apagado, la red caída o tardando de más: no es un error de la app, es que este
    // modo no está disponible ahora. Se guarda el «no» igual que se guardaría un «sí», para no
    // reintentar en bucle mientras dure.
  }
  saludCache = { hasta: ahora + SALUD_MS, valor };
  return valor;
}

// ── Qué se puede hacer con una pieza ───────────────────────────────────────────────────────
// Cuesta un ffprobe al otro lado, así que se recuerda un rato por pieza. La respuesta depende
// solo del archivo, y un archivo de entrega no cambia bajo los pies (si lo reemplazan por SMB,
// cinco minutos de desfase en un menú de calidades no rompen nada: el chorro se pide luego y
// ese sí va contra el archivo de verdad).
const infoCache = new Map<string, { hasta: number; valor: VivoInfo | null }>();
const INFO_MS = 5 * 60_000;
const INFO_MAX = 500; // techo para que un recorrido largo no convierta la memoria en un vertedero

export async function vivoInfo(rel: string): Promise<VivoInfo | null> {
  if (!vivoConfigurado() || !rel) return null;
  const ahora = Date.now();
  const guardado = infoCache.get(rel);
  if (guardado && guardado.hasta > ahora) return guardado.valor;

  let valor: VivoInfo | null = null;
  try {
    const r = await fetch(`${BASE}/info?rel=${encodeURIComponent(rel)}`, {
      headers: { [CABECERA]: SECRETO },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) {
      const j = (await r.json()) as Partial<VivoInfo> & { ok?: boolean };
      if (j?.ok) {
        valor = {
          codec: String(j.codec || ""),
          w: Number(j.w || 0),
          h: Number(j.h || 0),
          duracion: typeof j.duracion === "number" && j.duracion > 0 ? j.duracion : null,
          audio: Boolean(j.audio),
          tasa: typeof j.tasa === "number" && j.tasa > 0 ? j.tasa : null,
          acodec: typeof j.acodec === "string" ? j.acodec : "",
          gpu: Boolean(j.gpu),
          // Se filtra contra NUESTRA lista además de la suya: lo que salga de aquí acaba en un
          // menú y en una URL, y no se hereda la lista de otro proceso sin mirarla.
          calidades: (Array.isArray(j.calidades) ? j.calidades : [])
            .filter((c) => esCalidadViva(Number(c?.calidad)))
            .map((c) => ({
              calidad: Number(c.calidad),
              w: Number(c.w) || 0,
              h: Number(c.h) || 0,
              kbps: Number(c.kbps) || 0,
              codecs: String(c.codecs || ""),
            })),
          libres: Number(j.libres ?? 0),
        };
      }
    }
  } catch {
    /* servicio caído, pieza ilegible o demasiado lenta: sin modo en vivo para esta pieza */
  }
  if (infoCache.size >= INFO_MAX) infoCache.clear();
  infoCache.set(rel, { hasta: ahora + INFO_MS, valor });
  return valor;
}

// ── El chorro ──────────────────────────────────────────────────────────────────────────────
// Devuelve la respuesta de LabTem TAL CUAL para reenviarla. No se lee ni se acumula: el cuerpo
// se pasa como flujo, porque acumularlo significaría esperar a que termine de convertirse el
// vídeo entero antes de mandar el primer byte — justo lo contrario de lo que esto es.
//
// `señal` es la del navegador que pidió el vídeo, y encadenarla es lo que hace que cerrar la
// pestaña MATE el ffmpeg del otro lado. Sin eso la GPU seguiría convirtiendo para nadie y las
// seis plazas se llenarían de fantasmas en una tarde.
export async function vivoChorro(
  rel: string,
  calidad: number,
  desde: number,
  señal?: AbortSignal,
): Promise<Response | null> {
  if (!vivoConfigurado() || !rel || !esCalidadViva(calidad)) return null;
  const segundos = Number.isFinite(desde) && desde > 0 ? Math.floor(desde) : 0;
  const url = `${BASE}/vivo?rel=${encodeURIComponent(rel)}&calidad=${calidad}&desde=${segundos}`;
  try {
    return await fetch(url, { headers: { [CABECERA]: SECRETO }, cache: "no-store", signal: señal });
  } catch {
    return null; // LabTem no contesta: quien llama cae a la copia de disco
  }
}

// ── HLS en vivo (iPhone/iPad) ──────────────────────────────────────────────────────────────
// Safari móvil no trae MediaSource, así que el chorro MP4 de `vivoChorro` allí no existe. Para
// iOS, LabTem genera una lista HLS que crece y sus trozos; aquí solo se reenvía la petición con
// el secreto puesto. `seg` en null pide la LISTA; con nombre, ese trozo.
export async function vivoHls(
  rel: string,
  calidad: number,
  seg: string | null,
  señal?: AbortSignal,
): Promise<Response | null> {
  if (!vivoConfigurado() || !rel || !esCalidadViva(calidad)) return null;
  const base = `${BASE}/hls/${seg ? "trozo" : "lista"}?rel=${encodeURIComponent(rel)}&calidad=${calidad}`;
  const url = seg ? `${base}&seg=${encodeURIComponent(seg)}` : base;
  try {
    return await fetch(url, { headers: { [CABECERA]: SECRETO }, cache: "no-store", signal: señal });
  } catch {
    return null; // LabTem no contesta: el iPhone se queda con el original directo
  }
}

// Las cabeceras que el reproductor necesita de vuelta. Se copian de una LISTA CERRADA en vez de
// reenviar todo lo que venga: lo que llega de otro servicio no se propaga a ciegas al navegador.
const CABECERAS_UTILES = ["x-labtem-vivo", "x-labtem-codecs", "x-labtem-duracion", "x-labtem-desde"];

export function cabecerasVivo(origen: Headers): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const nombre of CABECERAS_UTILES) {
    const v = origen.get(nombre);
    if (v) salida[nombre] = v;
  }
  return salida;
}
