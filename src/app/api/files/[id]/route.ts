import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessChannel } from "@/lib/chat-access";
import { absPath, verifyFileToken, mimeFor, isInlineSafeMime } from "@/lib/storage";
import { previewRel } from "@/lib/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t");

  const att = await db.messageAttachment.findUnique({
    where: { id },
    include: {
      message: {
        select: {
          channel: {
            select: {
              isPublic: true,
              audience: true,
              section: true,
              project: { select: { leadId: true, members: { select: { userId: true } } } },
              members: { select: { userId: true } },
            },
          },
        },
      },
    },
  });
  if (!att || !att.path) return new NextResponse("No encontrado", { status: 404 });

  // Acceso: token firmado (Document Server OnlyOffice, sin cookie) o usuario con
  // sesión QUE ADEMÁS pueda ver el canal del adjunto (no basta con estar logueado).
  if (!verifyFileToken(id, token)) {
    const session = await getSession();
    if (!session) return new NextResponse("No autorizado", { status: 401 });
    if (!att.message?.channel || !canAccessChannel(att.message.channel, session)) {
      return new NextResponse("Prohibido", { status: 403 });
    }
  }

  const download = url.searchParams.get("download");

  // En previsualización (inline) servimos el derivado WebP optimizado si existe;
  // en descarga, siempre el original a resolución completa.
  let buf: Buffer | null = null;
  let contentType = mimeFor(att.name, att.mime);
  if (!download) {
    try {
      buf = await fs.readFile(absPath(previewRel(att.path)));
      contentType = "image/webp";
    } catch {
      buf = null;
    }
  }
  if (!buf) {
    try {
      buf = await fs.readFile(absPath(att.path));
    } catch {
      return new NextResponse("Archivo no disponible", { status: 404 });
    }
  }

  // Solo servimos inline con el mime real si es un tipo seguro (imágenes/PDF);
  // cualquier otra cosa se fuerza a descarga como octet-stream para evitar que el
  // navegador ejecute contenido (p. ej. SVG/HTML con Content-Type del cliente).
  const wantInline = !download;
  const inline = wantInline && isInlineSafeMime(contentType);
  const disposition = inline ? "inline" : "attachment";
  const outType = inline ? contentType : "application/octet-stream";
  const total = buf.length;
  const commonHeaders: Record<string, string> = {
    "Content-Type": outType,
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(att.name)}`,
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=0, must-revalidate",
  };

  // Soporte de Range (206): imprescindible para que iOS/Safari reproduzca audio/vídeo inline
  // (<audio>/<video> piden rangos y NO reproducen si el servidor responde 200 con todo).
  const range = req.headers.get("range");
  if (range && inline) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m && (m[1] || m[2])) {
      let start: number;
      let end: number;
      if (m[1] === "" && m[2] !== "") {
        // SUFIJO «bytes=-N»: los ÚLTIMOS N bytes (iOS/Safari lo usa para leer el átomo moov al final
        // de un MP4). Antes el código lo interpretaba como bytes 0..N (los PRIMEROS N) → el vídeo no
        // reproducía. Ahora se devuelve la cola real del archivo.
        const n = parseInt(m[2], 10);
        const len = Number.isFinite(n) ? Math.min(Math.max(n, 1), total) : total;
        start = total - len;
        end = total - 1;
      } else {
        start = m[1] ? parseInt(m[1], 10) : 0;
        end = m[2] ? parseInt(m[2], 10) : total - 1;
      }
      if (!Number.isFinite(start) || start < 0) start = 0;
      if (!Number.isFinite(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        return new NextResponse("Rango no satisfacible", { status: 416, headers: { "Content-Range": `bytes */${total}`, "Accept-Ranges": "bytes" } });
      }
      const chunk = buf.subarray(start, end + 1);
      return new NextResponse(new Uint8Array(chunk), {
        status: 206,
        headers: { ...commonHeaders, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(chunk.length) },
      });
    }
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: { ...commonHeaders, "Content-Length": String(total) },
  });
}
