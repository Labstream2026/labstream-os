import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { absPath, verifyFileToken, mimeFor, isInlineSafeMime } from "@/lib/storage";
import { previewRel } from "@/lib/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
} as const;

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
    select: { name: true, path: true, mime: true, projectId: true, project: { select: accessSelect } },
  });
  if (!file || !file.path) return new NextResponse("No encontrado", { status: 404 });

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

  // Auditoría de descargas/aperturas: una vez por archivo servido. Los saltos del <video>
  // (peticiones Range intermedias) no cuentan — solo la primera carga completa o byte 0.
  {
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

  // Copia de revisión (proxy 1080p): con ?proxy=1 se sirve la copia ligera de la versión
  // que usa este archivo, si ya existe. Mismo token y permisos (es contenido DERIVADO del
  // mismo archivo). Si aún no hay proxy —o su archivo faltara en disco—, se cae al
  // original y el reproductor ni se entera.
  let servePath = file.path;
  let serveMime = file.mime;
  if (url.searchParams.get("proxy")) {
    const v = await db.deliverableVersion.findFirst({
      where: { fileAssetId: id, proxyRel: { not: null } },
      select: { proxyRel: true },
    });
    if (v?.proxyRel) {
      try {
        await fs.stat(absPath(v.proxyRel));
        servePath = v.proxyRel;
        serveMime = "video/mp4"; // el proxy SIEMPRE es MP4, sea cual sea el original
      } catch { /* proxy anotado pero sin archivo → original */ }
    }
  }

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
          "Cache-Control": "private, no-store",
        },
      });
    } catch {
      /* sin preview → sigue con el original */
    }
  }

  let abs: string;
  try { abs = absPath(servePath); } catch { return new NextResponse("Ruta inválida", { status: 400 }); }
  let size: number;
  try { size = (await fs.stat(abs)).size; } catch { return new NextResponse("Archivo no disponible", { status: 404 }); }

  // Inline solo para tipos seguros (imágenes/PDF/audio/VIDEO, que no ejecutan); el resto se
  // fuerza a descarga como octet-stream para evitar XSS vía Content-Type controlado por el cliente.
  const inline = wantInline && (isInlineSafeMime(contentType) || isVideo);
  const outType = inline ? contentType : "application/octet-stream";
  const disposition = inline ? "inline" : "attachment";
  const baseHeaders: Record<string, string> = {
    "Content-Type": outType,
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
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
