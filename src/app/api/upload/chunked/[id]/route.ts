import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getSession } from "@/lib/auth";
import { partPath, readChunkMeta, removeChunkUpload, withChunkLock } from "@/lib/chunked-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Subida por TROZOS (append / estado / cancelar) ──
// PUT ?offset=N: agrega un trozo AL FINAL del archivo parcial (validando el offset — si no
// coincide, 409 con lo recibido para que el cliente se resincronice). El cuerpo se escribe en
// STREAMING a disco: la RAM se mantiene plana sin importar el tamaño del archivo.
const MAX_CHUNK = 32 * 1024 * 1024; // un trozo nunca supera 32 MB

async function authed(id: string) {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Sin sesión" }, { status: 401 }) };
  const meta = await readChunkMeta(id);
  if (!meta) return { error: NextResponse.json({ error: "Subida no encontrada o vencida" }, { status: 404 }) };
  if (meta.userId !== session.id) return { error: NextResponse.json({ error: "Sin permiso" }, { status: 403 }) };
  return { session, meta };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await authed(id);
  if ("error" in r) return r.error;
  const st = await fs.stat(partPath(id)).catch(() => null);
  return NextResponse.json({ received: st?.size ?? 0, size: r.meta.size });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await authed(id);
  if ("error" in r) return r.error;
  const { meta } = r;

  const offset = Number(new URL(req.url).searchParams.get("offset"));
  const len = Number(req.headers.get("content-length"));
  if (!Number.isFinite(offset) || offset < 0) return NextResponse.json({ error: "Offset inválido" }, { status: 400 });
  if (!Number.isFinite(len) || len <= 0 || len > MAX_CHUNK) {
    return NextResponse.json({ error: "Trozo inválido (máx. 32 MB, con Content-Length)" }, { status: 411 });
  }
  if (offset + len > meta.size) return NextResponse.json({ error: "El trozo excede el tamaño anunciado" }, { status: 400 });
  const body = req.body;
  if (!body) return NextResponse.json({ error: "Sin cuerpo" }, { status: 400 });

  return withChunkLock(id, async () => {
    const part = partPath(id);
    const st = await fs.stat(part).catch(() => null);
    const current = st?.size ?? 0;
    // Reintento/duplicado del MISMO trozo ya escrito: idempotente, no se re-escribe.
    if (offset + len <= current) return NextResponse.json({ received: current });
    if (offset !== current) return NextResponse.json({ error: "Fuera de secuencia", received: current }, { status: 409 });

    await pipeline(
      Readable.fromWeb(body as unknown as import("node:stream/web").ReadableStream),
      createWriteStream(part, { flags: "a" }),
    );
    const after = await fs.stat(part);
    // Si la conexión se cortó a mitad del trozo, quedó un pedazo suelto: se RECORTA de vuelta
    // al offset esperado para que el reintento del cliente appendee limpio (sin bytes a medias).
    if (after.size !== offset + len) {
      if (after.size > offset) await fs.truncate(part, offset).catch(() => {});
      return NextResponse.json({ error: "Trozo incompleto — reintenta", received: offset }, { status: 400 });
    }
    return NextResponse.json({ received: after.size });
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await authed(id);
  if ("error" in r) return r.error;
  await removeChunkUpload(id);
  return NextResponse.json({ ok: true });
}
