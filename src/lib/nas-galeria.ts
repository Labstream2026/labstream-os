import fs from "node:fs/promises";
import path from "node:path";

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
//  - La app NUNCA escribe en la carpeta: es material entregable, se toca solo desde el NAS.
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
