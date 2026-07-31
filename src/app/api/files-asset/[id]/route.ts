import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject, PROJECT_ACCESS_SELECT } from "@/lib/project-access";
import { absPath, verifyFileToken, mimeFor, isInlineSafeMime } from "@/lib/storage";
import { previewRel } from "@/lib/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_EXT = /\.(mp4|m4v|mov|mkv|ogv|webm)$/i;

// Sirve un archivo LOCAL de proyecto (FileAsset). Acceso: token firmado (Document Server de
// OnlyOffice / reproductor de revisión, sin cookie) o usuario con sesión y acceso al proyecto.
// Soporta HTTP Range (206) para que el <video> del reproductor reproduzca y busque —iOS Safari
// EXIGE Range para reproducir vídeo, y sin reproducción no hay fotograma que capturar—.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t");

  const file = await db.fileAsset.findUnique({
    where: { id },
    select: { name: true, path: true, mime: true, kind: true, deletedAt: true, projectId: true, project: { select: PROJECT_ACCESS_SELECT } },
  });
  // En la papelera = no existe para quien pida el archivo, aunque tenga el enlace o el token
  // firmado. Los bytes siguen ahí 30 días por si hay que restaurarlo, no para seguir sirviéndolos.
  if (!file || !file.path || file.deletedAt) return new NextResponse("No encontrado", { status: 404 });

  let viewer: { id: string } | null = null;
  if (!verifyFileToken(id, token)) {
    const session = await getSession();
    if (!session) return new NextResponse("No autorizado", { status: 401 });
    if (!canAccessProject(file.project, session)) return new NextResponse("Prohibido", { status: 403 });
    viewer = { id: session.id };
  } else {
    // Con token firmado puede venir el portal (sin cuenta) o alguien del equipo con cookie.
    const session = await getSession().catch(() => null);
    viewer = session ? { id: session.id } : null;
  }

  // Modo MINIATURA (?thumb=1): lo pide la cuadrícula de Archivos para pintar decenas de
  // celdas. No es una apertura del archivo → no se audita (sin esto, mirar la pestaña
  // escribía una línea de actividad por celda), y se permite caché privada del navegador.
  const isThumb = !!url.searchParams.get("thumb");

  // Auditoría de descargas/aperturas: una vez por archivo servido. Los saltos del <video>
  // (peticiones Range intermedias) no cuentan — solo la primera carga completa o byte 0.
  if (!isThumb) {
    const range = req.headers.get("range");
    if (!range || /^bytes=0-/.test(range)) {
      const { logActivity } = await import("@/lib/activity");
      logActivity({
        action: "file.download",
        summary: `abrió/descargó «${file.name}»`,
        projectId: file.projectId,
        entityType: "file",
        entityId: id,
        userId: viewer ? viewer.id : null,
        actorName: viewer ? undefined : "Enlace firmado (portal)",
        silent: true,
      }).catch(() => {});
    }
  }

  const wantInline = !url.searchParams.get("download");

  // Archivo VIVO de Operaciones_LAB (kind OPS): file.path es relativo al bind mount del NAS,
  // no al storage interno. Se sirve desde allá (con Range) y, para imágenes en línea, con la
  // miniatura cacheada (mismo trato que la preview WebP de los locales).
  if (file.kind === "OPS") {
    const { opsAbs, opsThumb } = await import("@/lib/nas-ops");
    let opsFile: string;
    try {
      opsFile = await opsAbs(file.path);
    } catch {
      return new NextResponse("Ruta inválida", { status: 400 });
    }
    const opsType = mimeFor(file.name, file.mime);
    const opsIsVideo = opsType.startsWith("video/") || VIDEO_EXT.test(file.name);
    if (wantInline && !opsIsVideo) {
      try {
        const webp = await opsThumb(file.path, isThumb ? 480 : 1600);
        if (webp) {
          return new NextResponse(new Uint8Array(webp), {
            headers: {
              "Content-Type": "image/webp",
              "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
              "X-Content-Type-Options": "nosniff",
              "Cache-Control": isThumb ? "private, max-age=3600, must-revalidate" : "private, no-store",
            },
          });
        }
      } catch {
        /* sin miniatura → sigue con el original */
      }
    }
    return serveDisk(req, opsFile, file.name, opsType, opsIsVideo, wantInline);
  }

  // Archivo VIVO de la galería de LabTem (kind GALERIA): file.path es relativo a
  // NAS_GALERIA_DIR. Para VER un video se prefiere la copia ligera H.264 que fabrica LabTem
  // con su iGPU (.proxy/<nombre>.mp4): reproduce al instante aunque el original sea un MXF o
  // ProRes de gigas. Para DESCARGAR (?download=1) siempre el original, byte a byte.
  if (file.kind === "GALERIA") {
    const { resolveGaleriaFile, galeriaThumb, galeriaKind } = await import("@/lib/nas-galeria");
    const galType = mimeFor(file.name, file.mime);
    // El tipo lo decide el CATÁLOGO de la galería, no la tabla MIME: un master .mxf/.braw sale
    // de mimeFor como application/* y la regex local tampoco lo conoce — con eso la sala de
    // revisión recibía el PÓSTER en vez del video y la copia ligera no se usaba nunca, que es
    // justo el caso para el que existe.
    const galIsVideo = galeriaKind(file.name) === "video";
    if (wantInline && !galIsVideo) {
      try {
        const webp = await galeriaThumb(file.path, 1600);
        if (webp) {
          return new NextResponse(new Uint8Array(webp), {
            headers: {
              "Content-Type": "image/webp",
              "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
              "X-Content-Type-Options": "nosniff",
              "Cache-Control": "private, no-store",
            },
          });
        }
      } catch {
        /* sin miniatura → sigue con el original */
      }
    }
    // ── DIAGNÓSTICO (?diag=1) ── Lo pide la sala cuando el reproductor ya falló. Sin esto, una
    // pieza del NAS caía en el consejo genérico «sube un export H.264 como nueva versión» — que
    // es EXACTAMENTE el trabajo manual que la fábrica de LabTem existe para evitar: ese H.264 lo
    // hace su GPU sola. Decirle al editor que lo haga a mano es mandarlo a repetir el trabajo
    // que la máquina ya tiene encargado.
    if (url.searchParams.get("diag") === "1" && galIsVideo) {
      const { galeriaAbs, proxyRelFor } = await import("@/lib/nas-galeria");
      const di = (motivo: string, mensaje: string, consejo: string) =>
        Response.json({ motivo, mensaje, consejo }, { headers: { "cache-control": "no-store" } });
      const copia = await galeriaAbs(proxyRelFor(file.path, "video"))
        .then((abs) => fs.stat(abs))
        .then((st) => st.isFile())
        .catch(() => false);
      if (copia) {
        return di(
          "formato",
          "El servidor sí tiene la copia ligera de esta pieza, y es la que te está sirviendo.",
          viewer
            ? "Entonces el problema no es el master: es este navegador con el video ya convertido. Prueba a recargar y, si sigue, ábrelo en otro navegador y avísanos."
            : "Prueba a recargar la página o a abrirla en otro navegador; si sigue igual, avísale al equipo.",
        );
      }
      const original = await resolveGaleriaFile(file.path, false);
      if (!original) {
        return di(
          "sin_archivo",
          "El archivo ya no está donde decía el disco.",
          viewer
            ? "Puede que lo movieran o renombraran por SMB. Vuelve a elegirlo desde «Desde el disco»."
            : "Avísale al equipo: el material se movió de sitio y hay que volver a enlazarlo.",
        );
      }
      // ── Antes de decir «espera», comprobar que la espera sirve de algo ──────────────────
      // Estos dos casos se presentaban igual que una pieza que simplemente aún tiene turno, y
      // el consejo era «vuelve más tarde con ↻ Reintentar». Pero aquí no va a llegar nunca:
      // mandar a esperar algo que no va a pasar es peor que no decir nada, porque el editor
      // deja de buscar la causa real.
      if (original.size === 0) {
        return di(
          "vacio",
          "El archivo está en el disco, pero no tiene contenido: pesa 0 bytes.",
          viewer
            ? "Es una copia al NAS que se cortó a medias. No hay nada que la fábrica pueda convertir —esperar no lo va a arreglar—: hay que volver a copiar el archivo."
            : "El material no llegó completo al servidor. Avísale al equipo para que lo vuelva a subir.",
        );
      }
      const { galeriaMotivoFallo } = await import("@/lib/nas-galeria");
      const motivo = await galeriaMotivoFallo(file.path);
      if (motivo) {
        return di(
          "fallo",
          viewer
            ? `La fábrica ya lo intentó y no pudo: «${motivo}».`
            : "Este video no se pudo preparar para verse en el navegador.",
          viewer
            ? "Esto NO se arregla solo esperando. Lo más común es un archivo que llegó a medias por SMB o con el índice a medio escribir (una grabación o una copia interrumpida): compruébalo abriéndolo en local. Si se abre bien, avísanos y lo reintentamos."
            : "No se resuelve solo. Avísale al equipo para que revise ese archivo.",
        );
      }

      // El mismo hecho, contado a quien corresponde: al equipo se le nombra la fábrica —le
      // sirve para saber que no tiene que hacer nada— y al cliente no, que la cocina de
      // adentro no es asunto suyo ni le ayuda a decidir.
      return di(
        "sin_copia",
        viewer
          ? "La copia ligera de esta pieza todavía no está hecha, y el master no lo decodifica el navegador."
          : "La versión optimizada de este video todavía se está preparando.",
        viewer
          ? "La fabrica la GPU de LabTem —va por orden y pasa sola cada noche—. No hace falta que subas nada a mano: cuando esté, pulsa «↻ Reintentar» y se verá. Mientras tanto puedes descargar el original."
          : "Se prepara sola. Vuelve a intentarlo en unos minutos con «↻ Reintentar»; si sigue igual, avísale al equipo.",
      );
    }

    // ── Un trozo de la ESCALERA ADAPTATIVA ──────────────────────────────────────────────
    // `?hls=master.m3u8`, `?hls=v0/index.m3u8`, `?hls=v0/seg003.ts`. Mismo archivo, mismo
    // permiso, misma comprobación de arriba: la escalera no abre una puerta nueva, es otra
    // forma de servir la misma pieza. Quien no puede ver el video tampoco puede pedir sus
    // fragmentos.
    const hlsSub = url.searchParams.get("hls");
    if (hlsSub && galIsVideo) {
      const { resolveGaleriaHls, reescribirListaHls, carpetaDeTrozoHls } = await import("@/lib/nas-galeria");
      const parte = await resolveGaleriaHls(file.path, hlsSub);
      if (!parte) return new NextResponse("Esta pieza no tiene escalera (o no ese trozo)", { status: 404 });

      if (hlsSub.endsWith(".m3u8")) {
        const texto = await fs.readFile(parte.abs, "utf8");
        const reescrito = reescribirListaHls(texto, {
          ruta: url.pathname,
          parametros: { t: token },
          carpeta: carpetaDeTrozoHls(hlsSub),
        });
        return new NextResponse(reescrito, {
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "X-Content-Type-Options": "nosniff",
            // Sin caché: la escalera puede rehacerse si el original cambia, y una lista vieja
            // apuntaría a fragmentos que ya no están.
            "Cache-Control": "private, no-store",
          },
        });
      }

      // Un fragmento. Son inmutables mientras exista la escalera —si se rehace, cambia la
      // carpeta entera de golpe—, así que se pueden guardar un rato: es lo que evita volver a
      // pedir por la red lo que el revisor ya vio al retroceder unos segundos.
      const res = await serveDisk(req, parte.abs, parte.name, "video/mp2t", true, true);
      res.headers.set("Cache-Control", "private, max-age=600");
      return res;
    }

    const info = await resolveGaleriaFile(file.path, wantInline && galIsVideo);
    if (!info) return new NextResponse("El archivo ya no está en el disco (¿movido por SMB o LabTem apagado?)", { status: 404 });
    // ¿Se resolvió la copia ligera? Se sabe por dónde vive (dentro de `.proxy/`), no por el
    // nombre: entonces el tipo es el de la copia (mp4), no el del original.
    const esProxy = /[\\/]\.proxy[\\/]/.test(info.abs);
    const outType = esProxy ? "video/mp4" : galType;
    return serveDisk(req, info.abs, esProxy ? info.name : file.name, outType, galIsVideo, wantInline);
  }

  // La sala de revisión reproduce SIEMPRE este archivo tal cual (mismo origen, con Range): así
  // el segundo y la captura del fotograma no dependen de ninguna copia transcodificada.
  const servePath = file.path;
  const serveMime = file.mime;

  // Tipo de contenido: se PREFIERE el mime guardado si es de video (mimeFor mapea webm/ogg a
  // AUDIO, lo que rompería un webm de VIDEO); si no, la tabla por extensión.
  const contentType = serveMime && serveMime.startsWith("video/") ? serveMime : mimeFor(file.name, serveMime);
  const isVideo = contentType.startsWith("video/") || VIDEO_EXT.test(file.name);

  // Previsualización inline: derivado WebP si existe. NUNCA para video (serviría una imagen en
  // vez del video y el <video> no reproduciría). Se sirve completo (las miniaturas son pequeñas).
  if (wantInline && !isVideo) {
    try {
      const webp = await fs.readFile(absPath(previewRel(file.path)));
      return new NextResponse(new Uint8Array(webp), {
        headers: {
          "Content-Type": "image/webp",
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": isThumb ? "private, max-age=3600, must-revalidate" : "private, no-store",
        },
      });
    } catch {
      /* sin preview → sigue con el original */
    }
  }

  let abs: string;
  try { abs = absPath(servePath); } catch { return new NextResponse("Ruta inválida", { status: 400 }); }
  return serveDisk(req, abs, file.name, contentType, isVideo, wantInline);
}

