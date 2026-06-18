import { db } from "@/lib/db";
import { getInventoryTableId } from "@/lib/wiki-tables";
import { ensureInventoryQuantityColumn } from "@/lib/equipos";

// Importación inicial del inventario de equipos (desde la hoja de cálculo del equipo).
// Idempotente: identifica cada equipo por su serial (o por su nombre si no tiene serial)
// y omite los que ya existen, así se puede ejecutar varias veces sin duplicar.
// Pensado para correr UNA vez en producción con el botón de la página de inventario.

type Item = {
  n: string;            // nombre
  mk?: string;          // marca
  sr?: string;          // serial ("" si no aplica)
  md?: string;          // modelo
  cat: string;          // categoría (debe existir como opción)
  tg: string[];         // tags
  q?: number;           // cantidad (def 1)
  st?: string;          // estado (def "Operativo")
  ob?: string;          // observaciones / notas
};

const T = {
  ilum: ["iluminacion"], flash: ["iluminacion", "flash"], audio: ["audio"],
  video: ["video"], cam: ["video", "camara"], lente: ["video", "lente"],
  trans: ["transmision", "streaming"], dron: ["dron", "video"], estab: ["estabilizador", "video"],
};

// Dataset (faithful a la hoja; nombres legibles, observaciones preservadas).
const ITEMS: Item[] = [
  // ── Iluminación ──
  { n: "Luz NANLITE FS-300", mk: "NANLITE", sr: "001354640234", md: "FS-300", cat: "Iluminación", tg: T.ilum, ob: "300W" },
  { n: "Luz NANLITE FS-150", mk: "NANLITE", sr: "001187710447", md: "FS-150", cat: "Iluminación", tg: T.ilum, ob: "150W" },
  { n: "Luz YONGNUO YN900", mk: "YONGNUO", sr: "80820617", md: "YN900", cat: "Iluminación", tg: T.ilum, st: "En mantenimiento", ob: "65W · Fuente con falla en la base del cable" },
  { n: "Luz YONGNUO YN900", mk: "YONGNUO", sr: "80820613", md: "YN900", cat: "Iluminación", tg: T.ilum, ob: "65W" },
  { n: "Medidor de luz Sekonic L-308S", mk: "Sekonic", sr: "JE10-218607", md: "Flashmate L-308S", cat: "Iluminación", tg: T.ilum },
  { n: "Flash YONGNUO YN600EX-RT II", mk: "YONGNUO", sr: "59074357", md: "YN600EX-RT II", cat: "Iluminación", tg: T.flash },
  { n: "Flash GODOX AD200PRO", mk: "GODOX", sr: "19046683E", md: "AD200PRO", cat: "Iluminación", tg: T.flash, ob: "Serial en el cargador" },
  { n: "Kit de Flash Elinchrom D-Lite 2it", mk: "Elinchrom", sr: "", md: "D-Lite 2it", cat: "Iluminación", tg: T.flash, ob: "Kit de trípodes para flashes Elinchrom" },
  { n: "Anillo de luz YONGNUO WJ60 LED", mk: "YONGNUO", sr: "", md: "WJ60 LED", cat: "Iluminación", tg: T.ilum, ob: "Cantidad de LED: 60" },
  { n: "Luz YONGNUO YN300III", mk: "YONGNUO", sr: "83885430", md: "YN300III", cat: "Iluminación", tg: T.ilum, ob: "18W" },
  { n: "Kit de luces YONGNUO YN360", mk: "YONGNUO", sr: "88788374 / 88788375", md: "YN360", cat: "Iluminación", tg: T.ilum, q: 2, ob: "19,2W cada una" },
  { n: "Luz ZHIYUN Fiveray M40", mk: "ZHIYUN", sr: "8A30110C0010336", md: "Fiveray M40", cat: "Iluminación", tg: T.ilum, ob: "Serial en la caja · 40W" },
  { n: "Kit de luces NANLITE Pavo Tube II 6C", mk: "NANLITE", sr: "", md: "Pavo Tube II 6C", cat: "Iluminación", tg: T.ilum, q: 2, ob: "Se dice que hay 3, pero en la oficina solo hay 2 · 60W cada una" },
  { n: "Kit de Flash Elinchrom D-Lite 2it (150W)", mk: "Elinchrom", sr: "f/M2 015289 / f/M2 015291", md: "D-Lite 2it", cat: "Iluminación", tg: T.flash, q: 2, ob: "150W" },
  { n: "Flash GODOX AD400PRO", mk: "GODOX", sr: "K00062558", md: "AD400PRO", cat: "Iluminación", tg: T.flash },
  { n: "Flash GODOX Witstro AD600BM", mk: "GODOX", sr: "9F25D10", md: "Witstro AD600BM", cat: "Iluminación", tg: T.flash, ob: "Serial en la batería" },
  { n: "Jirafa para luces", sr: "", md: "Jirafa", cat: "Trípode/Soporte", tg: T.ilum, ob: "Trípode jirafa para luces" },
  { n: "Soporte para Flash Godox S2", mk: "GODOX", sr: "", md: "S2 Godox", cat: "Trípode/Soporte", tg: T.flash },
  { n: "Cubierta/reflector de flash Godox AD-R10", mk: "GODOX", sr: "", md: "AD-R10", cat: "Iluminación", tg: T.flash },
  { n: "Soporte para Flash Godox S2 (2)", mk: "GODOX", sr: "", md: "S2 Godox", cat: "Trípode/Soporte", tg: T.flash },
  { n: "Luz GODOX SL60W", mk: "GODOX", sr: "", md: "SL60W", cat: "Iluminación", tg: T.ilum },
  { n: "Flash GODOX Witstro AD200", mk: "GODOX", sr: "19044723E", md: "Witstro AD200", cat: "Iluminación", tg: T.flash, ob: "Serial en el cargador" },
  { n: "Luz NANLITE FS-300", mk: "NANLITE", sr: "001207020048", md: "FS-300", cat: "Iluminación", tg: T.ilum, ob: "300W" },
  { n: "Luz NANLITE FS-300", mk: "NANLITE", sr: "001220660521", md: "FS-300", cat: "Iluminación", tg: T.ilum, ob: "300W" },

  // ── Audio / Sonido ──
  { n: "Mezcladora de audio Behringer Xenyx 802", mk: "BEHRINGER", sr: "S1229439575", md: "Xenyx 802", cat: "Audio", tg: T.audio },
  { n: "Caja directa Proel DB1.A", mk: "Proel", sr: "00562", md: "DB1.A", cat: "Audio", tg: T.audio, ob: "Fuente de poder 12V-1.5" },
  { n: "Mezcladora de audio Yamaha MG10XU", mk: "YAMAHA", sr: "UGBP03468", md: "MG10XU", cat: "Audio", tg: T.audio },
  { n: "Grabadora de audio Tascam DR-40", mk: "TASCAM", sr: "0013600", md: "DR-40", cat: "Audio", tg: T.audio },
  { n: "Micrófono de solapa Takstar V1", mk: "Takstar", sr: "ATR3350xiS", md: "Takstar V1", cat: "Audio", tg: T.audio },
  { n: "Micrófono de solapa Rode Link FM", mk: "RODE", sr: "TX 2AEAN391001 / RX 2AEAN391002", md: "Rode Link FM", cat: "Audio", tg: T.audio },
  { n: "Intercomunicadores Eartec Simultalk 24G", mk: "Eartec", sr: "B4HSLT2400", md: "Simultalk 24G", cat: "Audio", tg: T.audio },
  { n: "Micrófono de solapa Hollyland Lark Max", mk: "HOLLYLAND", sr: "Trans 0223300T120A3D2 / Trans 0223300T120A3D1 / Recp 0223300R120A622 / Caja 2223300C1200CB7", md: "Lark Max", cat: "Audio", tg: T.audio },
  { n: "Kit estabilizador DJI Ronin-M", mk: "DJI", sr: "Ronin 0330022444 / Control 0360034738 / Batería 03WDCH06010084 / Batería DJ090014092403928 / Fuente MP1410CK002809", md: "Ronin-M", cat: "Otro", tg: T.estab, ob: "Con base de armado · 2 baterías (ambas infladas)" },

  // ── Dron / Ronin ──
  { n: "Dron DJI Mavic 3 Classic", mk: "DJI", sr: "Dron 2022AP11680 / Control SHAZK97001WR96 / Base 69DNL8C00100EW / Bat 4ERPL7CEA1EWEL / Bat 4ERPL7CEA1EWH6 / Bat 4ERPK81DA015L1", md: "Mavic 3 Classic", cat: "Otro", tg: T.dron, ob: "Estuche con filtros NDPL 8/16/32/64 · cargador base 3 baterías + 4 repuestos de hélices dobles" },
  { n: "Kit estabilizador DJI Ronin-S RS1", mk: "DJI", sr: "0EMDG4C00D00YM", md: "Ronin-S RS1", cat: "Otro", tg: T.estab, ob: "Sirve" },
  { n: "Kit estabilizador DJI Ronin-S RS1", mk: "DJI", sr: "142XFAL5520D0V", md: "Ronin-S RS1", cat: "Otro", tg: T.estab, st: "Dañado", ob: "NO SIRVE · serial en el mango" },
  { n: "Estabilizador DJI RS2 PRO + 3D Focus", mk: "DJI", sr: "Ronin 3N6AK16R0C0024 / 3D Focus 3TCCK3600101TP", md: "RS2 PRO + 3D Focus", cat: "Otro", tg: T.estab },
  { n: "Monitor Atomos Ninja V", mk: "ATOMOS", sr: "D1794NJV55D15", md: "Ninja V", cat: "Otro", tg: T.trans, ob: "Fuente, HDMI y adaptador de batería en la misma caja" },
  { n: "Switch MikroTik CRS305", mk: "MikroTik", sr: "AB5B0A85B874/914", md: "CRS305-1G-4S+IN", cat: "Streaming", tg: T.trans },
  { n: "Cast Atomos AtomX", mk: "ATOMOS", sr: "K2A9NJCT55H94", md: "AtomX", cat: "Streaming", tg: T.trans },
  { n: "Monitor Feelworld F6 Plus", mk: "FEELWORLD", sr: "F6P22115755", md: "F6 Plus", cat: "Otro", tg: T.trans, ob: "Monitor, soporte, marco y HDMI a micro HDMI en la caja" },
  { n: "Switcher TP-Link TL-SG3210", mk: "TP-Link", sr: "222A1B7001414", md: "TL-SG3210", cat: "Streaming", tg: T.trans },
  { n: "Micro convertidor Blackmagic SDI/HDMI 3G", mk: "Blackmagic", sr: "8313675", md: "BiDirectional SDI/HDMI 3G", cat: "Streaming", tg: T.trans, ob: "Parte del kit de transmisión (3 micro USB, 1 USB-C, 1 USB-C a USB-C)" },
  { n: "Micro convertidor Blackmagic SDI/HDMI 3G", mk: "Blackmagic", sr: "9640660", md: "BiDirectional SDI/HDMI 3G", cat: "Streaming", tg: T.trans, ob: "Parte del kit de transmisión" },

  // ── Transmisión ──
  { n: "Monitor Lilliput FS7", mk: "LILLIPUT", sr: "FS7B635710877", md: "FS7 7\"", cat: "Otro", tg: T.trans },
  { n: "Micro convertidor Blackmagic HDMI a SDI", mk: "Blackmagic", sr: "4228722", md: "HDMI to SDI", cat: "Streaming", tg: T.trans, ob: "Parte del kit de transmisión" },
  { n: "Rack de transmisión ATEM 4K + RMX 6", mk: "Blackmagic", sr: "Mezclador audio 851708227 / Mezclador video 1373002", md: "ATEM 4K + RMX 6 Nady", cat: "Streaming", tg: T.trans, ob: "Rack: RMX 6 Nady Audio, ATEM 4K Blackmagic, patch panel coaxial 18 puertos, regleta CyberPower 6 puertos" },
  { n: "Celular Teleprompter OnePlus 8 Pro", mk: "OnePlus", sr: "b09d31b7", md: "IN2023 (8 Pro)", cat: "Otro", tg: ["transmision"], ob: "En la caja del Teleprompter" },
  { n: "Control de Teleprompter Padcaster BRC-100", mk: "PADCASTER", sr: "GM8BRC100", md: "BRC-100", cat: "Otro", tg: ["transmision"], ob: "En la caja del Teleprompter" },
  { n: "Follow Focus CAME-TV MA-W1", mk: "CAME-TV", sr: "00222", md: "MA-W1", cat: "Otro", tg: T.video, ob: "Receptor de enfoque, controlador de lente y demás partes" },
  { n: "Sistema de transmisión Hollyland Mars 400S PRO", mk: "Hollyland", sr: "Recep 002128R E005AE9 / Trans 002128T E0056F3", md: "Mars 400S PRO", cat: "Streaming", tg: T.trans, ob: "Fuente, cables cortos HDMI y SDI, 4 antenas" },
  { n: "Teleprompter Padcaster Parrot", mk: "PADCASTER", sr: "", md: "Parrot Teleprompter", cat: "Otro", tg: ["transmision"] },
  { n: "Fuente directa EDAC EA11011D-120", mk: "EDAC", sr: "EA11011D-120 (D03)", md: "EA11011D-120", cat: "Otro", tg: [] },
  { n: "Cámara Blackmagic URSA 4K v2", mk: "Blackmagic", sr: "2215706", md: "URSA 4K v2", cat: "Cámara", tg: T.cam },

  // ── Video ──
  { n: "Cámara Blackmagic Pocket Cinema 4K", mk: "Blackmagic", sr: "QOQBGM113", md: "Pocket Cinema Camera 4K", cat: "Cámara", tg: T.cam, ob: "Tiene case/soporte" },
  { n: "Fuente directa EDAC EA11011D-120", mk: "EDAC", sr: "EA11011D-120 (19)", md: "EA11011D-120", cat: "Otro", tg: [] },
  { n: "Adaptador de lentes Metabones EF a M43", mk: "Metabones", sr: "3014016862", md: "MB_SPEF-M43-BT4", cat: "Lente", tg: T.lente, ob: "Puesto en la cámara Pocket" },
  { n: "Kit cargador de batería Pocket (Labstream)", mk: "Labstream", sr: "", md: "—", cat: "Otro", tg: T.video, ob: "Hecho por Labstream, funcional: fuente, cable de poder y adaptador" },
  { n: "Cámara Blackmagic URSA Mini Pro 4.6K G1", mk: "Blackmagic", sr: "3774278", md: "URSA Mini Pro 4.6K G1", cat: "Cámara", tg: T.cam, ob: "Tiene case/soporte" },
  { n: "Baterías URSA (Wasabi) + accesorios", mk: "Wasabi", sr: "cm-170717B1145", md: "—", cat: "Otro", tg: T.video, ob: "Partes URSA: batería Wasabi, mango SmallRig y mando con control de video" },
];

