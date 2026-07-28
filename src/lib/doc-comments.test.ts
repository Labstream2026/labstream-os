import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { buildZip } from "./docx";
import { readZipText, zipNames } from "./zip-read";
import { readDocComments } from "./doc-comments";

// Los .docx/.xlsx/.pptx de verdad vienen COMPRIMIDOS (deflate); `buildZip` guarda sin comprimir.
// Se prueban los dos caminos porque el lector tiene que aguantar ambos.
function zipDeflate(entries: { name: string; data: Buffer }[]): Buffer {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (~c) >>> 0;
  };
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const comp = deflateRawSync(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc(e.data), 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, comp);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc(e.data), 16);
    central.writeUInt32LE(comp.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

const parte = (name: string, xml: string) => ({ name, data: Buffer.from(xml, "utf8") });

const COMMENTS_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">' +
  '<w:comment w:id="0" w:author="Ana Ruiz" w:date="2026-07-27T10:15:00Z" w:initials="AR">' +
  '<w:p w14:paraId="AAAA0001"><w:r><w:t xml:space="preserve">Cambiar el t&#237;tulo </w:t></w:r><w:r><w:t>por algo m&#225;s corto</w:t></w:r></w:p>' +
  "</w:comment>" +
  '<w:comment w:id="1" w:author="Cliente S.A.S" w:date="2026-07-27T11:00:00Z">' +
  '<w:p w14:paraId="AAAA0002"><w:r><w:t>Este p&#225;rrafo ya est&#225; bien &amp; aprobado</w:t></w:r></w:p>' +
  "</w:comment>" +
  "</w:comments>";

const EXTENDED_XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml">' +
  '<w15:commentEx w15:paraId="AAAA0001" w15:done="0"/>' +
  '<w15:commentEx w15:paraId="AAAA0002" w15:done="1"/>' +
  "</w15:commentsEx>";

describe("zip-read", () => {
  it("lee una pieza guardada sin comprimir", () => {
    const buf = buildZip([parte("word/comments.xml", COMMENTS_XML)]);
    expect(zipNames(buf)).toEqual(["word/comments.xml"]);
    expect(readZipText(buf, "word/comments.xml")).toBe(COMMENTS_XML);
  });

  it("lee una pieza comprimida con deflate (como la escribe Word)", () => {
    const buf = zipDeflate([parte("word/comments.xml", COMMENTS_XML)]);
    expect(readZipText(buf, "word/comments.xml")).toBe(COMMENTS_XML);
  });

  it("devuelve null si la pieza no está, sin lanzar", () => {
    expect(readZipText(buildZip([parte("a.xml", "<a/>")]), "word/comments.xml")).toBeNull();
    expect(readZipText(Buffer.from("no soy un zip"), "word/comments.xml")).toBeNull();
  });
});

describe("readDocComments · Word", () => {
  const buf = zipDeflate([parte("word/comments.xml", COMMENTS_XML), parte("word/commentsExtended.xml", EXTENDED_XML)]);
  const cs = readDocComments(buf, "word");

  it("saca autor, texto y fecha de cada comentario", () => {
    expect(cs).toHaveLength(2);
    expect(cs[0].author).toBe("Ana Ruiz");
    expect(cs[0].text).toBe("Cambiar el título por algo más corto");
    expect(cs[0].at?.toISOString()).toBe("2026-07-27T10:15:00.000Z");
    expect(cs[0].extId).toBe("w:0");
  });

  it("decodifica las entidades XML del texto", () => {
    expect(cs[1].text).toBe("Este párrafo ya está bien & aprobado");
  });

  it("sabe cuáles están resueltos", () => {
    expect(cs[0].resolved).toBe(false);
    expect(cs[1].resolved).toBe(true);
  });

  it("un documento sin comentarios devuelve lista vacía", () => {
    expect(readDocComments(zipDeflate([parte("word/document.xml", "<w:p/>")]), "word")).toEqual([]);
  });
});

describe("readDocComments · Excel", () => {
  it("prefiere los comentarios con hilo y resuelve el nombre de la persona", () => {
    const buf = zipDeflate([
      parte(
        "xl/persons/person.xml",
        '<persons><person displayName="Marcela" id="{P1}" userId="m@x.co" providerId="AD"/></persons>',
      ),
      parte(
        "xl/threadedComments/threadedComment1.xml",
        '<ThreadedComments><threadedComment ref="B4" dT="2026-07-27T09:00:00" personId="{P1}" id="{C1}" done="1"><text>Falta el IVA</text></threadedComment></ThreadedComments>',
      ),
      parte(
        "xl/comments1.xml",
        '<comments><authors><author>tc={C1}</author></authors><commentList><comment ref="B4" authorId="0"><text><r><t>Falta el IVA</t></r></text></comment></commentList></comments>',
      ),
    ]);
    const cs = readDocComments(buf, "cell");
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ author: "Marcela", text: "[B4] Falta el IVA", resolved: true, extId: "x:{C1}" });
  });

  it("lee los comentarios viejos cuando no hay hilos", () => {
    const buf = zipDeflate([
      parte(
        "xl/comments1.xml",
        '<comments><authors><author>Jonathan</author></authors><commentList><comment ref="A1" authorId="0"><text><r><t>Revisar</t></r></text></comment></commentList></comments>',
      ),
    ]);
    const cs = readDocComments(buf, "cell");
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ author: "Jonathan", text: "[A1] Revisar" });
  });
});

describe("readDocComments · Power Point", () => {
  it("cruza el comentario con su autor", () => {
    const buf = zipDeflate([
      parte("ppt/commentAuthors.xml", '<p:cmAuthorLst><p:cmAuthor id="1" name="Ana" initials="A"/></p:cmAuthorLst>'),
      parte(
        "ppt/comments/comment1.xml",
        '<p:cmLst><p:cm authorId="1" dt="2026-07-27T12:00:00" idx="1"><p:pos x="100" y="200"/><p:text>Esta diapositiva sobra</p:text></p:cm></p:cmLst>',
      ),
    ]);
    const cs = readDocComments(buf, "slide");
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ author: "Ana", text: "Esta diapositiva sobra" });
  });
});

describe("readDocComments · robustez", () => {
  it("un archivo que no es un zip no rompe nada", () => {
    expect(readDocComments(Buffer.from("PK roto"), "word")).toEqual([]);
  });

  it("un tipo que no es de Office devuelve lista vacía", () => {
    expect(readDocComments(zipDeflate([parte("word/comments.xml", COMMENTS_XML)]), null)).toEqual([]);
  });
});
