import { NextResponse, type NextRequest } from "next/server";
import zlib from "node:zlib";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { readBuffer } from "@/lib/storage";
import { readOps } from "@/lib/nas-ops";
import { resolveReviewToken } from "@/lib/review-token";
import { rateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Descargar ORIGINALES del set, por tandas o completo (ZIP en streaming) ──
// Dos entradas, un mismo paquete:
//  · EQUIPO (sesión + acceso al proyecto): baja de un golpe lo que el cliente eligió —o el
//    filtro que sea— para llevarlo a Lightroom, en vez de foto por foto. Ve todos los filtros.
//  · CLIENTE (token de su sala, sin cuenta): baja SUS fotos —todas las que ve, o las que
//    marcó— desde la galería. Nunca toca lo que la curaduría excluyó, y solo si el set ya está
//    de cara a él.
// El ZIP se arma SIN comprimir (método store): un JPEG no vuelve a comprimir, y así el armado
// es puro streaming — en memoria vive UNA foto a la vez, nunca el paquete entero.
// Las fotos por ENLACE (Drive) no se pueden empacar; se listan en un OMITIDAS.txt dentro del
// ZIP para que la caja diga la verdad.

const QUE = new Set(["todo", "cliente", "excluidas", "elegidas", "comentadas"]);
// Lo que el CLIENTE puede pedir: nunca «todo» (incluye excluidas) ni «excluidas».
const QUE_CLIENTE = new Set(["cliente", "elegidas", "comentadas"]);
// El set tiene que estar de cara al cliente para que baje nada: material sin enviar no se filtra.
const DE_CARA_AL_CLIENTE = new Set(["ENVIADO_CLIENTE", "CORRECCIONES", "APROBADO", "ENTREGADO"]);
const MAX_FOTOS = 1000; // sin zip64: techo holgado y honesto
const MAX_BYTES = 3_800_000_000; // ~3,8 GB — por debajo del límite de zip clásico

// Tope GLOBAL de ZIPs en vuelo: cada stream vivo mantiene UNA foto entera en memoria (hasta
// ~100 MB con RAW de 5Ds) más un lector contra el bind mount. El rate-limit es por enlace;
// esto acota el MULTIPLICADOR (cliente + pareja + equipo bajando a la vez) en el NAS.
let zipsEnVuelo = 0;
const MAX_ZIPS_EN_VUELO = 3;

const PROJECT_ACCESS_SELECT = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
} as const;

// Fecha/hora en el formato DOS que pide el ZIP clásico.
function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

type Entrada = { nameBytes: Buffer; crc: number; size: number; offset: number; time: number; date: number };

function localHeader(nameBytes: Buffer, crc: number, size: number, t: { time: number; date: number }): Buffer {
  const b = Buffer.alloc(30 + nameBytes.length);
  b.writeUInt32LE(0x04034b50, 0);
  b.writeUInt16LE(20, 4); // versión
  b.writeUInt16LE(0x0800, 6); // flags: nombres UTF-8
  b.writeUInt16LE(0, 8); // método: store
  b.writeUInt16LE(t.time, 10);
  b.writeUInt16LE(t.date, 12);
  b.writeUInt32LE(crc >>> 0, 14);
  b.writeUInt32LE(size, 18); // comprimido = original (store)
  b.writeUInt32LE(size, 22);
  b.writeUInt16LE(nameBytes.length, 26);
  b.writeUInt16LE(0, 28); // extra
  nameBytes.copy(b, 30);
  return b;
}

function centralDirectory(entradas: Entrada[], offsetFin: number): Buffer {
  const partes: Buffer[] = [];
  for (const e of entradas) {
    const b = Buffer.alloc(46 + e.nameBytes.length);
    b.writeUInt32LE(0x02014b50, 0);
    b.writeUInt16LE(20, 4); // hecha por
    b.writeUInt16LE(20, 6); // requiere
    b.writeUInt16LE(0x0800, 8);
    b.writeUInt16LE(0, 10); // store
    b.writeUInt16LE(e.time, 12);
    b.writeUInt16LE(e.date, 14);
    b.writeUInt32LE(e.crc >>> 0, 16);
    b.writeUInt32LE(e.size, 20);
    b.writeUInt32LE(e.size, 24);
    b.writeUInt16LE(e.nameBytes.length, 28);
    b.writeUInt32LE(0, 30); // extra+comment
    b.writeUInt32LE(0, 34); // disco + atributos internos
    b.writeUInt32LE(0, 38); // atributos externos
    b.writeUInt32LE(e.offset, 42);
    e.nameBytes.copy(b, 46);
    partes.push(b);
  }
  const cd = Buffer.concat(partes);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entradas.length, 8);
  eocd.writeUInt16LE(entradas.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offsetFin, 16);
  return Buffer.concat([cd, eocd]);
}

