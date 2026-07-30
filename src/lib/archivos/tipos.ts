// Vocabulario ÚNICO de la sección Archivos, compartido por la ficha del PROYECTO y la del
// CLIENTE. Antes cada panel tenía su propio tipo y sus propios helpers (formatBytes vivía
// copiado en 5 archivos); esto es la fuente única. Sin imports de servidor: lo consumen
// componentes cliente.

// Un archivo tal y como lo pinta el panel, venga de donde venga: FileAsset de un proyecto
// (LOCAL/LINK/DRIVE/NAS/OPS) o ClientFile de la marca del cliente (esMarca). Los recortes por
// rol (rutas SMB fuera para el portal, path de OPS anulado) se hacen EN EL SERVIDOR al
// construir este objeto: aquí ya llega limpio.
export type ArchivoItem = {
  id: string;
  name: string;
  kind: string; // LOCAL | LINK | DRIVE | NAS | OPS
  url: string | null;
  path: string | null;
  size: number | null;
  createdAt: string; // ISO
  // Última ACTIVIDAD real (subida o guardado de OnlyOffice): es la fecha que pinta el panel
  // y la que usa «Lo último». En archivos nunca editados coincide con createdAt.
  updatedAt: string;
  autor: string | null; // quién lo subió (o el nombre que escribió el cliente en el enlace público)
  // 📌 Fijado: destaca en la franja «Fijado» de la ficha del cliente.
  pinned: boolean;
  version: number;
  editable: boolean; // se puede abrir en OnlyOffice
  viaClientLink: boolean;
  missing?: boolean; // OPS registrado que ya no está en el disco
  enUso?: boolean; // sostiene una versión/foto/portada de un entregable: borrarlo la deja coja
  comentarios?: number; // comentarios de OnlyOffice sin resolver
  dentro?: string[]; // quién tiene el documento abierto ahora
  puedeEliminar?: boolean; // calculado en el servidor con las reglas reales de deleteFile
  task?: { id: string; title: string } | null;
  chat?: { channelId: string; messageId: string } | null;
  carpeta?: { id: string; name: string; icon: string | null; color: string | null } | null;
  // Solo en el alcance CLIENTE: de qué proyecto viene (el chip que pediste).
  proyecto?: { id: string; name: string; emoji: string | null } | null;
  // ClientFile: material de marca del cliente, no pertenece a ningún proyecto.
  esMarca?: boolean;
  // En la PAPELERA: fecha de borrado (ISO) y días que le quedan antes de la purga.
  borradoEn?: string | null;
  diasRestantes?: number;
  // Categoría del material de marca (solo esMarca): clave de CATEGORIAS_MARCA.
  categoria?: string | null;
  // Nota de uso corta: «Solo para redes, no para TV».
  nota?: string | null;
};

// Categorías cerradas del material de marca. La clave viaja a ClientFile.category.
export const CATEGORIAS_MARCA: { key: string; label: string }[] = [
  { key: "marca", label: "🎨 Marca" },
  { key: "legal", label: "📄 Legal" },
  { key: "referencias", label: "🎬 Referencias" },
  { key: "material", label: "📥 Material del cliente" },
  { key: "acceso", label: "🔌 Accesos" },
];
export function categoriaLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return CATEGORIAS_MARCA.find((c) => c.key === key)?.label ?? null;
}

// ── Cuántos archivos hay ────────────────────────────────────────────────────────────────
// UNA sola definición, consumida por la pastilla de la pestaña, por la cabecera del panel y
// por el filtro «Todo». Antes cada sitio contaba lo suyo —uno excluía el material de marca,
// otro lo incluía, y en el proyecto la pastilla sumaba guiones que la lista no enseñaba— y el
// resultado era ver «Archivos 8» en el menú y «7 archivos» al entrar.
//
// Regla: el número es SIEMPRE el largo del mismo array que recibe el panel.
export type ResumenArchivos = { total: number; deMarca: number; proyectos: number; ultimo: string | null };

export function resumenArchivos(items: ArchivoItem[]): ResumenArchivos {
  let deMarca = 0;
  let ultimo: string | null = null;
  const proyectos = new Set<string>();
  for (const f of items) {
    if (f.esMarca) deMarca++;
    if (f.proyecto) proyectos.add(f.proyecto.id);
    if (!ultimo || f.updatedAt > ultimo) ultimo = f.updatedAt;
  }
  return { total: items.length, deMarca, proyectos: proyectos.size, ultimo };
}

