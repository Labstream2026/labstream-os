import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { getSession, hasPermission } from "@/lib/auth";
import { absPath, verifyFileToken, mimeFor } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sirve el archivo de una PLANTILLA de documento. Dos puertas, como con los archivos de
// proyecto: token firmado (el Document Server, que no lleva cookie) o sesión del equipo.
// Las plantillas son de la empresa: cualquiera del equipo puede verlas; el cliente no.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);

  const t = await db.docTemplate.findUnique({ where: { id }, select: { name: true, ext: true, path: true } });
  if (!t) return new NextResponse("No encontrada", { status: 404 });

  if (!verifyFileToken(id, url.searchParams.get("t"))) {
    const session = await getSession();
    if (!session) return new NextResponse("No autorizado", { status: 401 });
    if (session.role === "cliente" || !hasPermission(session, "ver_archivos")) {
      return new NextResponse("Prohibido", { status: 403 });
    }
  }

  let buf: Buffer;
  try {
    buf = await fs.readFile(absPath(t.path));
  } catch {
    return new NextResponse("El archivo de la plantilla no está en el disco", { status: 404 });
  }
  const nombre = `${t.name}.${t.ext}`;
  const disp = url.searchParams.get("download") ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mimeFor(nombre) ?? "application/octet-stream",
      "Content-Length": String(buf.length),
      "Content-Disposition": `${disp}; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