function slugId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type Opt = { id: string; label: string; color: string };

// Importa el inventario inicial. Devuelve cuántos se crearon y cuántos se omitieron.
export async function importInitialInventory(): Promise<{ created: number; skipped: number }> {
  const tableId = await getInventoryTableId();
  await ensureInventoryQuantityColumn(tableId);

  // Asegura columnas extra (Modelo, Notas) si faltan.
  const want: { name: string; type: string }[] = [
    { name: "Modelo", type: "TEXT" },
    { name: "Notas", type: "LONGTEXT" },
  ];
  for (const w of want) {
    const exists = await db.dataColumn.findFirst({ where: { tableId, name: w.name }, select: { id: true } });
    if (!exists) {
      const count = await db.dataColumn.count({ where: { tableId } });
      await db.dataColumn.create({ data: { tableId, name: w.name, type: w.type as never, position: count } });
    }
  }

  const columns = await db.dataColumn.findMany({ where: { tableId } });
  const colByName: Record<string, (typeof columns)[number]> = Object.fromEntries(columns.map((c) => [c.name, c]));

  // Helper: garantiza que una opción (por etiqueta) exista en una columna SELECT/MULTISELECT.
  // Devuelve el id de la opción. Persiste los cambios al final por columna.
  const dirty = new Set<string>();
  const optionsByCol: Record<string, Opt[]> = {};
  for (const c of columns) optionsByCol[c.id] = ((c.options as Opt[] | null) ?? []).slice();
  function optionId(colName: string, label: string, color = "slate"): string {
    const col = colByName[colName];
    if (!col) return label;
    const opts = optionsByCol[col.id];
    const found = opts.find((o) => o.label.toLowerCase() === label.toLowerCase());
    if (found) return found.id;
    const id = slugId(label);
    opts.push({ id, label, color });
    dirty.add(col.id);
    return id;
  }

  // Pre-resuelve los ids (esto puede marcar columnas como dirty).
  const prepared = ITEMS.map((it) => ({
    it,
    marcaId: it.mk ? optionId("Marca", it.mk) : null,
    catId: optionId("Categoría", it.cat, "blue"),
    estadoId: optionId("Estado", it.st ?? "Operativo", "emerald"),
    tagIds: it.tg.map((t) => optionId("Tags", t, "violet")),
  }));

  // Persiste las opciones nuevas de cada columna afectada.
  for (const colId of dirty) {
    await db.dataColumn.update({ where: { id: colId }, data: { options: optionsByCol[colId] as never } });
  }

  // Índice de lo que ya existe (para idempotencia): serial → true, nombre → true.
  const nombreCol = colByName["Nombre"];
  const serialCol = colByName["Serial"];
  const existingRows = await db.dataRow.findMany({ where: { tableId }, include: { cells: true } });
  const existingSerials = new Set<string>();
  const existingNames = new Set<string>();
  for (const r of existingRows) {
    const s = r.cells.find((c) => c.columnId === serialCol?.id)?.value;
    const n = r.cells.find((c) => c.columnId === nombreCol?.id)?.value;
    if (typeof s === "string" && s.trim()) existingSerials.add(s.trim());
    if (typeof n === "string" && n.trim()) existingNames.add(n.trim());
  }

  let created = 0, skipped = 0;
  let position = await db.dataRow.count({ where: { tableId } });

  for (const p of prepared) {
    const { it } = p;
    const key = it.sr && it.sr.trim() ? it.sr.trim() : it.n;
    const dup = it.sr && it.sr.trim() ? existingSerials.has(key) : existingNames.has(key);
    if (dup) { skipped++; continue; }

    const cellData: { columnId: string; value: unknown }[] = [];
    const set = (colName: string, value: unknown) => { const c = colByName[colName]; if (c && value != null && value !== "") cellData.push({ columnId: c.id, value: value as never }); };
    set("Nombre", it.n);
    set("Serial", it.sr);
    set("Modelo", it.md);
    if (p.marcaId) set("Marca", p.marcaId);
    set("Categoría", p.catId);
    if (p.tagIds.length) set("Tags", p.tagIds);
    set("Estado", p.estadoId);
    set("Cantidad", it.q ?? 1);
    set("Notas", it.ob);

    await db.dataRow.create({
      data: { tableId, position: position++, cells: { create: cellData.map((c) => ({ columnId: c.columnId, value: c.value as never })) } },
    });
    created++;
    if (it.sr && it.sr.trim()) existingSerials.add(key); else existingNames.add(key);
  }

  return { created, skipped };
}
