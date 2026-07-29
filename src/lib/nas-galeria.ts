import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { readBuffer, writeRelBuffer } from "@/lib/storage";
import { optimizeToWebp } from "@/lib/image";

// ── Entregas_LAB: la carpeta compartida de LabTem (el segundo NAS) montada DENTRO del
// contenedor (bind mount → NAS_GALERIA_DIR). Para la app es una carpeta local más: sin SMB
// ni credenciales. Este módulo es el ÚNICO que toca ese disco.
//
// Es el gemelo de `nas-ops.ts` pero con otro trabajo: aquí no se explora un árbol, se arma
// una LÍNEA DE TIEMPO del material que se le entrega a un cliente (fotos y video ordenados
// por fecha, como Fotos de Apple). Por eso lee en profundidad y agrupa por día y mes.
//
// Principios (los mismos que Operaciones, por las mismas razones):
//  - Sin NAS_GALERIA_DIR el módulo entero queda apagado: el Mac de desarrollo y un deploy sin
//    el montaje no rompen nada, la sección simplemente no aparece.
//  - Se lee EN VIVO del disco. No hay índice en BD que se desincronice cuando el equipo
//    mueve archivos por SMB.
//  - ESCRITURA (decisión revisada 2026-07-30): la app SÍ escribe, pero acotada y reversible.
//    El módulo nació de solo lectura («material entregable, se toca solo desde el NAS»); el
//    flujo real del equipo pide lo contrario: subir material, crear la carpeta del cliente y
//    atar entregables a archivos del disco. Las guardas que sustituyen a la prohibición:
//    permiso `escribir_discos` + centinela ESCRITURA_SENTINEL en la raíz (sin él, ni un byte:
//    distingue el disco real de la carpeta local vacía que queda si el montaje NFS se cae),
//    nunca sobreescribir (nombre (2)), escribir a temporal y renombrar (nada a medias con
//    nombre bueno), y borrar = mover a #recycle (recuperable desde DSM).
//  - Se filtra la basura de Synology/macOS/Windows.
//
// LabTem sirve los ORIGINALES. Las copias ligeras que fabrica su GPU viven aparte (carpeta
// `.proxy` dentro de cada carpeta de entrega) y se sirven igual que el original, por nuestro
// propio origen. Ver `proxyRelFor`.

export const GALERIA_DIR = process.env.NAS_GALERIA_DIR || "";

export function galeriaEnabled(): boolean {
  return Boolean(GALERIA_DIR);
}

// ¿Está montada Y accesible? El montaje puede faltar aunque la variable exista (NAS apagado,
// bind mount mal puesto). Se comprueba antes de mostrar la sección.
export async function galeriaReady(): Promise<boolean> {
  if (!GALERIA_DIR) return false;
  try {
    return (await fs.stat(GALERIA_DIR)).isDirectory();
  } catch {
    return false;
  }
}

// ── Rutas seguras ──────────────────────────────────────────────────────────────

const JUNK = new Set([
  "@eaDir",
  "#recycle",
  "#snapshot",
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
  ".SynologyWorkingDirectory",
  "@tmp",
]);

// La carpeta de copias ligeras no se lista como material: es interna.
export const PROXY_DIR_NAME = ".proxy";

export function isJunkName(name: string): boolean {
  return JUNK.has(name) || name.startsWith("._") || name.startsWith(".");
}

// Normaliza una ruta relativa dentro de Entregas_LAB. Rechaza traversal, absolutas,
// backslashes y segmentos de control. "" = la raíz.
export function normalizeGaleriaRel(rel: string): string {
  const clean = String(rel || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!clean) return "";
  const parts = clean.split("/").filter(Boolean);
  for (const p of parts) {
    if (p === "." || p === ".." || /[\u0000-\u001f]/.test(p)) throw new Error("ruta inválida");
  }
  return parts.join("/");
}

// Ruta absoluta con guardas: dentro de la raíz y sin enlaces simbólicos que escapen
// (se compara el realpath del ancestro existente más profundo contra el realpath de la raíz).
export async function galeriaAbs(rel: string): Promise<string> {
  if (!GALERIA_DIR) throw new Error("Entregas_LAB no está configurado");
  const norm = normalizeGaleriaRel(rel);
  const root = path.resolve(GALERIA_DIR);
  const full = path.resolve(root, norm);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("ruta inválida");
  const rootReal = await fs.realpath(root);
  let probe = full;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      if (real !== rootReal && !real.startsWith(rootReal + path.sep)) throw new Error("ruta inválida");
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        const parent = path.dirname(probe);
        if (parent === probe) break;
        probe = parent;
        continue;
      }
      throw e;
    }
  }
  return full;
}

