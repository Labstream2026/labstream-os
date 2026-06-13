import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { absPath, verifyFileToken, mimeFor } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t");

  // Acceso: usuario con sesión (in-app) o token firmado (Document Server OnlyOffice, sin cookie).
  const authed = verifyFileToken(id, token) || Boolean(await getSession());
  if (!authed) return new NextResponse("No autorizado", { status: 401 });

  const att = await db.messageAttachment.findUnique({ where: { id } });
  if (!att || !att.path) return new NextResponse("No encontrado", { status: 404 });

  let buf: Buffer;
  try {
    buf = await fs.readFile(absPath(att.path));
  } catch {
    return new NextResponse("Archivo no disponible", { status: 404 });
  }

  const disposition = url.searchParams.get("download") ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mimeFor(att.name, att.mime),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(att.name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
