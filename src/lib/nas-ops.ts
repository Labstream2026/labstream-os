import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { writeRelBuffer, readBuffer } from "@/lib/storage";
import { optimizeToWebp } from "@/lib/image";

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

export function opsEnabled(): boolean {
  return Boolean(OPS_DIR);
}

// ¿Está montada Y accesible? (el mount puede faltar aunque la variable exista)
export async function opsReady(): Promise<boolean> {
  if (!OPS_DIR) return false;
  try {
    return (await fs.stat(OPS_DIR)).isDirectory();
  } catch {
    return false;
  }
}

// ── Rutas seguras ──────────────────────────────────────────────────────────────

// Basura que no se lista ni se sirve: metadatos de Synology, papelera, fantasmas de macOS/Windows.
const JUNK = new Set(["@eaDir", "#recycle", "#snapshot", ".DS_Store", "Thumbs.db", "desktop.ini", ".SynologyWorkingDirectory", "@tmp"]);
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
export async function opsAbs(rel: string): Promise<string> {
  if (!OPS_DIR) throw new Error("Operaciones_LAB no está configurado");
  const norm = normalizeOpsRel(rel);
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
};

const MAX_ENTRIES = 2000;

// Lista una carpeta EN VIVO. Carpetas primero, luego archivos, ambos alfabético (es-CO).
export async function listOps(rel: string): Promise<{ dirs: OpsEntry[]; files: OpsEntry[]; truncated: boolean }> {
  const norm = normalizeOpsRel(rel);
  const abs = await opsAbs(norm);
  const raw = await fs.readdir(abs, { withFileTypes: true });
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

// Miniatura webp de una imagen de la share. Clave de caché = sha1(ruta) + mtime + tamaño: si
// el archivo cambia por el Finder, la clave cambia y se regenera. maxEdge 640 para las listas;
// 1600 para «Ver» la imagen (mismo trato que la preview de los archivos locales).
export async function opsThumb(rel: string, maxEdge = 640): Promise<Buffer | null> {
  const norm = normalizeOpsRel(rel);
  if (!opsHasThumb(norm)) return null;
  const st = await statOps(norm);
  if (!st || st.dir) return null;
  const key = crypto.createHash("sha1").update(norm).digest("hex");
  const cacheRel = `ops-cache/${key}-${Math.round(st.mtimeMs)}-${maxEdge}.webp`;
  try {
    return await readBuffer(cacheRel);
  } catch {
    /* no está cacheada aún */
  }
  const buf = await readOps(norm);
  const webp = await optimizeToWebp(buf, { maxEdge });
  if (!webp) return null;
  await writeRelBuffer(cacheRel, webp);
  return webp;
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
