import { crc32 } from "node:zlib";

// ── ZIP en streaming, sin comprimir (método STORE) ─────────────────────────────
// Para descargar VARIAS piezas de la galería en un solo archivo. Se escribe a mano y sin
// dependencias por tres razones que aquí importan de verdad:
//
//  1. STORE, nunca DEFLATE: el material es video y foto ya comprimidos. Recomprimir quema la
//     CPU del NAS para ganar un 0,3%; empaquetar es copiar bytes del disco al navegador.
//  2. El TAMAÑO EXACTO del zip se conoce ANTES de mandar el primer byte (con STORE todo es
//     aritmética de cabeceras): se puede fijar Content-Length y el navegador enseña una barra
//     de progreso real, no un «descargando…» ciego.
//  3. El CRC de cada archivo no se sabe hasta terminar de leerlo, así que se usan DATA
//     DESCRIPTORS (bandera bit 3): cabecera local con ceros, descriptor con la verdad al final,
//     y el directorio central —que va al cierre— lleva los CRC definitivos.
//
// Se escribe ZIP64 SIEMPRE (no solo al pasar de 4 GB): una sola forma de archivo que los
// lectores modernos (Explorer, macOS, 7-Zip, unzip) entienden igual, en vez de dos caminos y
// el bug esperando en el que casi nunca corre. Los campos de 32 bits llevan el marcador
// 0xFFFFFFFF y la verdad viaja en el campo extra ZIP64, como manda la especificación.

export type ZipEntradaMeta = { nombre: string; size: number; mtime: Date };
export type ZipEntrada = ZipEntradaMeta & { datos: () => AsyncIterable<Uint8Array> | Iterable<Uint8Array> };

const LFH = 30; // cabecera local, sin extra
const DD = 24; // data descriptor ZIP64: firma(4) + crc(4) + csize(8) + usize(8)
const CD_BASE = 46;
const CD_EXTRA = 4 + 24; // cabecera del extra ZIP64 + usize/csize/offset de 8 bytes
const EOCD64 = 56;
const LOCATOR = 20;
const EOCD = 22;

function nombreLimpio(nombre: string): string {
  // Separadores del zip son «/»; fuera absolutos y «..» — el nombre viene de rutas ya
  // normalizadas de la galería, esto es el cinturón además de los tirantes.
  const partes = String(nombre)
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p && p !== "." && p !== "..");
  return partes.join("/") || "archivo";
}

function bytesNombre(nombre: string): number {
  return Buffer.byteLength(nombreLimpio(nombre), "utf8");
}

// El peso EXACTO del zip que va a salir, calculable antes de leer un solo byte del disco.
export function pesoZip(entradas: ZipEntradaMeta[]): number {
  let total = 0;
  let cd = 0;
  for (const e of entradas) {
    const n = bytesNombre(e.nombre);
    total += LFH + n + e.size + DD;
    cd += CD_BASE + n + CD_EXTRA;
  }
  return total + cd + EOCD64 + LOCATOR + EOCD;
}

