import fs from "node:fs/promises";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { absPath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Descarga una versión ANTERIOR de un documento del proyecto. Mismo criterio de acceso que la
// página del editor: quien puede ver el proyecto puede ver su historial.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const v = await db.fileVersion.findUnique({
    where: { id },
    select: {
      path: true,
      version: true,
      file: {
        select: {
          name: true,
          deletedAt: true,
          project: { select: { isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } } },
        },
      },
    },
  });
  if (!v) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  // El archivo padre en la papelera = su historial tampoco se sirve (esta ruta no pasa por
  // /api/files-asset, así que sería una puerta lateral para bajar una versión de algo borrado).
  if (v.file.deletedAt) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (!canAccessProject(v.file.project, session)) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  let buf: Buffer;
  try {
    buf = await fs.readFile(absPath(v.path));
  } catch {
    return NextResponse.json({ error: "La copia ya no está en el disco" }, { status: 404 });
  }

  // El nombre lleva el número de versión para no confundirla con el documento vigente.
  const punto = v.file.name.lastIndexOf(".");
  const nombre = punto > 0 ? `${v.file.name.slice(0, punto)} (v${v.version})${v.file.name.slice(punto)}` : `${v.file.name} (v${v.version})`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(buf.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
