import { createReadStream } from "node:fs";
import { stat as fsStat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { absPath } from "@/lib/storage";
import { verifyProposalToken } from "@/lib/proposals/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sirve un medio de la BIBLIOTECA de propuestas (video de fondo, logo, imagen).
//
// Autorización: sesión del equipo, o el token firmado de CUALQUIER propuesta (?t=). La
// biblioteca es material de marca de Labstream —los mismos fondos y logos que se ven dentro
// de las propuestas—, no información de un cliente; atarla a una propuesta concreta obligaría
// a duplicar cada video por propuesta, que es justo lo que esta biblioteca evita.
//
// Soporta HTTP Range (206): sin él iOS Safari no reproduce <video> y el fondo del hero se
// quedaría negro en el celular, que es donde muchos clientes abren la propuesta.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9]+$/i.test(id)) return new NextResponse("Not found", { status: 404 });

  const token = req.nextUrl.searchParams.get("t");
  const authorized = (token != null && !!verifyProposalToken(token)) || !!(await getSession());
  if (!authorized) return new NextResponse("Not found", { status: 404 });

  const asset = await db.proposalAsset.findUnique({ where: { id }, select: { rel: true, mime: true } });
  if (!asset) return new NextResponse("Not found", { status: 404 });

  let abs: string;
  try { abs = absPath(asset.rel); } catch { return new NextResponse("Not found", { status: 404 }); }
  let size: number;
  try { size = (await fsStat(abs)).size; } catch { return new NextResponse("Not found", { status: 404 }); }

  // Tipo seguro: solo video/imagen se sirven inline; cualquier otra cosa se fuerza a descarga
  // para que nunca se ejecute en este origen.
  const inlineOk = /^(video|image)\//.test(asset.mime);
  const baseHeaders: Record<string, string> = {
    "Content-Type": inlineOk ? asset.mime : "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    // Privado pero cacheable en el navegador: un fondo de video se vuelve a pedir en cada
    // diapositiva y no queremos re-descargarlo. Nunca en caché compartida.
    "Cache-Control": "private, max-age=86400",
    ...(inlineOk ? {} : { "Content-Disposition": "attachment" }),
  };

  const rangeHeader = req.headers.get("range");
  const m = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  if (m && size > 0) {
    let start: number;
    let end: number;
    if (!m[1] && m[2]) {
      // Sufijo "bytes=-N" = los ÚLTIMOS N bytes (así busca el navegador el índice de un MP4
      // que no esté optimizado para web).
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