// Nombre seguro dentro del ZIP (sección como carpeta) con desempate de repetidos.
function nombreZip(usados: Set<string>, section: string | null, filename: string): string {
  // Ademas de quitar separadores (/ \\) y caracteres ilegales, se ELIMINAN los puntos iniciales:
  // sin esto, una seccion «..» produciria «../» y un descompresor permisivo escribiria FUERA de la
  // carpeta destino en el equipo del CLIENTE (Zip Slip). La seccion es texto libre del equipo.
  const limpia = (s: string) => s.replace(/[/\\:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").trim();
  const dirLimpio = section ? limpia(section) : "";
  const dir = dirLimpio ? `${dirLimpio}/` : "";
  const base = limpia(filename) || "foto.jpg";
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  for (let i = 0; i < 500; i++) {
    const candidato = `${dir}${i === 0 ? base : `${stem} (${i + 1})${ext}`}`;
    if (!usados.has(candidato)) {
      usados.add(candidato);
      return candidato;
    }
  }
  const candidato = `${dir}${stem}-${Math.random().toString(36).slice(2, 7)}${ext}`;
  usados.add(candidato);
  return candidato;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ deliverableId: string }> }) {
  const { deliverableId } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t");

  // ── Quién baja: cliente por token de su sala, o miembro del equipo con sesión ──
  let esCliente = false;
  if (token) {
    const resolved = resolveReviewToken(token);
    // El token tiene que ser el OFICIAL (no el de borrador) y de ESTE mismo set.
    if (!resolved || resolved.deliverableId !== deliverableId || resolved.mode !== "final") {
      return NextResponse.json({ error: "Enlace de descarga no válido." }, { status: 401 });
    }
    // Un GET de descarga no se puede limitar como una acción, pero sí frenar el abuso por enlace.
    if (!rateLimit(`fotos-zip:${token.slice(0, 40)}`, 8, 60_000)) {
      return NextResponse.json({ error: "Demasiadas descargas seguidas. Espera un momento." }, { status: 429 });
    }
    esCliente = true;
  } else {
    const session = await getSession();
    if (!session || session.role === "cliente" || session.role === "demo") {
      return NextResponse.json({ error: "Descarga del equipo: entra con tu cuenta." }, { status: 401 });
    }
  }

  // El filtro por defecto y los permitidos dependen de quién baja.
  let que = url.searchParams.get("que") ?? (esCliente ? "cliente" : "todo");
  if (esCliente) {
    if (!QUE_CLIENTE.has(que)) que = "cliente"; // el cliente jamás pide «todo»/«excluidas»
  } else if (!QUE.has(que)) {
    return NextResponse.json({ error: "Filtro desconocido" }, { status: 400 });
  }

  const set = await db.deliverable.findUnique({
    where: { id: deliverableId },
    select: {
      name: true,
      type: true,
      status: true,
      projectId: true,
      reviewRevokedAt: true,
      reviewExpiresAt: true,
      project: { select: { ...PROJECT_ACCESS_SELECT, archivedAt: true } },
      photos: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          filename: true, section: true, pick: true, clientNote: true, excludedAt: true,
          fileAsset: { select: { kind: true, path: true, size: true } },
        },
      },
    },
  });
  if (!set || set.type !== "FOTOGRAFIA") return NextResponse.json({ error: "Set no encontrado" }, { status: 404 });
  if (esCliente) {
    // El token autoriza ESTE set (ya verificado), pero el proyecto en papelera o el set aún sin
    // enviar cierran la puerta: material dormido o sin aprobar no se descarga por el enlace.
    if (set.project.archivedAt) return NextResponse.json({ error: "Este material ya no está disponible." }, { status: 403 });
    // Espejo de resolveDeliverable (actions.ts): revocar o vencer el enlace corta TAMBIÉN la
    // descarga — antes el ZIP (justo lo más valioso) ignoraba ambos y un enlace filtrado
    // seguía bajando originales para siempre.
    if (set.reviewRevokedAt) return NextResponse.json({ error: "Este enlace ya no está disponible." }, { status: 403 });
    if (set.reviewExpiresAt && set.reviewExpiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "El enlace ha caducado. Escríbenos y lo reactivamos." }, { status: 403 });
    }
    if (!DE_CARA_AL_CLIENTE.has(set.status)) return NextResponse.json({ error: "Tus fotos aún no están listas para descargar." }, { status: 403 });
  } else {
    const session = await getSession();
    if (!session || !canAccessProject(set.project, session)) return NextResponse.json({ error: "Sin acceso al proyecto" }, { status: 403 });
  }

  // El cliente NUNCA ve lo excluido por la curaduría (defensa aparte de que sus filtros ya lo
  // evitan): se recorta antes de aplicar el filtro pedido.
  const universo = esCliente ? set.photos.filter((p) => !p.excludedAt) : set.photos;
  const filtradas = universo.filter((p) => {
    if (que === "cliente") return !p.excludedAt;
    if (que === "excluidas") return !!p.excludedAt;
    if (que === "elegidas") return p.pick === "ME_GUSTA";
    if (que === "comentadas") return !!(p.clientNote ?? "").trim();
    return true;
  });
  const empacables = filtradas.filter((p) => p.fileAsset?.path && (p.fileAsset.kind === "OPS" || p.fileAsset.kind === "LOCAL"));
  const omitidas = filtradas.filter((p) => !empacables.includes(p));
  if (empacables.length === 0) return NextResponse.json({ error: "No hay originales descargables con ese filtro." }, { status: 404 });
  if (empacables.length > MAX_FOTOS) {
    return NextResponse.json({ error: `Son ${empacables.length} fotos y el ZIP clásico llega a ${MAX_FOTOS}. Baja por tandas con los filtros.` }, { status: 413 });
  }
  const totalEstimado = empacables.reduce((a, p) => a + (p.fileAsset?.size ?? 0), 0);
  if (totalEstimado > MAX_BYTES) {
    return NextResponse.json({ error: `El paquete pesaría ~${Math.round(totalEstimado / 1e9)} GB y el ZIP clásico llega a ~3,8 GB. Baja por tandas con los filtros.` }, { status: 413 });
  }

  // Quién descargó, para la actividad: el equipo con su id; el cliente por enlace, sin id.
  const quien = esCliente ? null : (await getSession())?.id ?? null;
  await logActivity({
    action: "file.download",
    summary: esCliente
      ? `el cliente descargó ${empacables.length} de sus fotos del set «${set.name}» (${que})`
      : `descargó ${empacables.length} original(es) del set «${set.name}» (ZIP · ${que})`,
    projectId: set.projectId,
    entityType: "deliverable",
    entityId: deliverableId,
    userId: quien,
    actorName: esCliente ? "Cliente (enlace)" : undefined,
    silent: true,
  }).catch(() => {});

  if (zipsEnVuelo >= MAX_ZIPS_EN_VUELO) {
    return NextResponse.json(
      { error: "Hay varias descargas en curso. Espera un momento y vuelve a intentar." },
      { status: 503, headers: { "retry-after": "20" } },
    );
  }
  zipsEnVuelo++;
  let plazaLiberada = false;
  const liberarPlaza = () => {
    if (!plazaLiberada) {
      plazaLiberada = true;
      zipsEnVuelo = Math.max(0, zipsEnVuelo - 1);
    }
  };

  const ahora = dosTime(new Date());
  const usados = new Set<string>();
  const entradas: Entrada[] = [];
  let offset = 0;

  // Generador → ReadableStream con pull(): el siguiente archivo se LEE cuando el cliente ya se
  // llevó el anterior (contrapresión de verdad). En memoria vive una foto a la vez; con
  // enqueue-en-start, un navegador lento acumulaba el paquete entero en la cola del stream.
  async function* trozos(): AsyncGenerator<Uint8Array> {
    for (const p of empacables) {
      const fa = p.fileAsset!;
      let buf: Buffer;
      try {
        buf = fa.kind === "OPS" ? await readOps(fa.path!) : await readBuffer(fa.path!);
      } catch {
        omitidas.push(p); // desapareció del disco entre listar y leer: a la lista de omitidas
        continue;
      }
      const nameBytes = Buffer.from(nombreZip(usados, p.section, p.filename), "utf8");
      const crc = zlib.crc32(buf) >>> 0;
      const header = localHeader(nameBytes, crc, buf.length, ahora);
      entradas.push({ nameBytes, crc, size: buf.length, offset, time: ahora.time, date: ahora.date });
      offset += header.length + buf.length;
      yield new Uint8Array(header);
      yield new Uint8Array(buf);
    }
    if (omitidas.length) {
      const texto = Buffer.from(
        "Estas fotos del filtro no se pudieron empacar (viven como enlace de Drive, o el archivo no estaba en el disco):\n\n" +
          omitidas.map((p) => `- ${p.filename}${p.section ? ` (${p.section})` : ""}`).join("\n") + "\n",
        "utf8",
      );
      const nameBytes = Buffer.from("OMITIDAS.txt", "utf8");
      const crc = zlib.crc32(texto) >>> 0;
      const header = localHeader(nameBytes, crc, texto.length, ahora);
      entradas.push({ nameBytes, crc, size: texto.length, offset, time: ahora.time, date: ahora.date });
      offset += header.length + texto.length;
      yield new Uint8Array(header);
      yield new Uint8Array(texto);
    }
    yield new Uint8Array(centralDirectory(entradas, offset));
  }

  const iter = trozos();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iter.next();
        if (done) {
          liberarPlaza();
          controller.close();
        } else controller.enqueue(value);
      } catch (e) {
        liberarPlaza();
        controller.error(e);
      }
    },
    cancel() {
      liberarPlaza();
      void iter.return?.(undefined);
    },
  });

  const nombre = `${set.name.replace(/[/\\:*?"<>|\u0000-\u001f]+/g, " ").trim() || "fotos"} - ${que}.zip`;
  return new NextResponse(stream, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "cache-control": "no-store",
    },
  });
}