// ── Qué es cada archivo ────────────────────────────────────────────────────────

const PHOTO_EXT = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif", "heic", "heif", "tif", "tiff", "bmp", "dng", "cr2", "cr3", "nef", "arw", "raf", "orf", "rw2"]);
// Contenedores que el navegador puede NO decodificar (mkv, mxf, mts…) igual son VIDEO: el
// cliente verá la copia ligera, y el original se descarga. Mismo criterio que en revisión.
const VIDEO_EXT = new Set(["mp4", "m4v", "mov", "webm", "mkv", "avi", "wmv", "mts", "m2ts", "mxf", "mpg", "mpeg", "ogv", "prores", "braw", "r3d"]);

// Formatos que el navegador SÍ pinta directamente. El resto necesita copia ligera para verse
// (un DNG o un MXF no se abren en un <img>/<video>).
const WEB_PHOTO = new Set(["jpg", "jpeg", "png", "webp", "avif", "gif"]);
const WEB_VIDEO = new Set(["mp4", "m4v", "webm", "mov"]);

export type GaleriaKind = "photo" | "video";

export function galeriaKind(name: string): GaleriaKind | null {
  const ext = extOf(name);
  if (PHOTO_EXT.has(ext)) return "photo";
  if (VIDEO_EXT.has(ext)) return "video";
  return null;
}

function extOf(name: string): string {
  return (name.split(".").pop() || "").toLowerCase();
}

// ¿El navegador puede con el original, o hace falta la copia ligera para verlo?
export function needsProxy(name: string): boolean {
  const ext = extOf(name);
  if (WEB_PHOTO.has(ext)) return false;
  if (WEB_VIDEO.has(ext)) return false;
  return true;
}

// Dónde vive la copia ligera de una pieza: hermana suya, dentro de `.proxy`.
// `foto.dng` → `.proxy/foto.dng.webp`   ·   `toma.mxf` → `.proxy/toma.mxf.mp4`
export function proxyRelFor(rel: string, kind: GaleriaKind): string {
  const dir = path.posix.dirname(rel);
  const base = path.posix.basename(rel);
  const suffix = kind === "photo" ? ".webp" : ".mp4";
  return dir === "." ? `${PROXY_DIR_NAME}/${base}${suffix}` : `${dir}/${PROXY_DIR_NAME}/${base}${suffix}`;
}

// El póster de un video (el fotograma que se ve en la cuadrícula) también lo fabrica LabTem:
// la app ya no lleva ffmpeg dentro, así que un video sin póster sale con marcador y su nombre.
// `toma.mxf` → `.proxy/toma.mxf.poster.jpg`
export function posterRelFor(rel: string): string {
  const dir = path.posix.dirname(rel);
  const base = path.posix.basename(rel);
  return dir === "." ? `${PROXY_DIR_NAME}/${base}.poster.jpg` : `${dir}/${PROXY_DIR_NAME}/${base}.poster.jpg`;
}

// ── Fecha de la pieza ──────────────────────────────────────────────────────────

// Lee `DateTimeOriginal` (0x9003) del EXIF de un JPEG sin dependencias: se leen los primeros
// bytes, se busca el segmento APP1 «Exif\0\0», y de ahí el IFD0 → puntero al IFD Exif → tag.
// Si algo no cuadra devuelve null y el llamador cae a la fecha del archivo.
//
// Importa de verdad: la fecha del archivo cambia al copiarlo entre discos, la del disparo no.
// Una galería ordenada por fecha de copia le enseña al cliente un orden que no significa nada.
const EXIF_HEAD_BYTES = 128 * 1024;

export async function exifTakenAt(abs: string): Promise<Date | null> {
  let fh: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    fh = await fs.open(abs, "r");
    const buf = Buffer.alloc(EXIF_HEAD_BYTES);
    const { bytesRead } = await fh.read(buf, 0, EXIF_HEAD_BYTES, 0);
    return parseExifDate(buf.subarray(0, bytesRead));
  } catch {
    return null;
  } finally {
    await fh?.close().catch(() => {});
  }
}

