import { NextResponse, type NextRequest } from "next/server";
import { resolverAcceso, alcanceAutoriza } from "@/lib/galeria-seleccion";
import { galeriaThumb, normalizeGaleriaRel } from "@/lib/nas-galeria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Miniatura WebP de una pieza, para la cuadrícula del cliente. 404 cuando LabTem todavía no ha
// fabricado la copia o el póster: la cuadrícula lo pinta como «preparando», que es la verdad, y
// no como una imagen rota.
//
// La cuadrícula manda ?v=<mtime>, así que la URL cambia si el archivo cambia y se puede cachear
// fuerte en el navegador sin quedarse viendo una miniatura vieja.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  // El acceso puede venir de un enlace de ENTREGA (una carpeta) o de una SELECCIÓN (una lista
  // de piezas): resolverAcceso distingue el token y alcanceAutoriza hace la única pregunta que
  // importa aquí — ¿esta pieza está dentro de lo autorizado?
  const acceso = await resolverAcceso(url.searchParams.get("t") || "");
  if (!acceso.ok) return new NextResponse("No autorizado", { status: 401 });

  let rel: string;
  try {
    rel = normalizeGaleriaRel(url.searchParams.get("rel") || "");
  } catch {
    return new NextResponse("Ruta inválida", { status: 400 });
  }

  // Mismo candado que en /media: el token manda el alcance, el navegador solo elige dentro.
  // Una miniatura filtra tanto como el original —se ve la foto—, así que se comprueba igual.
  if (!alcanceAutoriza(acceso.alcance, rel)) return new NextResponse("Prohibido", { status: 403 });

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
