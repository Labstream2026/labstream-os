import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { absPath, verifyFileToken, mimeFor } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const accessSelect = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
} as const;

// Sirve un archivo LOCAL de proyecto (FileAsset). Acceso: token firmado (Document
// Server de OnlyOffice, sin cookie) o usuario con sesión y acceso al proyecto.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const token = url.searchParams.get("t");

  const file = await db.fileAsset.findUnique({
    where: { id },
    select: { name: true, path: true, mime: true, project: { select: accessSelect } },
  });
  if (!file || !file.path) return new NextResponse("No encontrado", { status: 404 });

  if (!verifyFileToken(id, token)) {
    const session = await getSession();
    if (!session) return new NextResponse("No autorizado", { status: 401 });
    if (!canAccessProject(file.project, session)) return new NextResponse("Prohibido", { status: 403 });
  }

  let buf: Buffer;
  try {
    buf = await fs.readFile(absPath(file.path));
  } catch {
    return new NextResponse("Archivo no disponible", { status: 404 });
  }

  const disposition = url.searchParams.get("download") ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mimeFor(file.name, file.mime),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
