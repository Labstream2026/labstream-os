import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { STORAGE_DIR } from "@/lib/storage";
import { optimizeToWebp } from "@/lib/image";
import { unpackCascade, runCascade, clusterDetections, type ClasificarRegion } from "@/lib/vendor/pico/pico";

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
// ahí el NAS no vuelve a leer el vídeo nunca más.
//
// EL CASTING. Sacar «el fotograma del segundo 3» daba pósters sin sentido: el parpadeo, el
// gesto a medias, la espalda. Ahora se reparten VARIOS candidatos por todo el vídeo y gana
// el que sume más: cara (pico, el detector en JS puro de vendor/pico — en material de busto
// parlante la cara ES el póster), nitidez (varianza del laplaciano: castiga el barrido y el
// desenfoque) y exposición (ni negro ni quemado). La misma idea corre en la fábrica de
// LabTem con pigo; si cambia el criterio allí, cambiarlo aquí.
//
// Cuatro guardas, porque esta máquina ADEMÁS sirve la app al equipo entero:
//
//   1. COLA de 2 en 2. Abrir una carpeta con 40 vídeos no puede lanzar 40 ffmpeg.
//   2. UNA SOLA vez por pieza aunque la miren tres personas a la vez (deduplicación).
//   3. TOPE DE TIEMPO por intento. Un archivo corrupto no ocupa un hueco de la cola.
//   4. MEMORIA DE LOS FALLOS, que CADUCA: un fallo transitorio no condena la pieza.

const CACHE_DIR = path.join(STORAGE_DIR, "video-poster");

// Los binarios. Configurables: si algún día esta máquina tiene un ffmpeg con GPU, cambiar
// la variable es todo el trabajo.
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";
const FFPROBE = process.env.FFPROBE_BIN || "ffprobe";

// Tope de trabajos a la vez. Dos: uno solo desaprovecha los 12 hilos de la máquina en una
// carpeta llena, y más de dos empieza a competir con la app por CPU y por el disco.
const MAX_A_LA_VEZ = 2;
// Tope por intento de ffmpeg. Un candidato del casting merece menos paciencia que la toma
// única de emergencia: si una zona no sale, quedan siete más.
const TOPE_MS = 20_000;
const TOPE_CANDIDATO_MS = 15_000;
// Cuántos candidatos y en qué tramo. Del 10 % al 87 % de la duración: ni la claqueta del
// arranque ni el fundido del final. Mismos números que la fábrica de LabTem.
const CANDIDATOS = 8;
// Por debajo de esta duración no hay dónde repartir candidatos: toma única de siempre.
const CASTING_MIN_SEG = 8;
// Una cara de menos del 9 % del alto es un figurante al fondo, no el sujeto.
const CARA_MIN = 0.09;
// Segundo de la toma única (clips cortos): el 0 suele ser negro o claqueta.
const SEGUNDO = 3;
// Tamaño al que ffmpeg entrega el fotograma antes de que sharp lo termine.
const LADO_INTERMEDIO = 1280;
// Tope de la caché (~40 KB por póster: décadas de margen; el tope es un seguro, no un plan).
const TOPE_BYTES = 2 * 1024 * 1024 * 1024;
// Cuánto dura la memoria de un fallo antes de volver a intentarlo.
const FALLO_MS = 24 * 60 * 60_000;

// Lo que ffmpeg puede abrir de verdad. Los formatos de cámara propietarios (BRAW, R3D)
// necesitan el SDK del fabricante: ni se intenta — a esas piezas se les enseña su icono.
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
// casting en lugar de disparar tres.
const enVuelo = new Map<string, Promise<Buffer | null>>();

// «c2» es la versión del algoritmo: al pasar de la toma única al casting cambió el contenido
// sin cambiar el archivo, y sin esto los pósters viejos de la caché taparían los nuevos.
const claveDe = (abs: string, mtimeMs: number, size: number, lado: number) =>
  crypto.createHash("sha1").update(`c2|${abs}|${Math.round(mtimeMs)}|${size}|${lado}`).digest("hex");

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

// ── El detector de caras ──────────────────────────────────────────────────────
// La cascada se carga UNA vez por proceso. Sin ella (archivo ausente, build rara) el casting
// sigue con nitidez y exposición: menos fino, nunca roto.
let clasificadorProm: Promise<ClasificarRegion | null> | null = null;
function clasificador(): Promise<ClasificarRegion | null> {
  if (!clasificadorProm) {
    clasificadorProm = fs
      .readFile(path.join(process.cwd(), "src", "lib", "vendor", "pico", "facefinder"))
      .then((b) => unpackCascade(new Uint8Array(b)))
      .catch(() => null);
  }
  return clasificadorProm;
}

