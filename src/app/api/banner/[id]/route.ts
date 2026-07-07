import { NextRequest, NextResponse } from "next/server";
import { readBuffer } from "@/lib/storage";
import { previewRel } from "@/lib/image";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessProject } from "@/lib/project-access";
import { userCanAccessClient } from "@/lib/client-access";

// Sirve la portada/banner de un cliente o proyecto (storage/banners/<id>).
// Pública (solo imágenes de portada); detecta el tipo por los primeros bytes.
function sniff(buf: Buffer): string {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length > 6 && buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  return "application/octet-stream";
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Los banners solo se muestran dentro de la UI autenticada (app) vía CoverBanner; no se
  // usan en ninguna página pública (/p, /review, /cotizacion). Gateamos tras la sesión para
  // que no sirvan portadas a quien no ha iniciado sesión. Devolvemos 404 (no 401) para no
  // revelar la existencia del recurso a un no autenticado.
  const session = await getSession();
  if (!session) return new NextResponse("No encontrado", { status: 404 });

  const { id } = await ctx.params;
  const safe = id.replace(/[^a-zA-Z0-9]/g, "");
  if (!safe) return new NextResponse("No encontrado", { status: 404 });

  // Control de acceso: el id de la portada es el del proyecto o el del cliente. Solo se sirve a
  // quien tiene acceso a ese proyecto/cliente (evita ver portadas de proyectos/clientes privados
  // ajenos). 404 si no autorizado o si no existe la entidad.
  const project = await db.project.findUnique({
    where: { id: safe },
    select: { isPrivate: true, leadId: true, members: { select: { userId: true, role: true } } },
  });
  const allowed = project ? canAccessProject(project, session) : await userCanAccessClient(safe, session);
  if (!allowed) return new NextResponse("No encontrado", { status: 404 });

  let buf: Buffer;
  let contentType: string;
  try {
    buf = await readBuffer(previewRel(`banners/${safe}`));
    contentType = "image/webp";
  } catch {
    try {
      buf = await readBuffer(`banners/${safe}`);
      contentType = sniff(buf);
    } catch {
      return new NextResponse("No encontrado", { status: 404 });
    }
  }
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
