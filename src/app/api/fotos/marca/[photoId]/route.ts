import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessProject } from "@/lib/project-access";
import { readBuffer, verifyFileToken } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_ACCESS_SELECT = {
  isPrivate: true,
  leadId: true,
  members: { select: { userId: true, role: true } },
} as const;

// ── La foto RAYADA por el cliente (JPEG aplanado del lienzo) ──
// La sirve aparte de la BD (el archivo vive en fotos-marcas/<photoId>.jpg del storage interno)
// para que la sala y el estudio no carguen dataURLs gigantes en el HTML. Acceso: token firmado
// («marca:<photoId>», mismo HMAC de los archivos — así la sala del cliente la ve sin sesión) o
// alguien del equipo con acceso al proyecto. Ver una marca no se audita: es parte de mirar la
// galería, no una descarga.
export async function GET(req: NextRequest, ctx: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await ctx.params;
  if (!/^[a-z0-9]{20,32}$/i.test(photoId)) return new NextResponse("Ruta inválida", { status: 400 });

  const token = new URL(req.url).searchParams.get("t");
  if (!verifyFileToken(`marca:${photoId}`, token)) {
    const session = await getSession().catch(() => null);
    if (!session) return new NextResponse("No autorizado", { status: 401 });
    const photo = await db.deliverablePhoto.findUnique({
      where: { id: photoId },
      select: { deliverable: { select: { project: { select: PROJECT_ACCESS_SELECT } } } },
    });
    if (!photo || !canAccessProject(photo.deliverable.project, session)) return new NextResponse("Prohibido", { status: 403 });
  }

  let buf: Buffer;
  try {
    buf = await readBuffer(`fotos-marcas/${photoId}.jpg`);
  } catch {
    return new NextResponse("Sin marca", { status: 404 });
  }
  const etag = `"${crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16)}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(buf.length),
      // Privada y corta: el cliente puede volver a rayar y la marca cambia bajo la misma URL.
      "cache-control": "private, max-age=60",
      ETag: etag,
    },
  });
}
