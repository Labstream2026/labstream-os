import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { STORAGE_DIR } from "@/lib/storage";
import { optimizeToWebp } from "@/lib/image";

// ── El fotograma de un vídeo, fabricado por la propia app ──────────────────────
//
// Por qué existe. Un disco con fábrica de copias ligeras (LabTem) ya deja el póster hecho al
// lado de cada pieza y aquí no hay nada que hacer: se lee y punto. Operaciones_LAB NO tiene
// fábrica —su NAS corre un kernel 4.4 sin `i915`, así que la GPU de esa máquina no se puede
// encender— y sus vídeos se quedaban con un icono genérico. Encontrar «ese plano» obligaba a
// abrirlos de uno en uno.
//
// La regla que hace esto barato: **se paga UNA vez por archivo**. El primero que mire la
// carpeta dispara el trabajo; el resultado queda en la caché interna de la app y a partir de
// ahí el NAS no vuelve a leer el vídeo nunca más. Es lo contrario de cargar el disco: hoy cada
// visita a una carpeta de imágenes ya lo lee, y esto añade un trabajo finito, no recurrente.
//
// Cuatro guardas, porque esta máquina ADEMÁS sirve la app al equipo entero:
//
//   1. COLA de 2 en 2. Abrir una carpeta con 40 vídeos no puede lanzar 40 ffmpeg: el NAS se
//      arrodilla y la app deja de responder para todos.
//   2. UNA SOLA vez por pieza aunque la miren tres personas a la vez (deduplicación).
//   3. TOPE DE TIEMPO. Un archivo corrupto o media en un códec que no abre no puede dejar un
//      proceso colgado ocupando un hueco de la cola para siempre.
//   4. MEMORIA DE LOS FALLOS. Un `.braw` no se va a poder abrir hoy ni dentro de una hora;
//      reintentarlo en cada carga de la carpeta es gastar por gusto. El fallo se recuerda, pero
//      CADUCA: un fallo transitorio (matado por el tope de tiempo bajo carga) no condena la
//      pieza para siempre.

const CACHE_DIR = path.join(STORAGE_DIR, "video-poster");

// El binario. Se deja configurable: si algún día esta máquina SÍ tiene un ffmpeg con GPU
// (paquete de Synology montado en el contenedor), cambiar la variable es todo el trabajo.
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";

// Tope de trabajos a la vez. Dos: uno solo desaprovecha los 12 hilos de la máquina en una
// carpeta llena, y más de dos empieza a competir con la app por CPU y por el disco.
const MAX_A_LA_VEZ = 2;
// Tope por intento. Sacar un fotograma con salto por keyframe es cuestión de un segundo o dos
// incluso en 4K; 20 s solo se alcanzan cuando algo va mal, que es justo lo que hay que cortar.
const TOPE_MS = 20_000;
// Segundo del que se saca el fotograma. El 0 suele ser negro o una claqueta; a los 3 s ya hay
// imagen de verdad. Si el clip es más corto, se reintenta desde el principio.
const SEGUNDO = 3;
// Tamaño al que ffmpeg entrega el fotograma antes de que sharp lo termine. Recortar aquí evita
// mover un fotograma 4K entero por la tubería y por la memoria del proceso.
const LADO_INTERMEDIO = 1280;
// Tope de la caché. Un póster pesa ~40 KB: 2 GB son decenas de miles de piezas, muchísimo más
// que todo lo que hay en el disco. El tope está para que un caso raro no llene el NAS, no
// porque se espere llegar.
const TOPE_BYTES = 2 * 1024 * 1024 * 1024;
// Cuánto dura la memoria de un fallo antes de volver a intentarlo.
const FALLO_MS = 24 * 60 * 60_000;

// Lo que ffmpeg puede abrir de verdad. Los formatos de cámara propietarios (BRAW de Blackmagic,
// R3D de RED) necesitan el SDK del fabricante: ffmpeg no los decodifica, así que ni se intenta
// —a esas piezas se les enseña su icono, que es la verdad.
const PUEDE = /\.(mp4|m4v|mov|mkv|avi|mxf|mts|m2ts|webm|mpg|mpeg|wmv|flv|ts)$/i;