// ── Un intento de ffmpeg ──────────────────────────────────────────────────────
// `zona=true` es el modo casting: `thumbnail=12` elige el fotograma más representativo de
// su zona, esquivando el barrido de cámara antes de puntuar nada.
function sacarFotograma(abs: string, desde: number, zona = false): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const filtro = `${zona ? "thumbnail=12," : ""}scale=w=${LADO_INTERMEDIO}:h=${LADO_INTERMEDIO}:force_original_aspect_ratio=decrease`;
    const args = [
      "-hide_banner",
      "-loglevel", "error",
      "-nostdin",
      // -ss ANTES de -i: salto por keyframe, sin decodificar lo que hay delante.
      ...(desde > 0 ? ["-ss", String(desde)] : []),
      "-i", abs,
      "-an", "-sn", "-dn",
      "-frames:v", "1",
      "-vf", filtro,
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
    }, zona ? TOPE_CANDIDATO_MS : TOPE_MS);

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

// Duración en segundos, o null si ffprobe no sabe decirla.
function duracionDe(abs: string): Promise<number | null> {
  return new Promise((resolve) => {
    const p = spawn(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", abs], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let salida = "";
    let cerrado = false;
    const corte = setTimeout(() => {
      cerrado = true;
      p.kill("SIGKILL");
      resolve(null);
    }, 10_000);
    p.stdout.on("data", (d: Buffer) => (salida += d.toString()));
    p.on("error", () => {
      clearTimeout(corte);
      if (!cerrado) {
        cerrado = true;
        resolve(null);
      }
    });
    p.on("close", () => {
      clearTimeout(corte);
      if (cerrado) return;
      cerrado = true;
      const d = parseFloat(salida.trim());
      resolve(Number.isFinite(d) && d > 0 ? d : null);
    });
  });
}

// ── El jurado ─────────────────────────────────────────────────────────────────
// Puntúa un candidato con tres señales sobre la MISMA imagen en gris (≤480 px):
//   · cara — manda sobre todo lo demás; entre caras, la más grande.
//   · nitidez — varianza del laplaciano; castiga desenfoque y barrido.
//   · exposición — la media de luz lejos del negro y del quemado.
async function puntuar(jpeg: Buffer): Promise<number> {
  try {
    const { data, info } = await sharp(jpeg)
      .resize(480, 480, { fit: "inside" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;

    // Nitidez y luz en una sola pasada.
    let suma = 0;
    let lap = 0;
    let lap2 = 0;
    let n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        suma += data[i];
        const v = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w];
        lap += v;
        lap2 += v * v;
        n++;
      }
    }
    if (n === 0) return 0;
    const media = suma / n;
    const nitidez = lap2 / n - (lap / n) ** 2;
    const luz = 1 - Math.abs(media - 118) / 118; // 1 = bien expuesto; 0 = negro o quemado

    // La cara. q≥5 es el mismo listón que usa pigo en LabTem.
    let cara = 0;
    const clas = await clasificador();
    if (clas) {
      const dets = clusterDetections(
        runCascade({ pixels: data, nrows: h, ncols: w, ldim: w }, clas, {
          shiftfactor: 0.1,
          minsize: Math.max(30, Math.round(h * CARA_MIN)),
          maxsize: Math.min(h, w),
          scalefactor: 1.1,
        }),
        0.2,
      );
      for (const [, , s, q] of dets) {
        if (q >= 5 && s >= h * CARA_MIN && s > cara) cara = s;
      }
      cara = cara / h;
    }

    // Cara manda (10 000 la separa de cualquier suma de las otras dos); entre caras gana la
    // grande, y a igual cara deciden nitidez y luz.
    return (cara > 0 ? 10_000 + cara * 1_000 : 0) + Math.log1p(Math.max(0, nitidez)) * 10 + luz * 20;
  } catch {
    return 0; // un candidato impuntuable simplemente no gana
  }
}

async function fabricar(abs: string, clave: string, maxEdge: number): Promise<Buffer | null> {
  const soltar = await pedirTurno();
  try {
    // El casting: candidatos repartidos por todo el vídeo, gana el de mejor puntaje.
    let jpeg: Buffer | null = null;
    const dur = await duracionDe(abs);
    if (dur && dur >= CASTING_MIN_SEG) {
      let mejor: { jpeg: Buffer; puntos: number } | null = null;
      for (let i = 0; i < CANDIDATOS; i++) {
        const t = dur * (0.1 + (0.77 * i) / (CANDIDATOS - 1));
        const cand = await sacarFotograma(abs, t, true);
        if (!cand) continue;
        const puntos = await puntuar(cand);
        if (!mejor || puntos > mejor.puntos) mejor = { jpeg: cand, puntos };
      }
      jpeg = mejor?.jpeg ?? null;
    }
    // Clip corto, sin duración legible o casting vacío: la toma única de siempre.
    jpeg = jpeg ?? (await sacarFotograma(abs, SEGUNDO)) ?? (await sacarFotograma(abs, 0));
    if (!jpeg) return null;

    const webp = await optimizeToWebp(jpeg, { maxEdge });
    if (!webp) return null;
    await fs.mkdir(CACHE_DIR, { recursive: true });
    // Escritura atómica: un archivo a medias en la caché se serviría como imagen rota.
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
  // simultáneas pasan las dos y lanzan dos castings del mismo archivo.
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
