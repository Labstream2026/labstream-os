// CRC32 incremental PURO (sin dependencias, corre igual en navegador y en Node).
// Se usa para la verificación de integridad de la subida por trozos: el cliente lo va
// calculando mientras sube y el servidor lo recalcula sobre el archivo rearmado — si no
// coinciden, el archivo llegó corrupto y NO se registra la versión.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export const CRC32_INIT = 0xffffffff;

export function crc32Update(crc: number, chunk: Uint8Array): number {
  let c = crc;
  for (let i = 0; i < chunk.length; i++) c = TABLE[(c ^ chunk[i]) & 0xff] ^ (c >>> 8);
  return c >>> 0;
}

export function crc32Hex(crc: number): string {
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}