export function parseExifDate(buf: Buffer): Date | null {
  if (buf.length < 12 || buf.readUInt16BE(0) !== 0xffd8) return null; // no es JPEG

  // Recorre los segmentos hasta encontrar APP1 con cabecera Exif.
  let off = 2;
  let tiff = -1;
  while (off + 4 <= buf.length) {
    if (buf[off] !== 0xff) break;
    const marker = buf[off + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // empieza la imagen: ya no hay metadatos
    const len = buf.readUInt16BE(off + 2);
    if (len < 2) break;
    if (marker === 0xe1 && off + 4 + 6 <= buf.length && buf.toString("ascii", off + 4, off + 10) === "Exif\0\0") {
      tiff = off + 10;
      break;
    }
    off += 2 + len;
  }
  if (tiff < 0 || tiff + 8 > buf.length) return null;

  // Cabecera TIFF: «II» little-endian o «MM» big-endian.
  const order = buf.toString("ascii", tiff, tiff + 2);
  if (order !== "II" && order !== "MM") return null;
  const le = order === "II";
  const u16 = (p: number) => (le ? buf.readUInt16LE(p) : buf.readUInt16BE(p));
  const u32 = (p: number) => (le ? buf.readUInt32LE(p) : buf.readUInt32BE(p));
  if (u16(tiff + 2) !== 42) return null;

  const readAscii = (p: number, count: number) => {
    // Los valores de más de 4 bytes viven fuera del campo, apuntados por un offset.
    const valOff = count > 4 ? tiff + u32(p + 8) : p + 8;
    if (valOff < 0 || valOff + count > buf.length) return null;
    return buf.toString("ascii", valOff, valOff + count).replace(/\0.*$/, "");
  };

  // Recorre un IFD buscando tags; devuelve el offset del IFD Exif si lo encuentra.
  const scanIfd = (ifdOff: number): { date: string | null; exifPtr: number } => {
    let date: string | null = null;
    let exifPtr = 0;
    if (ifdOff + 2 > buf.length) return { date, exifPtr };
    const n = u16(ifdOff);
    for (let i = 0; i < n; i++) {
      const p = ifdOff + 2 + i * 12;
      if (p + 12 > buf.length) break;
      const tag = u16(p);
      const count = u32(p + 4);
      // 0x9003 DateTimeOriginal · 0x9004 DateTimeDigitized · 0x0132 DateTime (menos fiable)
      if (tag === 0x9003 || tag === 0x9004 || (tag === 0x0132 && !date)) {
        const s = readAscii(p, Math.min(count, 32));
        if (s && (tag === 0x9003 || !date)) date = s;
      }
      if (tag === 0x8769) exifPtr = tiff + u32(p + 8); // puntero al sub-IFD Exif
    }
    return { date, exifPtr };
  };

  const ifd0 = scanIfd(tiff + u32(tiff + 4));
  let raw = ifd0.date;
  if (ifd0.exifPtr > 0) {
    const sub = scanIfd(ifd0.exifPtr);
    if (sub.date) raw = sub.date; // DateTimeOriginal del sub-IFD manda sobre el DateTime de IFD0
  }
  if (!raw) return null;

  // Formato EXIF: «YYYY:MM:DD HH:MM:SS», en hora local de la cámara (sin zona).
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi, S] = m;
  const d = new Date(Number(Y), Number(Mo) - 1, Number(D), Number(H), Number(Mi), Number(S));
  if (Number.isNaN(d.getTime()) || Number(Y) < 1970 || Number(Y) > 2200) return null;
  return d;
}

// ── Escaneo y línea de tiempo ──────────────────────────────────────────────────

export type GaleriaItem = {
  rel: string; // ruta relativa dentro de Entregas_LAB
  name: string;
  kind: GaleriaKind;
  size: number;
  ext: string;
  takenAt: string; // ISO. Fecha de disparo si la hubo, si no la del archivo.
  exact: boolean; // true = salió del EXIF; false = es la fecha del archivo (aproximada)
  needsProxy: boolean;
  proxyRel: string;
};

export type GaleriaDay = { date: string; items: GaleriaItem[] };
export type GaleriaMonth = { month: string; label: string; count: number; days: GaleriaDay[] };

export type GaleriaScan = {
  months: GaleriaMonth[];
  total: number;
  photos: number;
  videos: number;
  bytes: number;
  truncated: boolean;
};

