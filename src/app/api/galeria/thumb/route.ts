import { NextResponse, type NextRequest } from "next/server";
import { galeriaSession } from "@/lib/galeria-access";
import { galeriaThumb } from "@/lib/nas-galeria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Miniatura WebP de una pieza. 404 cuando LabTem todavía no ha fabricado la copia o el póster:
// la cuadrícula lo interpreta como «preparando», que es la verdad, y no como un error.
//
// La cuadrícula manda ?v=<mtime>, así que la URL cambia si el archivo cambia y se puede
// cachear fuerte en el navegador sin quedarse viendo una miniatura vieja.
export async function GET(req: NextRequest) {
  const session = await galeriaSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });

  const url = new URL(req.url);
  const rel = url.searchParams.get("rel") || "";
  const grande = url.searchParams.get("grande");
  try {
    const webp = await galeriaThumb(rel, grande ? 1600 : 640);
    if (!webp) return new NextResponse("Sin miniatura", { status: 404 });
    return new NextResponse(new Uint8Array(webp), {
      headers: {
        "Content-Type": "image/webp",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": url.searchParams.get("v") ? "private, max-age=86400" : "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Sin miniatura", { status: 404 });
  }
}
