import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { writeRelBuffer, readBuffer, absPath } from "@/lib/storage";
import { optimizeToWebp } from "@/lib/image";
import { posterDeVideo, puedeHacerPoster } from "@/lib/video-poster";

// ── Operaciones_LAB: la carpeta compartida del volumen 5 del NAS, montada DENTRO del
// contenedor (bind mount → NAS_OPS_DIR). Para la app es una carpeta local: sin credenciales
// ni SMB. Este módulo es el ÚNICO que toca ese disco; todo lo demás pasa por aquí.
//
// Principios:
//  - Sin la variable NAS_OPS_DIR el módulo entero queda apagado (el Mac de desarrollo o un
//    deploy sin el mount no rompen nada: la sección no aparece).
//  - Las listas leen el disco EN VIVO (no hay índice en BD que se desincronice).
//  - La app NUNCA escribe archivos auxiliares en la carpeta (las miniaturas se cachean en el
//    storage interno) y filtra la basura de Synology/macOS al listar.
//  - Borrar = mover a la papelera de la carpeta compartida (#recycle), recuperable en DSM.

export const OPS_DIR = process.env.NAS_OPS_DIR || "";

// Centinela anti «mount fantasma»: si el NAS se desmonta, el bind mount de Docker deja
// /nas/operaciones como una carpeta VACÍA del contenedor (capa efímera). Un simple stat pasaría
// como OK y las fotos se escribirían a la nada → pérdida silenciosa. El centinela vive en la raíz
// de la share REAL, así que su ausencia delata el fantasma. Se SIEMBRA solo la primera vez que la
// carpeta se ve con contenido real (mismo espíritu que ESCRITURA_SENTINEL de la galería), y se
// re-siembra al volver el mount: no hay que crearlo a mano ni se apaga la función por error.
export const OPS_SENTINEL = ".labstream-ops";

export function opsEnabled(): boolean {
  return Boolean(OPS_DIR);
}

// ¿Está montada Y accesible? (el mount puede faltar —o quedar fantasma— aunque la variable exista)
export async function opsReady(): Promise<boolean> {
  if (!OPS_DIR) return false;
  try {
    if (!(await fs.stat(OPS_DIR)).isDirectory()) return false;
    const sentinel = path.join(path.resolve(OPS_DIR), OPS_SENTINEL);
    try {
      await fs.stat(sentinel);
      return true; // centinela presente → el mount es el real
    } catch {
      // Sin centinela: solo se da por bueno (y se siembra) si la carpeta YA tiene contenido real.
      // Vacía = fantasma (o mount recién caído) → false, y la subida devuelve «disco no disponible»
      // en vez de escribir a un directorio efímero.
      const entries = await fs.readdir(OPS_DIR).catch(() => [] as string[]);
      if (!entries.some((e) => !isJunkName(e))) return false;
      await fs.writeFile(sentinel, "Centinela de Labstream OS: NO BORRAR. Marca que este es el disco Operaciones_LAB real.\n").catch(() => {});
      return true;
    }
  } catch {
    return false;
  }
}

// ── Rutas seguras ──────────────────────────────────────────────────────────────

// Basura que no se lista ni se sirve: metadatos de Synology, papelera, fantasmas de macOS/Windows.
const JUNK = new Set(["@eaDir", "#recycle", "#snapshot", ".DS_Store", "Thumbs.db", "desktop.ini", ".SynologyWorkingDirectory", "@tmp", "Backups_LabstreamOS", OPS_SENTINEL]);
export function isJunkName(name: string): boolean {
  return JUNK.has(name) || name.startsWith("._") || name.startsWith(".");
}

