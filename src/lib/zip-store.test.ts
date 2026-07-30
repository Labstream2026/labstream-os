import { describe, expect, it } from "vitest";
import { crc32 } from "node:zlib";
import { pesoZip, zipStore, type ZipEntrada } from "./zip-store";

// El zip se valida CONTRA LA ESPECIFICACIÓN, byte a byte: cabeceras locales, descriptores,
// directorio central con su extra ZIP64, y el cierre. Si esto pasa, cualquier lector serio
// (Explorer, macOS, 7-Zip, unzip) lo abre — y si un día alguien toca el formato, revienta
// aquí y no en la descarga de un cliente.

function entrada(nombre: string, contenido: Buffer, mtime = new Date(2026, 6, 29, 12, 30, 44)): ZipEntrada {
  return { nombre, size: contenido.length, mtime, datos: () => [contenido] };
}

async function armar(entradas: ZipEntrada[]): Promise<Buffer> {
  const trozos: Buffer[] = [];
  for await (const t of zipStore(entradas)) trozos.push(t);
  return Buffer.concat(trozos);
}

const A = Buffer.from("hola galería\n", "utf8");
const B = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
const VACIO = Buffer.alloc(0);

describe("zipStore", () => {
  it("el peso calculado es EXACTO (es lo que fija el Content-Length)", async () => {
    const entradas = [entrada("a.txt", A), entrada("carpeta/ñandú.mp4", B), entrada("vacio.bin", VACIO)];
    const zip = await armar(entradas);
    expect(zip.length).toBe(pesoZip(entradas));
  });

  it("cabeceras locales, descriptores y CRC dicen la verdad", async () => {
    const entradas = [entrada("a.txt", A), entrada("carpeta/ñandú.mp4", B), entrada("vacio.bin", VACIO)];
    const contenidos = [A, B, VACIO];
    const zip = await armar(entradas);

    let p = 0;
    const offsets: number[] = [];
    for (let i = 0; i < entradas.length; i++) {
      offsets.push(p);
      expect(zip.readUInt32LE(p)).toBe(0x04034b50); // firma local
      expect(zip.readUInt16LE(p + 6)).toBe(0x0808); // descriptor + UTF-8
      expect(zip.readUInt16LE(p + 8)).toBe(0); // STORE
      const nLen = zip.readUInt16LE(p + 26);
      const nombre = zip.subarray(p + 30, p + 30 + nLen).toString("utf8");
      expect(nombre).toBe(["a.txt", "carpeta/ñandú.mp4", "vacio.bin"][i]);
      p += 30 + nLen;

      const datos = zip.subarray(p, p + contenidos[i]!.length);
      expect(Buffer.compare(datos, contenidos[i]!)).toBe(0); // STORE = bytes tal cual
      p += contenidos[i]!.length;

      expect(zip.readUInt32LE(p)).toBe(0x08074b50); // firma del descriptor
      expect(zip.readUInt32LE(p + 4)).toBe(crc32(contenidos[i]!) >>> 0);
      expect(Number(zip.readBigUInt64LE(p + 8))).toBe(contenidos[i]!.length);
      expect(Number(zip.readBigUInt64LE(p + 16))).toBe(contenidos[i]!.length);
      p += 24;
    }

    // ── Directorio central: CRC reales, marcadores ZIP64 y offsets correctos ──
    const cdOffset = p;
    for (let i = 0; i < entradas.length; i++) {
      expect(zip.readUInt32LE(p)).toBe(0x02014b50);
      expect(zip.readUInt32LE(p + 16)).toBe(crc32(contenidos[i]!) >>> 0);
      expect(zip.readUInt32LE(p + 20)).toBe(0xffffffff); // tamaños → extra ZIP64
      expect(zip.readUInt32LE(p + 42)).toBe(0xffffffff); // offset → extra ZIP64
      const nLen = zip.readUInt16LE(p + 28);
      const xLen = zip.readUInt16LE(p + 30);
      expect(xLen).toBe(28);
      const x = p + 46 + nLen;
      expect(zip.readUInt16LE(x)).toBe(0x0001); // id del extra ZIP64
      expect(Number(zip.readBigUInt64LE(x + 4))).toBe(contenidos[i]!.length);
      expect(Number(zip.readBigUInt64LE(x + 12))).toBe(contenidos[i]!.length);
      expect(Number(zip.readBigUInt64LE(x + 20))).toBe(offsets[i]);
      p += 46 + nLen + xLen;
    }
    const cdSize = p - cdOffset;

    // ── Cierre: EOCD64, localizador y EOCD con marcadores ──
    expect(zip.readUInt32LE(p)).toBe(0x06064b50);
    expect(Number(zip.readBigUInt64LE(p + 24))).toBe(entradas.length);
    expect(Number(zip.readBigUInt64LE(p + 40))).toBe(cdSize);
    expect(Number(zip.readBigUInt64LE(p + 48))).toBe(cdOffset);
    p += 56;
    expect(zip.readUInt32LE(p)).toBe(0x07064b50);
    expect(Number(zip.readBigUInt64LE(p + 8))).toBe(cdOffset + cdSize); // dónde está el EOCD64
    p += 20;
    expect(zip.readUInt32LE(p)).toBe(0x06054b50);
    expect(zip.readUInt16LE(p + 10)).toBe(0xffff); // marcador: la verdad está en el EOCD64
    expect(p + 22).toBe(zip.length); // y después del EOCD no hay nada
  });

  it("si un archivo cambia de tamaño a mitad de lectura, corta en vez de corromper", async () => {
    const mentirosa: ZipEntrada = { nombre: "x.bin", size: 10, mtime: new Date(), datos: () => [Buffer.alloc(4)] };
    await expect(armar([mentirosa])).rejects.toThrow(/cambió durante la descarga/);
  });

  it("limpia nombres peligrosos (absolutos, .., barras invertidas)", async () => {
    const zip = await armar([entrada("../../etc\\passwd", A)]);
    const nLen = zip.readUInt16LE(26);
    expect(zip.subarray(30, 30 + nLen).toString("utf8")).toBe("etc/passwd");
  });
});
