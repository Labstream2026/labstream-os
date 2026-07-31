import { NextResponse, type NextRequest } from "next/server";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { galeriaSession } from "@/lib/galeria-access";
import { resolveGaleriaFile, normalizeGaleriaRel } from "@/lib/nas-galeria";
import { mimeFor, isInlineSafeMime } from "@/lib/storage";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sirve una pieza de la galería DESDE NUESTRO PROPIO ORIGEN, con HTTP Range, para que el
// <video> reproduzca y busque de verdad. Mismo principio que la sala de revisión: el medio
// nunca viaja por un iframe ajeno.
//
// ?copia=1 → la copia ligera que fabricó LabTem (lo que se ve al reproducir).
// ?descargar=1 → el original, como adjunto.
// Si se pide la copia y todavía no existe, se cae al original en vez de dar error: el cliente
// verá algo, aunque pese más.
export async function GET(req: NextRequest) {
  const session = await galeriaSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });

  const url = new URL(req.url);
  let rel: string;
  try {
    rel = normalizeGaleriaRel(url.searchParams.get("rel") || "");
  } catch {
    return new NextResponse("Ruta inválida", { status: 400 });
  }
  if (!rel) return new NextResponse("Ruta inválida", { status: 400 });

  const quiereDescargar = Boolean(url.searchParams.get("descargar"));

  // ── TRANSCODIFICACIÓN EN VIVO ──────────────────────────────────────────────────────────
  // `?vivo=info`, `?vivo=1080&desde=90` y el HLS en vivo para iOS (`?vivohls=`). Desde que no
  // hay copias pregeneradas, así es como la galería interna reproduce lo que el navegador no
  // decodifica solo. Mismo permiso que la pieza (la sesión de arriba ya pasó).
  const vivoParam = url.searchParams.get("vivo");
  if (vivoParam && !quiereDescargar) {
    const { vivoInfo, vivoChorro, cabecerasVivo, vivoConfigurado, originalApto, esCalidadViva } = await import("@/lib/labtem-vivo");
    if (!vivoConfigurado()) return new NextResponse("Sin servicio de conversión en vivo", { status: 503 });

    if (vivoParam === "info") {
      const info = await vivoInfo(rel);
      return Response.json(
        info ? { ...info, directo: originalApto(rel, info) } : { gpu: false, calidades: [] },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const calidad = Number(vivoParam);
    if (!esCalidadViva(calidad)) return new NextResponse("Calidad no admitida", { status: 400 });
    const desde = Number(url.searchParams.get("desde") || 0);
    const arriba = await vivoChorro(rel, calidad, desde, req.signal);
    if (!arriba) return new NextResponse("LabTem no responde", { status: 502 });
    if (!arriba.ok || !arriba.body) {
      return new NextResponse(await arriba.text().catch(() => "No disponible"), {
        status: arriba.status,
        headers: arriba.headers.get("retry-after") ? { "Retry-After": arriba.headers.get("retry-after")! } : undefined,
      });
    }
    return new NextResponse(arriba.body, {
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...cabecerasVivo(arriba.headers),
      },
    });
  }

  const vivoHlsParam = url.searchParams.get("vivohls");
  if (vivoHlsParam && !quiereDescargar) {
    const { vivoHls, esCalidadViva, vivoConfigurado } = await import("@/lib/labtem-vivo");
    if (!vivoConfigurado()) return new NextResponse("Sin servicio de conversión en vivo", { status: 503 });
    const cal = Number(url.searchParams.get("cal"));
    if (!esCalidadViva(cal)) return new NextResponse("Calidad no admitida", { status: 400 });

    if (vivoHlsParam === "lista") {
      const arriba = await vivoHls(rel, cal, null, req.signal);
      if (!arriba) return new NextResponse("LabTem no responde", { status: 502 });
      if (!arriba.ok) {
        return new NextResponse(await arriba.text().catch(() => "No disponible"), {
          status: arriba.status,
          headers: arriba.headers.get("retry-after") ? { "Retry-After": arriba.headers.get("retry-after")! } : undefined,
        });
      }
      // Los trozos vienen como nombres pelados: se reescriben a esta misma ruta (la sesión
      // interna viaja en la cookie, así que no hace falta token).
      const texto = await arriba.text();
      const base = `${url.pathname}?rel=${encodeURIComponent(rel)}&vivohls=trozo&cal=${cal}&seg=`;
      const reescrito = texto
        .split("\n")
        .map((linea) => {
          const s = linea.trim();
          return !s || s.startsWith("#") ? linea : base + encodeURIComponent(s);
        })
        .join("\n");
      return new NextResponse(reescrito, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "private, no-store",
        },
      });
    }

    const seg = url.searchParams.get("seg") || "";
    if (!/^seg\d{3,5}\.ts$/.test(seg)) return new NextResponse("Trozo inválido", { status: 400 });
    const arriba = await vivoHls(rel, cal, seg, req.signal);
    if (!arriba) return new NextResponse("LabTem no responde", { status: 502 });
    if (!arriba.ok || !arriba.body) {
      return new NextResponse(await arriba.text().catch(() => "No disponible"), { status: arriba.status });
    }
    return new NextResponse(arriba.body, {
      headers: {
        "Content-Type": "video/mp2t",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  // Al descargar mandamos SIEMPRE el original: es lo que el cliente ha venido a buscar.
  const preferProxy = !quiereDescargar && Boolean(url.searchParams.get("copia"));

  const file = await resolveGaleriaFile(rel, preferProxy);
  if (!file) return new NextResponse("No encontrado", { status: 404 });

  const name = rel.split("/").pop() || "archivo";
  const contentType = mimeFor(file.name);
  const inline = !quiereDescargar && (isInlineSafeMime(contentType) || contentType.startsWith("video/") || contentType.startsWith("image/"));

  // Auditoría: solo al abrir, no en cada trozo Range, y solo lo que de verdad es una descarga.
  const rangeHeader = req.headers.get("range");
  if (quiereDescargar && (!rangeHeader || /^bytes=0-/.test(rangeHeader))) {
    logActivity({
      action: "file.download",
      summary: `descargó «${name}» de la galería de entregas`,
      entityType: "galeria",
      entityId: rel,
      userId: session.id,
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
