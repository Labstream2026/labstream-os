import { NextResponse, type NextRequest } from "next/server";
import { resolverEntrega } from "@/lib/galeria-entrega";
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
  const entrega = await resolverEntrega(url.searchParams.get("t") || "");
  if (!entrega.ok) return new NextResponse("No autorizado", { status: 401 });

  let rel: string;
  let carpeta: string;
  try {
    rel = normalizeGaleriaRel(url.searchParams.get("rel") || "");
    carpeta = normalizeGaleriaRel(entrega.folderRel);
  } catch {
    return new NextResponse("Ruta inválida", { status: 400 });
  }

  // Mismo candado que en /media: el token manda la carpeta, el navegador solo elige dentro.
  // Una miniatura filtra tanto como el original —se ve la foto—, así que se comprueba igual.
  if (!dentroDeLaEntrega(carpeta, rel)) return new NextResponse("Prohibido", { status: 403 });

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

// ¿La pieza pedida cuelga de la carpeta que autoriza el token?
//
// Se compara SEGMENTO A SEGMENTO a propósito. Con un `startsWith` pelado, un token para
// «boda-lopez» abriría también «boda-lopez-2», que es la entrega de otro cliente; y un token
// para «acme» abriría «acme-privado». El separador tiene que caer donde toca.
function dentroDeLaEntrega(carpeta: string, rel: string): boolean {
  if (!carpeta || !rel) return false; // un token sin carpeta no autoriza nada
  const base = carpeta.split("/");
  const pieza = rel.split("/");
  if (pieza.length <= base.length) return false; // la carpeta en sí no es una pieza servible
  return base.every((seg, i) => seg === pieza[i]);
}
