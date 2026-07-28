import { inflateRawSync } from "node:zlib";

// Lector mínimo de ZIP. Un .docx/.xlsx/.pptx es un ZIP con XML dentro: para leer los
// comentarios hay que sacar una pieza concreta (p. ej. "word/comments.xml") sin traer una
// librería. Es el hermano de `buildZip` en `@/lib/docx` (que los ESCRIBE).
//
// Se lee el DIRECTORIO CENTRAL (al final del archivo), no las cabeceras locales: cuando Word
// escribe con "data descriptor" las cabeceras locales traen los tamaños en cero y el central
// es el único sitio donde el dato es fiable.

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;

type Entry = { name: string; method: number; compressedSize: number; localOffset: number };

// Busca el fin del directorio central hacia atrás (puede haber comentario de archivo al final).
function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

// Índice del ZIP: nombre → dónde está y cómo está comprimida cada pieza.
function readIndex(buf: Buffer): Map<string, Entry> {
  const out = new Map<string, Entry>();
  const eocd = findEocd(buf);
  if (eocd < 0) return out;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_SIG) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    out.set(name, { name, method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function extract(buf: Buffer, e: Entry): Buffer | null {
  // La cabecera local repite el nombre y los "extra": hay que saltarlos para llegar a los datos.
  const p = e.localOffset;
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== 0x04034b50) return null;
  const nameLen = buf.readUInt16LE(p + 26);
  const extraLen = buf.readUInt16LE(p + 28);
  const start = p + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + e.compressedSize);
  if (e.method === 0) return Buffer.from(data); // guardado sin comprimir
  if (e.method === 8) {
    try {
      return inflateRawSync(data);
    } catch {
      return null;
    }
  }
  return null; // método raro (bzip2, lzma…): no lo usamos para OOXML
}

// Nombres de las piezas que trae el archivo (para saber si existe "word/comments.xml").
export function zipNames(buf: Buffer): string[] {
  return [...readIndex(buf).keys()];
}

// Devuelve una pieza como texto UTF-8, o null si no está o no se pudo descomprimir.
// Nunca lanza: un archivo corrupto no puede tumbar el guardado del documento.
export function readZipText(buf: Buffer, name: string): string | null {
  try {
    const e = readIndex(buf).get(name);
    if (!e) return null;
    const data = extract(buf, e);
    return data ? data.toString("utf8").replace(/^﻿/, "") : null;
  } catch {
    return null;
  }
}

// Igual, pero para varias piezas que siguen un patrón (comment1.xml, comment2.xml…).
export function readZipTexts(buf: Buffer, match: RegExp): { name: string; text: string }[] {
  try {
    const index = readIndex(buf);
    const out: { name: string; text: string }[] = [];
    for (const [name, e] of index) {
      if (!match.test(name)) continue;
      const data = extract(buf, e);
      if (data) out.push({ name, text: data.toString("utf8").replace(/^﻿/, "") });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