// Fecha/hora en el formato DOS del zip (resolución de 2 s; antes de 1980 no existe).
function dosFecha(d: Date): { fecha: number; hora: number } {
  const y = Math.max(1980, d.getFullYear());
  return {
    fecha: ((y - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  };
}

export async function* zipStore(entradas: ZipEntrada[]): AsyncGenerator<Buffer> {
  type Hecha = { nombre: Buffer; crc: number; size: number; offset: number; fecha: number; hora: number };
  const hechas: Hecha[] = [];
  let offset = 0;

  for (const e of entradas) {
    const nombre = Buffer.from(nombreLimpio(e.nombre), "utf8");
    const { fecha, hora } = dosFecha(e.mtime);
    const inicio = offset;

    // Cabecera local: bit 3 (los tamaños y el CRC van en el descriptor) + bit 11 (UTF-8).
    const lfh = Buffer.alloc(LFH + nombre.length);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(45, 4); // versión ZIP64
    lfh.writeUInt16LE(0x0808, 6);
    lfh.writeUInt16LE(0, 8); // STORE
    lfh.writeUInt16LE(hora, 10);
    lfh.writeUInt16LE(fecha, 12);
    // crc y tamaños en cero: la verdad va en el data descriptor.
    lfh.writeUInt16LE(nombre.length, 26);
    lfh.writeUInt16LE(0, 28);
    nombre.copy(lfh, 30);
    yield lfh;
    offset += lfh.length;

    // El contenido, contando bytes y acumulando el CRC por el camino.
    let crc = 0;
    let visto = 0;
    for await (const trozo of e.datos()) {
      const buf = Buffer.isBuffer(trozo) ? trozo : Buffer.from(trozo);
      if (buf.length === 0) continue;
      crc = crc32(buf, crc);
      visto += buf.length;
      yield buf;
    }
    // El tamaño declarado fija el Content-Length de TODA la respuesta: si el archivo cambió
    // entre el stat y la lectura, seguir sería corromper el zip en silencio. Mejor cortar.
    if (visto !== e.size) {
      throw new Error(`«${nombreLimpio(e.nombre)}» cambió durante la descarga (esperados ${e.size} bytes, leídos ${visto}).`);
    }
    offset += visto;

    // Data descriptor en su forma ZIP64 (tamaños de 8 bytes), con firma.
    const dd = Buffer.alloc(DD);
    dd.writeUInt32LE(0x08074b50, 0);
    dd.writeUInt32LE(crc >>> 0, 4);
    dd.writeBigUInt64LE(BigInt(visto), 8);
    dd.writeBigUInt64LE(BigInt(visto), 16);
    yield dd;
    offset += DD;

    hechas.push({ nombre, crc: crc >>> 0, size: visto, offset: inicio, fecha, hora });
  }

  // ── Directorio central ──
  const cdOffset = offset;
  for (const h of hechas) {
    const cd = Buffer.alloc(CD_BASE + h.nombre.length + CD_EXTRA);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(45 | (3 << 8), 4); // hecho por: ZIP64, sistema UNIX
    cd.writeUInt16LE(45, 6);
    cd.writeUInt16LE(0x0808, 8);
    cd.writeUInt16LE(0, 10); // STORE
    cd.writeUInt16LE(h.hora, 12);
    cd.writeUInt16LE(h.fecha, 14);
    cd.writeUInt32LE(h.crc, 16);
    cd.writeUInt32LE(0xffffffff, 20); // tamaños y offset: ver el extra ZIP64
    cd.writeUInt32LE(0xffffffff, 24);
    cd.writeUInt16LE(h.nombre.length, 28);
    cd.writeUInt16LE(CD_EXTRA, 30);
    // comentario(32)=0, disco(34)=0, attrs internos(36)=0
    cd.writeUInt32LE((0o100644 << 16) >>> 0, 38); // -rw-r--r--
    cd.writeUInt32LE(0xffffffff, 42);
    h.nombre.copy(cd, 46);
    const x = 46 + h.nombre.length;
    cd.writeUInt16LE(0x0001, x); // extra ZIP64
    cd.writeUInt16LE(24, x + 2);
    cd.writeBigUInt64LE(BigInt(h.size), x + 4); // sin comprimir
    cd.writeBigUInt64LE(BigInt(h.size), x + 12); // comprimido (STORE: igual)
    cd.writeBigUInt64LE(BigInt(h.offset), x + 20); // dónde empieza su cabecera local
    yield cd;
    offset += cd.length;
  }
  const cdSize = offset - cdOffset;

  // ── Cierre: EOCD64 + localizador + EOCD clásico con marcadores ──
  const fin = Buffer.alloc(EOCD64 + LOCATOR + EOCD);
  let p = 0;
  fin.writeUInt32LE(0x06064b50, p);
  fin.writeBigUInt64LE(BigInt(EOCD64 - 12), p + 4);
  fin.writeUInt16LE(45, p + 12);
  fin.writeUInt16LE(45, p + 14);
  // discos (16 y 20) = 0
  fin.writeBigUInt64LE(BigInt(hechas.length), p + 24);
  fin.writeBigUInt64LE(BigInt(hechas.length), p + 32);
  fin.writeBigUInt64LE(BigInt(cdSize), p + 40);
  fin.writeBigUInt64LE(BigInt(cdOffset), p + 48);
  p += EOCD64;
  fin.writeUInt32LE(0x07064b50, p);
  // disco del EOCD64 (p+4) = 0
  fin.writeBigUInt64LE(BigInt(offset), p + 8); // dónde empieza el EOCD64
  fin.writeUInt32LE(1, p + 16);
  p += LOCATOR;
  fin.writeUInt32LE(0x06054b50, p);
  // discos (p+4, p+6) = 0
  fin.writeUInt16LE(0xffff, p + 8); // marcadores: la verdad vive en el EOCD64
  fin.writeUInt16LE(0xffff, p + 10);
  fin.writeUInt32LE(0xffffffff, p + 12);
  fin.writeUInt32LE(0xffffffff, p + 16);
  // comentario (p+20) = 0
  yield fin;
}
