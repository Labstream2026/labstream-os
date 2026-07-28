import { buildZip, emptyDocx } from "./docx";

// ── Documentos EN BLANCO de Office, hechos aquí mismo ──
// Un .docx/.xlsx/.pptx es un ZIP con XML dentro. Para que «Nuevo documento» funcione sin
// depender de nada (ni del Document Server, ni de una plantilla subida a mano), se arma el
// mínimo que Word/Excel/Power Point y OnlyOffice aceptan como archivo válido.
// El .docx ya vivía en `@/lib/docx` (lo usaba la pestaña Guiones); aquí se le suman los otros dos.

export type NewDocKind = "word" | "cell" | "slide";

export const NEW_DOC_EXT: Record<NewDocKind, string> = { word: "docx", cell: "xlsx", slide: "pptx" };

export const NEW_DOC_LABEL: Record<NewDocKind, string> = {
  word: "Documento de Word",
  cell: "Hoja de cálculo",
  slide: "Presentación",
};

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const parte = (name: string, xml: string) => ({ name, data: Buffer.from(xml, "utf8") });

function relationships(items: { id: string; type: string; target: string }[]): string {
  return (
    `${XML}<Relationships xmlns="${RELS_NS}">` +
    items.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join("") +
    "</Relationships>"
  );
}

// ── Hoja de cálculo (.xlsx) ──
// Una hoja vacía llamada «Hoja1». Los estilos son el mínimo que exige el formato (Excel
// rechaza el archivo si el libro declara estilos y la pieza no está, o si faltan los cuatro
// bloques de fuentes/rellenos/bordes/formatos).
function blankXlsx(): Buffer {
  const SS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  return buildZip([
    parte(
      "[Content_Types].xml",
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>",
    ),
    parte("_rels/.rels", relationships([{ id: "rId1", type: `${REL}/officeDocument`, target: "xl/workbook.xml" }])),
    parte(
      "xl/workbook.xml",
      `${XML}<workbook xmlns="${SS}" xmlns:r="${REL}">` +
        '<sheets><sheet name="Hoja1" sheetId="1" r:id="rId1"/></sheets>' +
        "</workbook>",
    ),
    parte(
      "xl/_rels/workbook.xml.rels",
      relationships([
        { id: "rId1", type: `${REL}/worksheet`, target: "worksheets/sheet1.xml" },
        { id: "rId2", type: `${REL}/styles`, target: "styles.xml" },
      ]),
    ),
    parte("xl/worksheets/sheet1.xml", `${XML}<worksheet xmlns="${SS}"><sheetData/></worksheet>`),
    parte(
      "xl/styles.xml",
      `${XML}<styleSheet xmlns="${SS}">` +
        '<fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        "</styleSheet>",
    ),
  ]);
}

// ── Presentación (.pptx) ──
// Una diapositiva en blanco. Power Point exige la cadena completa: presentación → patrón →
// diseño → diapositiva, más un tema (si falta el tema, el archivo no abre).
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";

// El árbol de formas vacío que comparten patrón, diseño y diapositiva.
const SP_TREE =
  "<p:spTree>" +
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
  "</p:spTree>";

function themeXml(): string {
  const color = (n: string, v: string) => `<a:${n}><a:srgbClr val="${v}"/></a:${n}>`;
  const relleno =
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const linea =
    '<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>';
  return (
    `${XML}<a:theme xmlns:a="${A}" name="Office">` +
    "<a:themeElements>" +
    '<a:clrScheme name="Office">' +
    '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
    '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    color("dk2", "44546A") +
    color("lt2", "E7E6E6") +
    color("accent1", "4472C4") +
    color("accent2", "ED7D31") +
    color("accent3", "A5A5A5") +
    color("accent4", "FFC000") +
    color("accent5", "5B9BD5") +
    color("accent6", "70AD47") +
    color("hlink", "0563C1") +
    color("folHlink", "954F72") +
    "</a:clrScheme>" +
    '<a:fontScheme name="Office">' +
    '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
    "</a:fontScheme>" +
    '<a:fmtScheme name="Office">' +
    `<a:fillStyleLst>${relleno}${relleno}${relleno}</a:fillStyleLst>` +
    `<a:lnStyleLst>${linea}${linea}${linea}</a:lnStyleLst>` +
    "<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>" +
    `<a:bgFillStyleLst>${relleno}${relleno}${relleno}</a:bgFillStyleLst>` +
    "</a:fmtScheme>" +
    "</a:themeElements>" +
    "</a:theme>"
  );
}