export function puedeHacerPoster(name: string): boolean {
  return PUEDE.test(name);
}

// ── La cola ───────────────────────────────────────────────────────────────────
let enCurso = 0;
const esperando: (() => void)[] = [];

async function pedirTurno(): Promise<() => void> {
  if (enCurso >= MAX_A_LA_VEZ) await new Promise<void>((r) => esperando.push(r));
  enCurso++;
  let soltado = false;
  return () => {
    if (soltado) return; // soltar dos veces liberaría un hueco que no existe
    soltado = true;
    enCurso--;
    esperando.shift()?.();
  };
}

// Trabajos en vuelo por clave de caché: tres personas mirando la misma carpeta comparten UN
// ffmpeg en lugar de disparar tres. Igual que la caché de revisiones.
const enVuelo = new Map<string, Promise<Buffer | null>>();

const claveDe = (abs: string, mtimeMs: number, size: number, lado: number) =>
  crypto.createHash("sha1").update(`${abs}|${Math.round(mtimeMs)}|${size}|${lado}`).digest("hex");

const rutaPoster = (clave: string) => path.join(CACHE_DIR, `${clave}.webp`);
const rutaFallo = (clave: string) => path.join(CACHE_DIR, `${clave}.no`);

// ¿Está marcada como imposible, y la marca sigue vigente? Una marca caducada se borra y se
// vuelve a intentar: así un fallo por carga puntual no condena la pieza de por vida.
async function falloVigente(clave: string): Promise<boolean> {
  try {
    const st = await fs.stat(rutaFallo(clave));
    if (Date.now() - st.mtimeMs < FALLO_MS) return true;
    await fs.rm(rutaFallo(clave), { force: true });
  } catch {
    /* no hay marca: adelante */
  }
  return false;
}

// Un intento de ffmpeg. Devuelve el JPEG del fotograma, o null si no salió nada.
function sacarFotograma(abs: string, desde: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const args = [
      "-hide_banner",
      "-loglevel", "error",
      "-nostdin",
      // -ss ANTES de -i: salto por keyframe, sin decodificar lo que hay delante. Puesto
      // después obligaría a decodificar el vídeo entero hasta ese punto.
      ...(desde > 0 ? ["-ss", String(desde)] : []),
      "-i", abs,
      "-frames:v", "1",
      "-vf", `scale=w=${LADO_INTERMEDIO}:h=${LADO_INTERMEDIO}:force_original_aspect_ratio=decrease`,
      "-f", "image2",
      "-c:v", "mjpeg",
      "-q:v", "3",
      "pipe:1",
    ];
    const p = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "ignore"] });
    const trozos: Buffer[] = [];
    let cerrado = false;
    const corte = setTimeout(() => {
      cerrado = true;
      p.kill("SIGKILL");
      resolve(null);
    }, TOPE_MS);

    p.stdout.on("data", (d: Buffer) => trozos.push(d));
    p.on("error", () => {
      clearTimeout(corte);
      if (!cerrado) {
        cerrado = true;
        resolve(null); // no está ffmpeg en la imagen, o no se pudo lanzar
      }
    });
    p.on("close", () => {
      clearTimeout(corte);
      if (cerrado) return;
      cerrado = true;
      const buf = Buffer.concat(trozos);
      resolve(buf.length > 0 ? buf : null);
    });
  });
}

async function fabricar(abs: string, clave: string, maxEdge: number): Promise<Buffer | null> {
  const soltar = await pedirTurno();
  try {
    // A los 3 s primero; si el clip es más corto no sale nada y se reintenta desde el inicio.
    const jpeg = (await sacarFotograma(abs, SEGUNDO)) ?? (await sacarFotograma(abs, 0));
    if (!jpeg) return null;
    const webp = await optimizeToWebp(jpeg, { maxEdge });
    if (!webp) return null;
    await fs.mkdir(CACHE_DIR, { recursive: true });
    // Escritura atómica: un archivo a medias en la caché se serviría como imagen rota. Se
    // escribe al lado y se renombra, que en el mismo sistema de archivos es instantáneo.
    const tmp = `${rutaPoster(clave)}.${process.pid}.tmp`;
    await fs.writeFile(tmp, webp);
    await fs.rename(tmp, rutaPoster(clave));
    void podar().catch(() => {});
    return webp;
  } finally {
    soltar();
  }
}

