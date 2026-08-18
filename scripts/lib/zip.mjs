// Escritor de ZIP mínimo, sin dependencias (Node trae deflateRaw en zlib).
//
// Existe para empaquetar el kit de instalación del plugin de Resolve sin sumarle una librería
// al proyecto por un archivo de 40 KB. Solo hace lo que ese kit necesita: archivos (no carpetas
// vacías), DEFLATE, sin cifrado y sin ZIP64 — de sobra para un kit que no pasa de unos cientos
// de KB.
//
// Detalle que importa en Mac: los permisos Unix viajan en los 16 bits altos de los atributos
// externos. Sin eso, los .command salen SIN permiso de ejecución y el editor recibe un
// «no se puede abrir» al hacer doble clic; con eso, funcionan recién descomprimidos.

import { deflateRawSync } from "node:zlib";

// CRC-32 (el mismo polinomio de siempre); la tabla se calcula una vez.
const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Fecha/hora en formato DOS. Se usa uno FIJO a propósito: así el mismo contenido produce el
// mismo zip byte a byte y el hash no cambia solo porque hoy sea otro día.
const DOS_HORA = 0; // 00:00:00
const DOS_FECHA = ((2024 - 1980) << 9) | (1 << 5) | 1; // 2024-01-01

/**
 * @param {{name: string, data: Buffer, mode?: number}[]} entradas
 * @returns {Buffer} el zip completo
 */
export function crearZip(entradas) {
  const locales = [];
  const central = [];
  let offset = 0;

  for (const e of entradas) {
    const nombre = Buffer.from(e.name.replace(/\\/g, "/"), "utf8");
    const crudo = e.data;
    const comprimido = deflateRawSync(crudo, { level: 9 });
    const crc = crc32(crudo);
    // Si comprimir no ayuda (iconos ya comprimidos), se guarda tal cual: método 0.
    const usaDeflate = comprimido.length < crudo.length;
    const datos = usaDeflate ? comprimido : crudo;
    const metodo = usaDeflate ? 8 : 0;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); // versión necesaria
    lh.writeUInt16LE(0, 6); // sin banderas
    lh.writeUInt16LE(metodo, 8);
    lh.writeUInt16LE(DOS_HORA, 10);
    lh.writeUInt16LE(DOS_FECHA, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(datos.length, 18);
    lh.writeUInt32LE(crudo.length, 22);
    lh.writeUInt16LE(nombre.length, 26);
    lh.writeUInt16LE(0, 28); // sin campo extra
    locales.push(lh, nombre, datos);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(0x031e, 4); // «hecho por» Unix → los permisos de abajo se respetan
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(metodo, 10);
    ch.writeUInt16LE(DOS_HORA, 12);
    ch.writeUInt16LE(DOS_FECHA, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(datos.length, 20);
    ch.writeUInt32LE(crudo.length, 24);
    ch.writeUInt16LE(nombre.length, 28);
    ch.writeUInt16LE(0, 30); // extra
    ch.writeUInt16LE(0, 32); // comentario
    ch.writeUInt16LE(0, 34); // disco
    ch.writeUInt16LE(0, 36); // atributos internos
    ch.writeUInt32LE(((e.mode ?? 0o644) & 0xffff) << 16, 38); // permisos Unix
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nombre);

    offset += lh.length + nombre.length + datos.length;
  }

  const cuerpo = Buffer.concat(locales);
  const dir = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(dir.length, 12);
  fin.writeUInt32LE(cuerpo.length, 16);
  fin.writeUInt16LE(0, 20);
  return Buffer.concat([cuerpo, dir, fin]);
}