// ── Documentos que viven DENTRO de la app ───────────────────────────────────────────────
// Los Word/Excel/PowerPoint editables no viajan al NAS a propósito: OnlyOffice guarda solo
// cada pocos segundos y, si alguien tocara el mismo archivo por SMB desde el Finder, acabarían
// dos versiones peleándose. Se quedan en el almacenamiento de la app —donde además entran en
// el respaldo diario y conservan su historial— y la fila lo dice con un distintivo.
const OFFICE_EXT = /\.(docx?|xlsx?|pptx?|odt|ods|odp|rtf)$/i;

export function viveEnLaApp(f: Pick<ArchivoItem, "name" | "kind">): boolean {
  return f.kind === "LOCAL" && OFFICE_EXT.test(f.name);
}

export type CarpetaItem = { id: string; name: string; icon: string | null; color: string | null };

export type ProyectoRef = { id: string; name: string; emoji: string | null };

// Carpeta viva de Operaciones_LAB vinculada al proyecto (solo equipo).
export type OpsVivo = {
  folder: string;
  ok: boolean;
  live: { name: string; rel: string; size: number | null; mtimeMs: number; ext: string }[];
  dirs: { name: string; rel: string }[];
  ooReady: boolean;
};

// El reloj del SERVIDOR para la prop `ahora` del panel. Las páginas (server components) lo
// llaman al renderizar; el panel nunca llama a Date.now() en el cliente y su render queda puro.
export function ahoraMs(): number {
  return Date.now();
}

export const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;

export function esImagen(f: Pick<ArchivoItem, "name" | "kind" | "missing">): boolean {
  return (f.kind === "LOCAL" || (f.kind === "OPS" && !f.missing)) && IMG_EXT.test(f.name);
}

// Peso legible. Única implementación: sustituye a las copias de chunked-upload-form,
// upload-version, review-cache-panel, ops-explorer y subir/[token].
export function formatPeso(bytes: number | null | undefined): string | null {
  if (bytes == null || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
}

// Fecha relativa corta en español («hace 3 h», «ayer», «12 jun»). Sin dependencias.
export function fechaRelativa(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ms = Date.now() - d.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias === 1) return "ayer";
  if (dias < 8) return `hace ${dias} d`;
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const sufijo = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MESES[d.getMonth()]}${sufijo}`;
}

// Filtros de la fila de pastillas. Son combinaciones precocinadas, no modelos nuevos.
export type FiltroArchivos = "todo" | "marca" | "reciente" | "cliente" | "enlaces" | "rutas" | "sincarpeta";

// `ahora` llega del servidor (Date.now() en la página): así el render del panel es puro y
// el compilador de React puede optimizarlo.
export function pasaFiltro(f: ArchivoItem, filtro: FiltroArchivos, ahora: number): boolean {
  switch (filtro) {
    case "todo":
      return true;
    case "marca":
      return !!f.esMarca;
    case "reciente": {
      const d = new Date(f.updatedAt).getTime();
      return ahora - d < 7 * 24 * 3600_000;
    }
    case "cliente":
      return f.viaClientLink;
    case "enlaces":
      return f.kind === "LINK" || f.kind === "DRIVE";
    case "rutas":
      return f.kind === "NAS";
    case "sincarpeta":
      return !f.esMarca && !f.carpeta;
  }
}

// Normaliza para buscar sin pelearse con los acentos.
export function normaliza(x: string): string {
  return x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// El buscador busca donde el panel ENSEÑA: nombre, ruta, carpeta, tarea y proyecto.
export function coincide(f: ArchivoItem, q: string): boolean {
  const n = normaliza(q);
  if (!n) return true;
  return (
    normaliza(f.name).includes(n) ||
    (!!f.path && normaliza(f.path).includes(n)) ||
    (!!f.carpeta && normaliza(f.carpeta.name).includes(n)) ||
    (!!f.task && normaliza(f.task.title).includes(n)) ||
    (!!f.proyecto && normaliza(f.proyecto.name).includes(n))
  );
}