// El fotograma de un vídeo, de la caché o recién hecho. null cuando no se puede (formato que
// ffmpeg no abre, archivo corrupto, o ffmpeg ausente de la imagen). NO lanza.
export async function posterDeVideo(
  abs: string,
  st: { mtimeMs: number; size: number },
  maxEdge = 640,
): Promise<Buffer | null> {
  const clave = claveDe(abs, st.mtimeMs, st.size, maxEdge);
  try {
    return await fs.readFile(rutaPoster(clave));
  } catch {
    /* aún no está en la caché */
  }
  if (await falloVigente(clave)) return null;

  // Apuntarse en el mapa tiene que ocurrir en el mismo tic que la comprobación, o dos visitas
  // simultáneas pasan las dos y lanzan dos ffmpeg del mismo archivo.
  const yaVa = enVuelo.get(clave);
  if (yaVa) return yaVa;

  const trabajo = fabricar(abs, clave, maxEdge)
    .catch(() => null)
    .then(async (webp) => {
      if (!webp) {
        // Marca de imposible, para no reintentarlo en cada carga de la carpeta.
        await fs.mkdir(CACHE_DIR, { recursive: true }).catch(() => {});
        await fs.writeFile(rutaFallo(clave), "").catch(() => {});
      }
      return webp;
    })
    .finally(() => enVuelo.delete(clave));

  enVuelo.set(clave, trabajo);
  return trabajo;
}

// ── Poda ──────────────────────────────────────────────────────────────────────
// No se hace en cada escritura (leer la carpeta entera por cada póster sería peor que el
// problema): se comprueba cada tantos archivos nuevos.
let desdeLaUltimaPoda = 0;
const CADA = 200;

async function podar(): Promise<void> {
  if (++desdeLaUltimaPoda < CADA) return;
  desdeLaUltimaPoda = 0;
  const nombres = await fs.readdir(CACHE_DIR).catch(() => [] as string[]);
  const items: { ruta: string; size: number; atimeMs: number }[] = [];
  for (const n of nombres) {
    if (!n.endsWith(".webp")) continue;
    const ruta = path.join(CACHE_DIR, n);
    try {
      const st = await fs.stat(ruta);
      items.push({ ruta, size: st.size, atimeMs: st.atimeMs });
    } catch {
      /* desapareció entre readdir y stat */
    }
  }
  let total = items.reduce((s, e) => s + e.size, 0);
  if (total <= TOPE_BYTES) return;
  items.sort((a, b) => a.atimeMs - b.atimeMs); // el menos mirado, primero
  for (const e of items) {
    if (total <= TOPE_BYTES) break;
    await fs.rm(e.ruta, { force: true }).catch(() => {});
    total -= e.size;
  }
}

// Cuánto ocupa esto, para Ajustes → Mantenimiento. Sin el número, decidir si el tope se queda
// corto es adivinar, y llenar el NAS tumba mucho más que unas miniaturas.
export async function videoPosterStats(): Promise<{ posters: number; fallos: number; bytes: number; tope: number }> {
  let posters = 0;
  let fallos = 0;
  let bytes = 0;
  const nombres = await fs.readdir(CACHE_DIR).catch(() => [] as string[]);
  for (const n of nombres) {
    if (n.endsWith(".no")) {
      fallos++;
      continue;
    }
    if (!n.endsWith(".webp")) continue;
    try {
      bytes += (await fs.stat(path.join(CACHE_DIR, n))).size;
      posters++;
    } catch {
      /* desapareció entre readdir y stat */
    }
  }
  return { posters, fallos, bytes, tope: TOPE_BYTES };
}