// Normaliza una ruta relativa dentro de Operaciones_LAB. Rechaza traversal, absolutas,
// backslashes y segmentos basura. "" = la raíz.
export function normalizeOpsRel(rel: string): string {
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
// La carpeta de copias de seguridad de la app vive (hoy) DENTRO de la share
// (deploy/backup-nas.sh → Backups_LabstreamOS) y cada .tar.gz lleva el .env de producción y
// el volcado completo de la base. Mientras no se mueva a otro sitio, desde la app ni se lista,
// ni se sirve, ni se toca: un solo punto de corte aquí cubre leer, escribir, mover y borrar.
const BACKUPS_DIR = "Backups_LabstreamOS";

export async function opsAbs(rel: string): Promise<string> {
  if (!OPS_DIR) throw new Error("Operaciones_LAB no está configurado");
  const norm = normalizeOpsRel(rel);
  if (norm === BACKUPS_DIR || norm.startsWith(BACKUPS_DIR + "/")) throw new Error("ruta inválida");
  const root = path.resolve(OPS_DIR);
  const full = path.resolve(root, norm);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("ruta inválida");
  // Anti-symlink: realpath del ancestro que exista debe seguir dentro de la raíz real.
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

// Nombre válido para crear/renombrar en la share: se conservan tildes y espacios (es la carpeta
// del equipo, se ve por SMB), se quitan los caracteres que rompen rutas o SMB/Windows.
export function sanitizeOpsName(name: string): string {
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

// ── Listar ─────────────────────────────────────────────────────────────────────

export type OpsEntry = {
  name: string;
  rel: string; // ruta relativa dentro de Operaciones_LAB
  dir: boolean;
  size: number | null;
  mtimeMs: number;
  ext: string;
  // ¿Se puede pintar ya su miniatura? Una imagen, siempre; un vídeo, solo si la fábrica de
  // copias ligeras apuntada a este disco le dejó su póster. Lo resuelve el servidor mirando
  // una vez la carpeta `.proxy` del nivel. Opcional para no romper a quien construya un
  // OpsEntry a mano (statOps, el selector de carpetas).
  miniatura?: boolean;
};

const MAX_ENTRIES = 2000;

// Lista una carpeta EN VIVO. Carpetas primero, luego archivos, ambos alfabético (es-CO).
export async function listOps(rel: string): Promise<{ dirs: OpsEntry[]; files: OpsEntry[]; truncated: boolean }> {
  const norm = normalizeOpsRel(rel);
  const abs = await opsAbs(norm);
  const raw = await fs.readdir(abs, { withFileTypes: true });
  // UNA lectura de la carpeta `.proxy` para saber qué vídeos ya tienen póster, sin importar
  // cuántos archivos haya. Mismo criterio que la galería: que el navegador no descubra a base
  // de 404 lo que el servidor puede mirar de una vez. Sin fábrica en este disco no existe la
  // carpeta y el Set queda vacío, que es la respuesta correcta.
  const posters = await fs
    .readdir(path.join(abs, ".proxy"))
    .then((n) => new Set(n))
    .catch(() => new Set<string>());
  const coll = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
  const dirs: OpsEntry[] = [];
  const files: OpsEntry[] = [];
  let truncated = false;
  for (const d of raw) {
    if (isJunkName(d.name)) continue;
    if (dirs.length + files.length >= MAX_ENTRIES) {
      truncated = true;
      break;
    }
    const entryRel = norm ? `${norm}/${d.name}` : d.name;
    if (d.isDirectory()) {
      dirs.push({ name: d.name, rel: entryRel, dir: true, size: null, mtimeMs: 0, ext: "" });
    } else if (d.isFile()) {
      // stat por archivo (tamaño/fecha); si falla (borrado en carrera), se omite.
      try {
        const st = await fs.stat(path.join(abs, d.name));
        files.push({
          name: d.name,
          rel: entryRel,
          dir: false,
          size: st.size,
          mtimeMs: st.mtimeMs,
          ext: (d.name.split(".").pop() || "").toLowerCase(),
          // Una imagen se pinta sola; un vídeo, si la fábrica ya le dejó su póster O si la app
          // puede sacárselo ella con ffmpeg. Los formatos de cámara propietarios (BRAW, R3D)
          // no los abre nadie sin el SDK del fabricante: a esos se les enseña su icono, que es
          // la verdad, y no se les promete una miniatura que no va a llegar.
          miniatura: opsIsVideo(d.name)
            ? posters.has(`${d.name}.poster.jpg`) || puedeHacerPoster(d.name)
            : opsHasThumb(d.name),
        });
      } catch {
        /* desapareció entre readdir y stat */
      }
    }
    // enlaces simbólicos y otros tipos: se ignoran (no se puede garantizar que no escapen)
  }
  dirs.sort((a, b) => coll.compare(a.name, b.name));
  files.sort((a, b) => coll.compare(a.name, b.name));
  return { dirs, files, truncated };
}

export async function statOps(rel: string): Promise<OpsEntry | null> {
  const norm = normalizeOpsRel(rel);
  if (!norm) return { name: "", rel: "", dir: true, size: null, mtimeMs: 0, ext: "" };
  try {
    const st = await fs.stat(await opsAbs(norm));
    const name = norm.split("/").pop() || "";
    return {
      name,
      rel: norm,
      dir: st.isDirectory(),
      size: st.isFile() ? st.size : null,
      mtimeMs: st.mtimeMs,
      ext: (name.split(".").pop() || "").toLowerCase(),
    };
  } catch {
    return null;
  }
}

// ── Escribir ───────────────────────────────────────────────────────────────────

// Ruta libre dentro de la carpeta destino: si el nombre existe, prueba «nombre (2).ext», etc.
async function freeName(absDir: string, name: string): Promise<string> {
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

// Guarda un archivo en la carpeta indicada. Devuelve la ruta relativa final.
export async function writeOps(relDir: string, filename: string, buf: Buffer): Promise<string> {
  const dirNorm = normalizeOpsRel(relDir);
  const absDir = await opsAbs(dirNorm);
  const name = await freeName(absDir, sanitizeOpsName(filename));
  await fs.writeFile(path.join(absDir, name), buf);
  return dirNorm ? `${dirNorm}/${name}` : name;
}

export async function readOps(rel: string): Promise<Buffer> {
  return fs.readFile(await opsAbs(rel));
}

export async function createOpsFolder(relDir: string, name: string): Promise<string> {
  const dirNorm = normalizeOpsRel(relDir);
  const clean = sanitizeOpsName(name);
  const abs = path.join(await opsAbs(dirNorm), clean);
  await fs.mkdir(abs, { recursive: false }).catch((e) => {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  });
  return dirNorm ? `${dirNorm}/${clean}` : clean;
}

// Renombra en el mismo sitio. Devuelve la nueva ruta relativa.
export async function renameOps(rel: string, newName: string): Promise<string> {
  const norm = normalizeOpsRel(rel);
  if (!norm) throw new Error("no se puede renombrar la raíz");
  const abs = await opsAbs(norm);
  const dir = path.dirname(abs);
  const clean = sanitizeOpsName(newName);
  const target = path.join(dir, await freeName(dir, clean));
  await fs.rename(abs, target);
  const parent = norm.includes("/") ? norm.slice(0, norm.lastIndexOf("/")) : "";
  const finalName = path.basename(target);
  return parent ? `${parent}/${finalName}` : finalName;
}

// Mueve un archivo/carpeta a otra carpeta. Evita mover una carpeta dentro de sí misma.
export async function moveOps(rel: string, destDir: string): Promise<string> {
  const norm = normalizeOpsRel(rel);
  if (!norm) throw new Error("no se puede mover la raíz");
  const dest = normalizeOpsRel(destDir);
  if (dest === norm || dest.startsWith(norm + "/")) throw new Error("no se puede mover dentro de sí misma");
  const abs = await opsAbs(norm);
  const absDest = await opsAbs(dest);
  if (!(await fs.stat(absDest)).isDirectory()) throw new Error("el destino no es una carpeta");
  const name = await freeName(absDest, path.basename(abs));
  await fs.rename(abs, path.join(absDest, name));
  return dest ? `${dest}/${name}` : name;
}

// Copiar un archivo o una carpeta (recursiva) a otra carpeta del disco. El original no se
// toca; si en el destino ya hay algo con ese nombre, la copia llega como «nombre (2)», igual
// que al mover. Copiarse DENTRO de sí misma se rechaza: se clonaría hasta llenar el disco.
export async function copyOps(rel: string, destDir: string): Promise<string> {
  const norm = normalizeOpsRel(rel);
  if (!norm) throw new Error("no se puede copiar la raíz");
  const dest = normalizeOpsRel(destDir);
  if (dest === norm || dest.startsWith(norm + "/")) throw new Error("no se puede copiar dentro de sí misma");
  const abs = await opsAbs(norm);
  const absDest = await opsAbs(dest);
  if (!(await fs.stat(absDest)).isDirectory()) throw new Error("el destino no es una carpeta");
  const name = await freeName(absDest, path.basename(abs));
  await fs.cp(abs, path.join(absDest, name), { recursive: true, force: false, errorOnExist: true });
  return dest ? `${dest}/${name}` : name;
}

// «Borrar» = mover a la papelera de la carpeta compartida (#recycle), conservando la subruta,
// como hace DSM. Recuperable desde File Station; si la papelera no existía, se crea.
export async function trashOps(rel: string): Promise<void> {
  const norm = normalizeOpsRel(rel);
  if (!norm) throw new Error("no se puede borrar la raíz");
  const abs = await opsAbs(norm);
  const root = path.resolve(OPS_DIR);
  const parentRel = norm.includes("/") ? norm.slice(0, norm.lastIndexOf("/")) : "";
  const binDir = path.join(root, "#recycle", parentRel);
  await fs.mkdir(binDir, { recursive: true });
  const name = await freeName(binDir, path.basename(abs));
  await fs.rename(abs, path.join(binDir, name));
}

// ── Miniaturas (cacheadas en el storage INTERNO, jamás en la share) ────────────

const THUMB_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;
export function opsHasThumb(name: string): boolean {
  return THUMB_EXT.test(name);
}

// ── Póster de un vídeo de esta share ───────────────────────────────────────────
// Dos caminos, y se prefiere el barato. Si algún día este disco tiene fábrica de copias
// ligeras (ver deploy/operaciones/), el póster ya está hecho en un hermano dentro de `.proxy/`
// y aquí solo se lee. Mientras no la tenga —el NAS de esta share corre un kernel sin `i915`,
// así que su GPU no se puede encender— lo saca la propia app con ffmpeg y lo guarda en su
// caché interna: se paga UNA vez por archivo y el disco no vuelve a leerse (ver video-poster).
const OPS_VIDEO_EXT = /\.(mp4|m4v|mov|mkv|avi|mxf|mts|m2ts|webm|braw|r3d|prores)$/i;

export function opsIsVideo(name: string): boolean {
  return OPS_VIDEO_EXT.test(name);
}

export function opsPosterRel(rel: string): string {
  const i = rel.lastIndexOf("/");
  const dir = i >= 0 ? rel.slice(0, i) : "";
  const base = i >= 0 ? rel.slice(i + 1) : rel;
  return dir ? `${dir}/.proxy/${base}.poster.jpg` : `.proxy/${base}.poster.jpg`;
}

// Miniatura webp de una imagen de la share. Clave de caché = sha1(ruta) + mtime + tamaño: si
// el archivo cambia por el Finder, la clave cambia y se regenera. maxEdge 640 para las listas;
// 1600 para «Ver» la imagen (mismo trato que la preview de los archivos locales).
// Poda del caché de miniaturas OPS (storage interno `ops-cache/`). Sin esto crecía sin freno: un
// set son miles de fotos × 2 tamaños, y cada re-edición en el Finder (mtime nuevo) deja huérfana la
// clave anterior → en meses llena el disco de la app. Mismo patrón que video-poster: LRU por atime,
// tope por bytes, y solo cada N escrituras (no en cada miniatura).
const OPS_CACHE_TOPE_BYTES = 3 * 1024 * 1024 * 1024; // 3 GB
const OPS_PODA_CADA = 200;
let opsDesdeUltimaPoda = 0;
async function podarOpsCache(): Promise<void> {
  if (++opsDesdeUltimaPoda < OPS_PODA_CADA) return;
  opsDesdeUltimaPoda = 0;
  try {
    const dir = absPath("ops-cache");
    const nombres = await fs.readdir(dir).catch(() => [] as string[]);
    const items: { ruta: string; size: number; atimeMs: number }[] = [];
    for (const n of nombres) {
      if (!n.endsWith(".webp")) continue;
      const ruta = path.join(dir, n);
      try {
        const st = await fs.stat(ruta);
        items.push({ ruta, size: st.size, atimeMs: st.atimeMs });
      } catch {
        /* desapareció entre readdir y stat */
      }
    }
    let total = items.reduce((s, e) => s + e.size, 0);
    if (total <= OPS_CACHE_TOPE_BYTES) return;
    items.sort((a, b) => a.atimeMs - b.atimeMs); // el menos mirado, primero
    for (const e of items) {
      if (total <= OPS_CACHE_TOPE_BYTES) break;
      await fs.rm(e.ruta, { force: true }).catch(() => {});
      total -= e.size;
    }
  } catch {
    /* el caché es un lujo: si la poda falla, la app sigue igual */
  }
}

// ── Fábrica acotada de miniaturas ──
// El camino feliz viene calentado desde la subida/importación, pero si el caché falta (poda
// LRU, volumen recreado, redeploy), abrir una galería dispara N fabricaciones concurrentes y
// CADA UNA carga el original entero a RAM (25-60 MB con la 5Ds) antes de sharp — y con
// HEIC/RAW además un ffmpeg por petición (spawn: ni el pool de libuv ni sharp.concurrency lo
// acotan). 30 celdas de un grid = ~1 GB de picos + 30 forks: el patrón de OOM que ya tumbó el
// contenedor. Dos piezas: un semáforo global para fabricaciones DISTINTAS, y un mapa de
// promesas en vuelo para que dos peticiones de la MISMA foto esperen UNA fabricación.
const FABRICA_PLAZAS = 3;
let fabricaOcupadas = 0;
const fabricaCola: (() => void)[] = [];
const fabricaEnVuelo = new Map<string, Promise<Buffer | null>>();

async function conPlazaDeFabrica<T>(fn: () => Promise<T>): Promise<T> {
  // while (no if): al despertar se RECHECA — un recién llegado pudo colarse en la plaza antes
  // de que corriera esta microtarea, y sin el recheck el tope se sobrepasaría.
  while (fabricaOcupadas >= FABRICA_PLAZAS) {
    await new Promise<void>((res) => fabricaCola.push(res));
  }
  fabricaOcupadas++;
  try {
    return await fn();
  } finally {
    fabricaOcupadas--;
    fabricaCola.shift()?.();
  }
}

export async function opsThumb(rel: string, maxEdge = 640): Promise<Buffer | null> {
  const norm = normalizeOpsRel(rel);
  // De qué archivo sale la miniatura: de la imagen misma, o del póster que dejó la fábrica si
  // la pieza es un vídeo.
  const esVideo = opsIsVideo(norm);
  const fuente = esVideo ? opsPosterRel(norm) : norm;
  if (!esVideo && !opsHasThumb(norm)) return null;
  const st = await statOps(fuente);

  // Vídeo SIN póster de fábrica: lo saca la app del propio vídeo, una vez, y lo guarda en su
  // caché. Se hace ANTES de rendirse por «no hay fuente»: la fuente que faltaba era el póster,
  // no el vídeo. El resultado ya viene al tamaño pedido, así que no pasa por la caché de abajo
  // (tendría dos copias de lo mismo, con dos claves distintas).
  if (esVideo && (!st || st.dir)) {
    if (!puedeHacerPoster(norm)) return null;
    const stVideo = await statOps(norm);
    if (!stVideo || stVideo.dir || stVideo.size == null) return null;
    const absVideo = await opsAbs(norm);
    return conPlazaDeFabrica(() => posterDeVideo(absVideo, { mtimeMs: stVideo.mtimeMs, size: stVideo.size! }, maxEdge));
  }

  if (!st || st.dir) return null;
  const key = crypto.createHash("sha1").update(fuente).digest("hex");
  const cacheRel = `ops-cache/${key}-${Math.round(st.mtimeMs)}-${maxEdge}.webp`;
  try {
    return await readBuffer(cacheRel);
  } catch {
    /* no está cacheada aún */
  }
  // Fabricación deduplicada: si otra petición ya está fabricando ESTA misma clave, se espera
  // esa promesa en vez de leer el original otra vez.
  const enVuelo = fabricaEnVuelo.get(cacheRel);
  if (enVuelo) return enVuelo;
  const fabricacion = conPlazaDeFabrica(async () => {
    // Recheck del caché DENTRO de la plaza: mientras esperábamos turno, otro pudo terminarla.
    try {
      return await readBuffer(cacheRel);
    } catch {
      /* sigue sin estar */
    }
    const buf = await readOps(fuente);
    const webp = await optimizeToWebp(buf, { maxEdge });
    if (!webp) return null;
    await writeRelBuffer(cacheRel, webp);
    void podarOpsCache().catch(() => {}); // mantiene el caché acotado sin bloquear la respuesta
    return webp;
  }).finally(() => {
    fabricaEnVuelo.delete(cacheRel);
  });
  fabricaEnVuelo.set(cacheRel, fabricacion);
  return fabricacion;
}

// Ocupación del volumen que respalda Operaciones_LAB (statfs del mount): la Biblioteca
// pinta el disco marcado «Es el NAS» EN VIVO, sin anotar TB a mano. null si el mount
// no está (dev sin variable, o deploy sin bind mount) — el que llama cae al valor manual.
export async function opsDiskUsage(): Promise<{ usedGB: number; totalGB: number } | null> {
  if (!(await opsReady())) return null;
  try {
    const s = await fs.statfs(OPS_DIR);
    const total = Number(s.blocks) * Number(s.bsize);
    const free = Number(s.bavail) * Number(s.bsize); // lo disponible de verdad (no-root)
    if (!Number.isFinite(total) || total <= 0) return null;
    return { usedGB: Math.round((total - free) / 1e9), totalGB: Math.round(total / 1e9) };
  } catch {
    return null;
  }
}