const MAX_ITEMS = 20000;
const MAX_DEPTH = 8;
// El EXIF se lee archivo por archivo: en carpetas enormes es el cuello de botella. Se limita
// para que un primer pintado nunca tarde de más; el resto cae a la fecha del archivo.
const MAX_EXIF_READS = 4000;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Recorre la carpeta en profundidad y devuelve la línea de tiempo: meses de más nuevo a más
// viejo, y dentro de cada mes los días igual. Es lo que pinta la galería del cliente.
export async function scanGaleria(rel = ""): Promise<GaleriaScan> {
  const norm = normalizeGaleriaRel(rel);
  const rootAbs = await galeriaAbs(norm);

  const items: GaleriaItem[] = [];
  let bytes = 0;
  let truncated = false;
  let exifBudget = MAX_EXIF_READS;

  const walk = async (dirAbs: string, dirRel: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH || truncated) return;
    // Carpeta ilegible: se omite en vez de tumbar el escaneo entero.
    const raw = await fs.readdir(dirAbs, { withFileTypes: true }).catch(() => null);
    if (!raw) return;
    for (const d of raw) {
      if (truncated) return;
      if (isJunkName(d.name)) continue; // incluye .proxy, que es interna
      const childRel = dirRel ? `${dirRel}/${d.name}` : d.name;
      const childAbs = path.join(dirAbs, d.name);
      if (d.isDirectory()) {
        await walk(childAbs, childRel, depth + 1);
        continue;
      }
      if (!d.isFile()) continue; // symlinks y demás: no se puede garantizar dónde apuntan
      const kind = galeriaKind(d.name);
      if (!kind) continue;
      if (items.length >= MAX_ITEMS) {
        truncated = true;
        return;
      }
      // Si desapareció entre readdir y stat, se omite.
      const st = await fs.stat(childAbs).catch(() => null);
      if (!st) continue;
      let takenAt = new Date(st.mtimeMs);
      let exact = false;
      if (kind === "photo" && exifBudget > 0) {
        exifBudget--;
        const ex = await exifTakenAt(childAbs);
        if (ex) {
          takenAt = ex;
          exact = true;
        }
      }
      bytes += st.size;
      items.push({
        rel: childRel,
        name: d.name,
        kind,
        size: st.size,
        ext: extOf(d.name),
        takenAt: takenAt.toISOString(),
        exact,
        needsProxy: needsProxy(d.name),
        proxyRel: proxyRelFor(childRel, kind),
      });
    }
  };

  await walk(rootAbs, norm, 0);

  // Agrupa por día y por mes. Lo más nuevo primero, que es lo que el cliente quiere ver.
  items.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const byDay = new Map<string, GaleriaItem[]>();
  for (const it of items) {
    const key = ymd(new Date(it.takenAt));
    const arr = byDay.get(key);
    if (arr) arr.push(it);
    else byDay.set(key, [it]);
  }
  const byMonth = new Map<string, GaleriaDay[]>();
  for (const [date, its] of byDay) {
    const key = date.slice(0, 7);
    const arr = byMonth.get(key);
    if (arr) arr.push({ date, items: its });
    else byMonth.set(key, [{ date, items: its }]);
  }
  const months: GaleriaMonth[] = [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, days]) => {
      const [y, m] = month.split("-");
      return {
        month,
        label: `${MESES[Number(m) - 1]} de ${y}`,
        count: days.reduce((n, d) => n + d.items.length, 0),
        days: days.sort((a, b) => b.date.localeCompare(a.date)),
      };
    });

  return {
    months,
    total: items.length,
    photos: items.filter((i) => i.kind === "photo").length,
    videos: items.filter((i) => i.kind === "video").length,
    bytes,
    truncated,
  };
}

// Carpetas de primer nivel = una por entrega. Es lo que se ve al abrir la sección: el equipo
// elige de qué entrega quiere ver la línea de tiempo, en vez de escanear 7 TB de golpe.
export type GaleriaFolder = { rel: string; name: string; mtimeMs: number };

