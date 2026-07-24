import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { opsSession } from "@/lib/ops-access";
import { opsAbs, normalizeOpsRel } from "@/lib/nas-ops";
import { mimeFor, isInlineSafeMime } from "@/lib/storage";
import { verifyScopedToken } from "@/lib/signed-token";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIDEO_EXT = /\.(mp4|m4v|mov|mkv|ogv|webm)$/i;

// Sirve un archivo VIVO de Operaciones_LAB. Acceso: sesión del equipo, o token firmado
// «opsdoc» de corta vida (el Document Server de OnlyOffice descarga sin cookie).
// Con HTTP Range (206) para que el <video> reproduzca y busque, igual que files-asset.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  let rel: string;
  try {
    rel = normalizeOpsRel(url.searchParams.get("path") || "");
  } catch {
    return new NextResponse("Ruta inválida", { status: 400 });
  }
  if (!rel) return new NextResponse("Ruta inválida", { status: 400 });

  const token = url.searchParams.get("t");
  const tokenOk = token ? verifyScopedToken("opsdoc", token) === rel : false;
  let viewerId: string | null = null;
  if (!tokenOk) {
    const session = await opsSession();
    if (!session) return new NextResponse("No autorizado", { status: 401 });
    viewerId = session.id;
  }

  let abs: string;
  try {
    abs = await opsAbs(rel);
  } catch {
    return new NextResponse("Ruta inválida", { status: 400 });
  }
  let size: number;
  try {
    const st = await fs.stat(abs);
    if (!st.isFile()) return new NextResponse("No encontrado", { status: 404 });
    size = st.size;
  } catch {
    return new NextResponse("El archivo ya no está ahí (¿movido desde el NAS?)", { status: 404 });
  }

  const name = rel.split("/").pop() || "archivo";

  // Auditoría (silenciosa): una vez por apertura real, no por cada trozo Range.
  {
    const range = req.headers.get("range");
    if (!range || /^bytes=0-/.test(range)) {
      logActivity({
        action: "file.download",
        summary: `abrió/descargó «${name}» de Operaciones_LAB`,
        entityType: "ops",
        entityId: rel,
        userId: viewerId,
        actorName: viewerId ? undefined : "OnlyOffice (token firmado)",
        silent: true,
      }).catch(() => {});
    }
  }

  const contentType = mimeFor(name);
  const isVideo = contentType.startsWith("video/") || VIDEO_EXT.test(name);
  const wantInline = !url.searchParams.get("download");
  const inline = wantInline && (isInlineSafeMime(contentType) || isVideo);
  const outType = inline ? contentType : "application/octet-stream";
  const baseHeaders: Record<string, string> = {
    "Content-Type": outType,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  };

  const rangeHeader = req.headers.get("range");
  const m = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  if (m && size > 0) {
    let start: number;
    let end: number;
    if (!m[1] && m[2]) {
      // Rango sufijo ("bytes=-N") = los ÚLTIMOS N bytes (el índice «moov» de un MP4 va al final).
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

  const stream = Readable.toWeb(createReadStream(abs)) as unknown as ReadableStream;
  return new NextResponse(stream, { status: 200, headers: { ...baseHeaders, "Content-Length": String(size) } });
}
