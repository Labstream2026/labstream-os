// Genera un .docx vacío VÁLIDO sin dependencias externas. Un .docx es un ZIP con
// XML OOXML; aquí construimos el ZIP a mano con método STORE (sin compresión), que es
// suficiente para un documento mínimo y evita traer librerías. Lo usa la pestaña Guiones
// para «crear documento nuevo» y abrirlo directamente en OnlyOffice.

// Tabla CRC-32 (estándar ZIP).
function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

type ZipEntry = { name: string; data: Buffer };

function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const size = e.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // firma local
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // método 0 = store
    local.writeUInt16LE(0, 10); // hora
    local.writeUInt16LE(0x21, 12); // fecha (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18); // tamaño comprimido (= original con store)
    local.writeUInt32LE(size, 22); // tamaño original
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra
    locals.push(local, nameBuf, e.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // firma central
    central.writeUInt16LE(20, 4); // versión creada por
    central.writeUInt16LE(20, 6); // versión necesaria
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comentario
    central.writeUInt16LE(0, 34); // disco
    central.writeUInt16LE(0, 36); // attrs internos
    central.writeUInt32LE(0, 38); // attrs externos
    central.writeUInt32LE(offset, 42); // offset del header local
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + e.data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // fin del directorio central
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16); // offset del directorio central
  eocd.writeUInt16LE(0, 20); // comentario
  return Buffer.concat([...locals, centralBuf, eocd]);
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  "</Types>";

const RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Documento mínimo: opcionalmente con uno o varios párrafos de texto inicial.
function documentXml(paragraphs: string[]): string {
  const body =
    paragraphs.length === 0
      ? "<w:p/>"
      : paragraphs
          .map((p) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(p)}</w:t></w:r></w:p>`)
          .join("");
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1701" w:bottom="1417" w:left="1701"/></w:sectPr></w:body>` +
    "</w:document>"
  );
}

// Devuelve el buffer de un .docx en blanco (o con párrafos iniciales).
export function emptyDocx(initialParagraphs: string[] = []): Buffer {
  return buildZip([
    { name: "[Content_Types].xml", data: Buffer.from(CONTENT_TYPES, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(RELS, "utf8") },
    { name: "word/document.xml", data: Buffer.from(documentXml(initialParagraphs), "utf8") },
  ]);
}