export async function listGaleriaFolders(rel = ""): Promise<GaleriaFolder[]> {
  const norm = normalizeGaleriaRel(rel);
  const abs = await galeriaAbs(norm);
  const raw = await fs.readdir(abs, { withFileTypes: true }).catch(() => null);
  if (!raw) return [];
  const out: GaleriaFolder[] = [];
  for (const d of raw) {
    if (!d.isDirectory() || isJunkName(d.name)) continue;
    const childRel = norm ? `${norm}/${d.name}` : d.name;
    const st = await fs.stat(path.join(abs, d.name)).catch(() => null);
    out.push({ rel: childRel, name: d.name, mtimeMs: st?.mtimeMs ?? 0 });
  }
  // Lo más reciente primero: la entrega en la que se está trabajando suele ser la última.
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

// ── Servir un archivo ──────────────────────────────────────────────────────────

export type GaleriaFileInfo = { abs: string; size: number; mtimeMs: number; name: string };

// Resuelve una pieza para servirla. `preferProxy` devuelve la copia ligera si existe; si no
// existe (todavía no la ha fabricado LabTem) cae al original, que siempre está.
export async function resolveGaleriaFile(rel: string, preferProxy = false): Promise<GaleriaFileInfo | null> {
  const norm = normalizeGaleriaRel(rel);
  if (!norm) return null;
  const kind = galeriaKind(norm.split("/").pop() || "");
  if (!kind) return null;

  if (preferProxy) {
    try {
      const pRel = proxyRelFor(norm, kind);
      const pAbs = await galeriaAbs(pRel);
      const st = await fs.stat(pAbs);
      if (st.isFile()) return { abs: pAbs, size: st.size, mtimeMs: st.mtimeMs, name: path.basename(pRel) };
    } catch {
      /* sin copia ligera: se sirve el original */
    }
  }

  try {
    const abs = await galeriaAbs(norm);
    const st = await fs.stat(abs);
    if (!st.isFile()) return null;
    return { abs, size: st.size, mtimeMs: st.mtimeMs, name: path.basename(norm) };
  } catch {
    return null;
  }
}

// ── Miniatura para la cuadrícula ───────────────────────────────────────────────

// De qué archivo se saca la miniatura de una pieza:
//  - foto que el navegador entiende → el original
//  - foto que no (DNG, CR2, HEIC…)  → la copia ligera .webp que hizo LabTem
//  - video                           → el póster .jpg que hizo LabTem
// Si el archivo elegido todavía no existe, no hay miniatura: la cuadrícula pinta el hueco
// «preparando» en vez de una imagen rota.
function thumbSourceRel(rel: string, kind: GaleriaKind): string {
  if (kind === "video") return posterRelFor(rel);
  return needsProxy(rel) ? proxyRelFor(rel, "photo") : rel;
}

// Miniatura WebP, cacheada en el storage interno de la app (NUNCA se escribe en LabTem: esa
// carpeta es material entregable y se monta en solo lectura). La clave de caché lleva mtime y
// tamaño, así que si alguien reemplaza el archivo por SMB la miniatura se regenera sola.
export async function galeriaThumb(rel: string, maxEdge = 640): Promise<Buffer | null> {
  const norm = normalizeGaleriaRel(rel);
  const kind = galeriaKind(norm.split("/").pop() || "");
  if (!kind) return null;

  const srcRel = thumbSourceRel(norm, kind);
  let abs: string;
  let st: Awaited<ReturnType<typeof fs.stat>>;
  try {
    abs = await galeriaAbs(srcRel);
    st = await fs.stat(abs);
    if (!st.isFile()) return null;
  } catch {
    return null; // todavía no hay copia ni póster
  }

  const key = crypto.createHash("sha1").update(srcRel).digest("hex");
  const cacheRel = `galeria-cache/${key}-${Math.round(st.mtimeMs)}-${st.size}-${maxEdge}.webp`;
  try {
    return await readBuffer(cacheRel);
  } catch {
    /* aún no cacheada */
  }

  let buf: Buffer;
  try {
    buf = await fs.readFile(abs);
  } catch {
    return null;
  }
  const webp = await optimizeToWebp(buf, { maxEdge });
  if (!webp) return null; // sharp no supo con este formato: sin miniatura, sin romper nada
  await writeRelBuffer(cacheRel, webp).catch(() => {});
  return webp;
}

// ── Escribir (acotado; ver el encabezado del módulo) ───────────────────────────

// Centinela creado A MANO una sola vez en la raíz de la share real de LabTem. Doble trabajo:
// autoriza la escritura desde la app Y distingue «disco montado» de «el montaje NFS se cayó y
// esto es la carpeta local vacía de debajo» — escribir ahí sería tragarse material en un
// directorio que nadie mira. Sin centinela: solo lectura, como siempre.
export const ESCRITURA_SENTINEL = ".labstream-escritura";

export async function galeriaWritable(): Promise<boolean> {
  if (!GALERIA_DIR) return false;
  try {
    return (await fs.stat(path.join(path.resolve(GALERIA_DIR), ESCRITURA_SENTINEL))).isFile();
  } catch {
    return false;
  }
}

async function assertGaleriaEscritura(): Promise<void> {
  if (!GALERIA_DIR) throw new Error("La galería no está configurada en este servidor.");
  if (!(await galeriaReady())) throw new Error("El disco de la galería no responde (¿LabTem apagado o el montaje caído?).");
  if (!(await galeriaWritable())) {
    throw new Error(
      `La galería está en solo lectura. Para habilitar la escritura: montaje NFS en lectura-escritura y el archivo ${ESCRITURA_SENTINEL} en la raíz de la share de LabTem.`,
    );
  }
}

// Errores de disco → mensajes que el equipo entiende (el código EROFS no le dice nada a nadie).
function galeriaFsError(e: unknown): Error {
  const code = (e as NodeJS.ErrnoException)?.code;
  if (code === "EROFS") return new Error("El montaje de LabTem está en SOLO LECTURA: hay que remontarlo en lectura-escritura (rw).");
  if (code === "EACCES" || code === "EPERM") return new Error("LabTem rechazó la escritura (permisos NFS/share del usuario del contenedor).");
  if (code === "ENOSPC") return new Error("El disco de LabTem está lleno.");
  if (code === "ESTALE" || code === "EIO") return new Error("El montaje de LabTem se cayó a mitad de la operación. Revisa el NAS y reintenta.");
  return e instanceof Error ? e : new Error("No se pudo escribir en la galería.");
}

// Nombre válido en la share (visible por SMB): tildes y espacios se conservan; fuera lo que
// rompe rutas o Windows. Mismo criterio que Operaciones.
export function sanitizeGaleriaName(name: string): string {
  const clean = String(name || "")
    .replace(/[/\\:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.#@]+/, "")
    .slice(0, 180)
    .trim();
  if (!clean) throw new Error("nombre inválido");
  return clean;
}

export async function statGaleria(rel: string): Promise<{ name: string; rel: string; dir: boolean; size: number | null; mtimeMs: number } | null> {
  const norm = normalizeGaleriaRel(rel);
  if (!norm) return { name: "", rel: "", dir: true, size: null, mtimeMs: 0 };
  try {
    const st = await fs.stat(await galeriaAbs(norm));
    const name = norm.split("/").pop() || "";
    return { name, rel: norm, dir: st.isDirectory(), size: st.isFile() ? st.size : null, mtimeMs: st.mtimeMs };
  } catch {
    return null;
  }
}

// Ruta libre: si el nombre existe, «nombre (2).ext», etc. NUNCA se sobreescribe material.
async function freeGaleriaName(absDir: string, name: string): Promise<string> {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 0; i < 200; i++) {
    const candidate = i === 0 ? name : `${base} (${i + 1})${ext}`;
    try {
      await fs.access(path.join(absDir, candidate));
    } catch {
      return candidate;
    }
  }
  throw new Error("demasiadas colisiones de nombre");
}

export async function createGaleriaFolder(relDir: string, name: string): Promise<string> {
  await assertGaleriaEscritura();
  const dirNorm = normalizeGaleriaRel(relDir);
  const clean = sanitizeGaleriaName(name);
  try {
    const abs = path.join(await galeriaAbs(dirNorm), clean);
    await fs.mkdir(abs, { recursive: false }).catch((e) => {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    });
  } catch (e) {
    throw galeriaFsError(e);
  }
  return dirNorm ? `${dirNorm}/${clean}` : clean;
}

// Crea (si hace falta) toda la ruta de una subcarpeta ya normalizada — p. ej. la subcarpeta
// automática <carpetaCliente>/<proyecto>. mkdir recursivo, cada tramo ya saneado por quien llama.
export async function ensureGaleriaDir(rel: string): Promise<string> {
  await assertGaleriaEscritura();
  const norm = normalizeGaleriaRel(rel);
  if (!norm) throw new Error("falta la carpeta destino");
  try {
    await fs.mkdir(await galeriaAbs(norm), { recursive: true });
  } catch (e) {
    throw galeriaFsError(e);
  }
  return norm;
}

// Guarda un archivo: primero a un temporal oculto y luego rename. Si la subida muere a medias
// no queda un archivo mocho con nombre bueno que alguien entregue por error — queda un
// .lstmp-* que isJunkName ya esconde y que cualquiera puede purgar.
export async function writeGaleria(relDir: string, filename: string, buf: Buffer): Promise<string> {
  await assertGaleriaEscritura();
  const dirNorm = normalizeGaleriaRel(relDir);
  try {
    const absDir = await galeriaAbs(dirNorm);
    if (!(await fs.stat(absDir)).isDirectory()) throw new Error("el destino no es una carpeta");
    const limpio = sanitizeGaleriaName(filename);
    const tmp = path.join(absDir, `.lstmp-${crypto.randomBytes(6).toString("hex")}`);
    try {
      await fs.writeFile(tmp, buf);
      // El estreno del nombre va con link(2), que FALLA si el destino existe — rename pisa en
      // silencio, y dos subidas simultáneas del mismo nombre podían verse «libre» a la vez y
      // una tragarse a la otra. Si el sistema de archivos no sabe de enlaces duros, se cae al
      // rename de antes (misma ventana mínima de siempre, nunca peor).
      let name = await freeGaleriaName(absDir, limpio);
      for (let intento = 0; ; intento++) {
        try {
          await fs.link(tmp, path.join(absDir, name));
          await fs.rm(tmp, { force: true }).catch(() => {});
          break;
        } catch (e) {
          const code = (e as NodeJS.ErrnoException).code;
          if (code === "EEXIST" && intento < 10) {
            name = await freeGaleriaName(absDir, limpio); // perdimos la carrera: siguiente libre
            continue;
          }
          if (code === "EPERM" || code === "ENOTSUP" || code === "EOPNOTSUPP" || code === "ENOSYS") {
            await fs.rename(tmp, path.join(absDir, name));
            break;
          }
          throw e;
        }
      }
      return dirNorm ? `${dirNorm}/${name}` : name;
    } catch (e) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw e;
    }
  } catch (e) {
    throw galeriaFsError(e);
  }
}

// ── Mover y renombrar ──────────────────────────────────────────────────────────
// Las dos son el MISMO rename del sistema de archivos, y las dos comparten las tres
// reglas que hacen que no se pierda material: nunca se pisa un nombre existente (se
// desdobla a «nombre (2)»), nunca se mueve algo dentro de sí mismo, y la raíz no se
// toca. Se devuelve la ruta nueva porque casi siempre NO es la que pidió el llamador.

// Mueve una pieza o una carpeta a otra carpeta de la galería.
export async function moveGaleria(rel: string, relDirDestino: string): Promise<string> {
  await assertGaleriaEscritura();
  const origen = normalizeGaleriaRel(rel);
  const destinoDir = normalizeGaleriaRel(relDirDestino);
  if (!origen) throw new Error("no se puede mover la raíz");
  // Meter una carpeta dentro de sí misma (o de su propia descendencia) la desconecta del
  // árbol: el material seguiría en el disco pero nadie podría llegar a él.
  if (destinoDir === origen || destinoDir.startsWith(`${origen}/`)) {
    throw new Error("no se puede mover una carpeta dentro de sí misma");
  }
  const nombre = origen.split("/").pop() ?? "";
  const yaEstaAhi = (origen.includes("/") ? origen.slice(0, origen.lastIndexOf("/")) : "") === destinoDir;
  if (yaEstaAhi) return origen; // nada que hacer: ya vive ahí
  try {
    const absOrigen = await galeriaAbs(origen);
    const absDir = await galeriaAbs(destinoDir);
    if (!(await fs.stat(absDir)).isDirectory()) throw new Error("el destino no es una carpeta");
    const libre = await freeGaleriaName(absDir, nombre);
    await fs.rename(absOrigen, path.join(absDir, libre));
    return destinoDir ? `${destinoDir}/${libre}` : libre;
  } catch (e) {
    throw galeriaFsError(e);
  }
}

// Cambia el nombre de una pieza o carpeta, sin sacarla de donde está.
export async function renameGaleria(rel: string, nombreNuevo: string): Promise<string> {
  await assertGaleriaEscritura();
  const origen = normalizeGaleriaRel(rel);
  if (!origen) throw new Error("no se puede renombrar la raíz");
  const dirRel = origen.includes("/") ? origen.slice(0, origen.lastIndexOf("/")) : "";
  const actual = origen.split("/").pop() ?? "";
  // La extensión no se toca: renombrar «toma.mxf» a «bueno» dejaría un archivo que ni la
  // app reconoce como video ni el sistema sabe abrir. Se conserva la del nombre actual.
  const punto = actual.lastIndexOf(".");
  const ext = punto > 0 ? actual.slice(punto) : "";
  let limpio = sanitizeGaleriaName(nombreNuevo);
  if (ext && !limpio.toLowerCase().endsWith(ext.toLowerCase())) limpio += ext;
  if (limpio === actual) return origen;
  try {
    const absOrigen = await galeriaAbs(origen);
    const absDir = await galeriaAbs(dirRel);
    const libre = await freeGaleriaName(absDir, limpio);
    await fs.rename(absOrigen, path.join(absDir, libre));
    return dirRel ? `${dirRel}/${libre}` : libre;
  } catch (e) {
    throw galeriaFsError(e);
  }
}

// ── Resumen de una carpeta (para el índice) ────────────────────────────────────

export type GaleriaResumen = {
  piezas: number;
  bytes: number;
  ultimoMs: number;      // fecha de la pieza MÁS NUEVA que hay dentro
  portadaRel: string | null; // qué pieza representa la carpeta en el índice
  truncado: boolean;     // se llegó al tope y la cuenta es «al menos esto»
};

// El índice ordenaba las carpetas por la fecha de la CARPETA, y eso resultó ser un dato
// falso: cualquier cosa que escriba dentro —crear una `.proxy`, por ejemplo— la actualiza
// toda, y basta una pasada de la fábrica de copias para dejar 34 carpetas con la misma
// fecha y el orden destruido. Aquí se mira lo que de verdad importa: la pieza más nueva
// que contiene. Se acota (tope y profundidad) porque son 7 TB y esto se pide por carpeta.
const RESUMEN_MAX = 600;
const RESUMEN_DEPTH = 5;

export async function resumenCarpeta(rel: string): Promise<GaleriaResumen> {
  const norm = normalizeGaleriaRel(rel);
  const raiz = await galeriaAbs(norm);
  const out: GaleriaResumen = { piezas: 0, bytes: 0, ultimoMs: 0, portadaRel: null, truncado: false };
  // Se prefiere una FOTO como portada (se ve al instante desde el original); un video solo
  // sirve si su póster ya existe, y si no hay ninguno la carpeta se queda con su icono.
  let portadaFoto: string | null = null;
  let portadaVideo: string | null = null;

  const walk = async (dirAbs: string, dirRel: string, depth: number): Promise<void> => {
    if (depth > RESUMEN_DEPTH || out.truncado) return;
    const raw = await fs.readdir(dirAbs, { withFileTypes: true }).catch(() => null);
    if (!raw) return;
    for (const d of raw) {
      if (out.truncado) return;
      if (isJunkName(d.name)) continue;
      const childRel = dirRel ? `${dirRel}/${d.name}` : d.name;
      if (d.isDirectory()) {
        await walk(path.join(dirAbs, d.name), childRel, depth + 1);
        continue;
      }
      if (!d.isFile()) continue;
      const kind = galeriaKind(d.name);
      if (!kind) continue;
      if (out.piezas >= RESUMEN_MAX) {
        out.truncado = true;
        return;
      }
      const st = await fs.stat(path.join(dirAbs, d.name)).catch(() => null);
      if (!st) continue;
      out.piezas++;
      out.bytes += st.size;
      if (st.mtimeMs > out.ultimoMs) out.ultimoMs = st.mtimeMs;
      if (!portadaFoto && kind === "photo" && !needsProxy(d.name)) portadaFoto = childRel;
      else if (!portadaVideo && kind === "video") portadaVideo = childRel;
    }
  };

  await walk(raiz, norm, 0);
  out.portadaRel = portadaFoto ?? portadaVideo;
  return out;
}

// «Borrar» = mover a la papelera de red (#recycle) conservando la subruta, como hace DSM.
// Recuperable desde File Station. La raíz jamás.
export async function trashGaleria(rel: string): Promise<void> {
  await assertGaleriaEscritura();
  const norm = normalizeGaleriaRel(rel);
  if (!norm) throw new Error("no se puede borrar la raíz");
  try {
    const abs = await galeriaAbs(norm);
    const root = path.resolve(GALERIA_DIR);
    const parentRel = norm.includes("/") ? norm.slice(0, norm.lastIndexOf("/")) : "";
    const binDir = path.join(root, "#recycle", parentRel);
    await fs.mkdir(binDir, { recursive: true });
    const name = await freeGaleriaName(binDir, path.basename(abs));
    await fs.rename(abs, path.join(binDir, name));
  } catch (e) {
    throw galeriaFsError(e);
  }
}