// Sirve un archivo del disco con soporte Range. Compartido entre el storage interno y los
// archivos vivos de Operaciones_LAB (kind OPS): mismo trato de inline-safe y streaming.
async function serveDisk(req: NextRequest, abs: string, name: string, contentType: string, isVideo: boolean, wantInline: boolean) {
  let size: number;
  try { size = (await fs.stat(abs)).size; } catch { return new NextResponse("Archivo no disponible", { status: 404 }); }

  // Inline solo para tipos seguros (imágenes/PDF/audio/VIDEO, que no ejecutan); el resto se
  // fuerza a descarga como octet-stream para evitar XSS vía Content-Type controlado por el cliente.
  const inline = wantInline && (isInlineSafeMime(contentType) || isVideo);
  const outType = inline ? contentType : "application/octet-stream";
  const disposition = inline ? "inline" : "attachment";
  const baseHeaders: Record<string, string> = {
    "Content-Type": outType,
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  };

  // Petición con Range (seek + reproducción en iOS): se responde 206 con el trozo pedido (streaming,
  // sin cargar el archivo entero en memoria).
  const rangeHeader = req.headers.get("range");
  const m = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  if (m && size > 0) {
    let start: number;
    let end: number;
    if (!m[1] && m[2]) {
      // Rango SUFIJO ("bytes=-N") = los ÚLTIMOS N bytes: así busca el navegador el índice («moov»)
      // de un MP4 no optimizado para web, que va al FINAL. Servirle los PRIMEROS N dejaba al
      // <video> sin encontrar el índice y cargando indefinidamente.
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
    const stream = Readable.toWeb(createReadStream(abs, { start, end })) as unknown as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: { ...baseHeaders, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }

  // Sin Range: archivo completo, anunciando Accept-Ranges para que el navegador pueda pedir trozos.
  const stream = Readable.toWeb(createReadStream(abs)) as unknown as ReadableStream;
  return new NextResponse(stream, { status: 200, headers: { ...baseHeaders, "Content-Length": String(size) } });
}