function blankPptx(): Buffer {
  const ns = `xmlns:a="${A}" xmlns:r="${REL}" xmlns:p="${P}"`;
  return buildZip([
    parte(
      "[Content_Types].xml",
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
        '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
        "</Types>",
    ),
    parte("_rels/.rels", relationships([{ id: "rId1", type: `${REL}/officeDocument`, target: "ppt/presentation.xml" }])),
    parte(
      "ppt/presentation.xml",
      `${XML}<p:presentation ${ns}>` +
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
        '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>' +
        // 16:9 (12192000 × 6858000 EMU), que es lo que espera cualquiera hoy.
        '<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>' +
        "</p:presentation>",
    ),
    parte(
      "ppt/_rels/presentation.xml.rels",
      relationships([
        { id: "rId1", type: `${REL}/slideMaster`, target: "slideMasters/slideMaster1.xml" },
        { id: "rId2", type: `${REL}/slide`, target: "slides/slide1.xml" },
        { id: "rId3", type: `${REL}/theme`, target: "theme/theme1.xml" },
      ]),
    ),
    parte(
      "ppt/slideMasters/slideMaster1.xml",
      `${XML}<p:sldMaster ${ns}>` +
        `<p:cSld>${SP_TREE}</p:cSld>` +
        '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
        '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
        "</p:sldMaster>",
    ),
    parte(
      "ppt/slideMasters/_rels/slideMaster1.xml.rels",
      relationships([
        { id: "rId1", type: `${REL}/slideLayout`, target: "../slideLayouts/slideLayout1.xml" },
        { id: "rId2", type: `${REL}/theme`, target: "../theme/theme1.xml" },
      ]),
    ),
    parte(
      "ppt/slideLayouts/slideLayout1.xml",
      `${XML}<p:sldLayout ${ns} type="blank" preserve="1">` +
        `<p:cSld name="Diapositiva en blanco">${SP_TREE}</p:cSld>` +
        "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>" +
        "</p:sldLayout>",
    ),
    parte(
      "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
      relationships([{ id: "rId1", type: `${REL}/slideMaster`, target: "../slideMasters/slideMaster1.xml" }]),
    ),
    parte(
      "ppt/slides/slide1.xml",
      `${XML}<p:sld ${ns}><p:cSld>${SP_TREE}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
    ),
    parte(
      "ppt/slides/_rels/slide1.xml.rels",
      relationships([{ id: "rId1", type: `${REL}/slideLayout`, target: "../slideLayouts/slideLayout1.xml" }]),
    ),
    parte("ppt/theme/theme1.xml", themeXml()),
  ]);
}

// Un documento nuevo, vacío y listo para abrir en el editor.
export function blankOffice(kind: NewDocKind): Buffer {
  if (kind === "cell") return blankXlsx();
  if (kind === "slide") return blankPptx();
  return emptyDocx();
}

// Deja el nombre con la extensión que toca (si el usuario ya la escribió, no se repite).
export function withDocExt(name: string, kind: NewDocKind): string {
  const ext = NEW_DOC_EXT[kind];
  const limpio = name.trim() || "Documento sin título";
  return new RegExp(`\\.${ext}$`, "i").test(limpio) ? limpio : `${limpio}.${ext}`;
}
