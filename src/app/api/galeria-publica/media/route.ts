import { NextResponse, type NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { resolverEntrega } from "@/lib/galeria-entrega";
import { resolveGaleriaFile, normalizeGaleriaRel } from "@/lib/nas-galeria";
import { mimeFor, isInlineSafeMime } from "@/lib/storage";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sirve una pieza al CLIENTE, sin cuenta, desde nuestro propio origen y con HTTP Range, para
// que el <video> reproduzca y busque de verdad (iOS Safari ni siquiera arranca sin Range).
//
// ?copia=1 → la copia ligera que fabricó LabTem (lo que se ve al reproducir).
// ?descargar=1 → el original, como adjunto.
// Si se pide la copia y todavía no existe, se cae al original en vez de dar error.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const entrega = await resolverEntrega(url.searchParams.get("t") || "");
  if (!entrega.ok) return new NextResponse("No autorizado", { status: 401 });

  let rel: string;
  let carpeta: string;
  try {
    rel = normalizeGaleriaRel(url.searchParams.get("rel") || "");
    carpeta = normalizeGaleriaRel(entrega.folderRel);
  } catch {
    return new NextResponse("Ruta inválida", { status: 400 });
  }
  if (!rel) return new NextResponse("Ruta inválida", { status: 400 });

  // ESTE es el candado de la sala. El token dice UNA carpeta; el navegador dice el archivo.
  // Sin esta comprobación, un cliente con un enlace bueno se lleva el material de cualquier
  // otro cambiando `rel` a mano.
  if (!dentroDeLaEntrega(carpeta, rel)) return new NextResponse("Prohibido", { status: 403 });

  const quiereDescargar = Boolean(url.searchParams.get("descargar"));
  // Al descargar mandamos SIEMPRE el original: es lo que el cliente ha venido a buscar.
  const preferProxy = !quiereDescargar && Boolean(url.searchParams.get("copia"));

  const file = await resolveGaleriaFile(rel, preferProxy);
  if (!file) return new NextResponse("No encontrado", { status: 404 });

  const name = rel.split("/").pop() || "archivo";
  const contentType = mimeFor(file.name);
  const inline = !quiereDescargar && (isInlineSafeMime(contentType) || contentType.startsWith("video/") || contentType.startsWith("image/"));

  // Auditoría: solo al abrir, no en cada trozo Range, y solo lo que de verdad es una descarga.
  // No hay userId —nadie ha iniciado sesión—, así que el autor queda con nombre y la IP, que es
  // todo el rastro que deja un enlace firmado.
  const rangeHeader = req.headers.get("range");
  if (quiereDescargar && (!rangeHeader || /^bytes=0-/.test(rangeHeader))) {
    logActivity({
      action: "file.download",
      summary: `descargó «${name}» de la entrega «${entrega.titulo}»`,
      entityType: "galeria",
      entityId: rel,
      userId: null,
      actorName: "El cliente (enlace de entrega)",
      ip: clientIp(req),
      meta: { entrega: carpeta },
      silent: true,
    }).catch(() => {});
  }

  const size = file.size;
  const baseHeaders: Record<string, string> = {
    "Content-Type": inline ? contentType : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  };

  const m = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  if (m && size > 0) {
    let start: number;
    let end: number;
    if (!m[1] && m[2]) {
      // Rango sufijo («bytes=-N»): los ÚLTIMOS N bytes. Un MP4 sin faststart guarda ahí su
      // índice, y el navegador lo pide así antes de poder reproducir nada.
      const n = parseInt(m[2], 10);
      if (!Number.isFinite(n) || n <= 0) {
        return new NextResponse("Rango no satisfacible", { status: 416, headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" } });
      }
      start = Math.max(0, size - n);
      end = size - 1;
    } else {
      start = m[1] ? parseInt(m[1], 10) : 0;
      end = m[2] ? parseInt(m[2], 10) : size - 1;
      if (!Number.isFinite(start) || start < 0) start = 0;
      if (!Number.isFinite(end) || end >= size) end = size - 1;
    }
    if (start > end || start >= size) {
      return new NextResponse("Rango no satisfacible", { status: 416, headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" } });
    }
    const stream = Readable.toWeb(createReadStream(file.abs, { start, end })) as unknown as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: { ...baseHeaders, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  const stream = Readable.toWeb(createReadStream(file.abs)) as unknown as ReadableStream;
  return new NextResponse(stream, { status: 200, headers: { ...baseHeaders, "Content-Length": String(size) } });
}

// ¿La pieza pedida cuelga de la carpeta que autoriza el token?
//
// Se compara SEGMENTO A SEGMENTO a propósito. Con un `startsWith` pelado, un token para
// «boda-lopez» abriría también «boda-lopez-2», que es la entrega de otro cliente; y un token
// para «acme» abriría «acme-privado». El separador tiene que caer donde toca.
function dentroDeLaEntrega(carpeta: string, rel: string): boolean {
  if (!carpeta || !rel) return false; // un token sin carpeta no autoriza nada
  const base = carpeta.split("/");
  const pieza = rel.split("/");
  if (pieza.length <= base.length) return false; // la carpeta en sí no es una pieza servible
  return base.every((seg, i) => seg === pieza[i]);
}

// IP del cliente (best-effort) para el rastro de auditoría del enlace.
function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}
