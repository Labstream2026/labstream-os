import { NextResponse, type NextRequest } from "next/server";
import { galeriaSession } from "@/lib/galeria-access";
import { galeriaEnabled, galeriaReady, resumenCarpeta, normalizeGaleriaRel } from "@/lib/nas-galeria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resumen de UNA carpeta del índice: cuántas piezas tiene, cuánto pesa, cuál es la más
// nueva y qué pieza la representa (la portada).
//
// Va en una ruta aparte y se pide carpeta por carpeta a propósito. Meterlo dentro de
// `/list` obligaría a recorrer las 30 entregas —y sus 7 TB— antes de pintar nada; así el
// índice aparece de inmediato y cada tarjeta se completa sola cuando su resumen llega.
export async function GET(req: NextRequest) {
  const session = await galeriaSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });
  if (!galeriaEnabled() || !(await galeriaReady())) {
    return new NextResponse("La galería no está disponible", { status: 503 });
  }

  let rel: string;
  try {
    rel = normalizeGaleriaRel(new URL(req.url).searchParams.get("rel") || "");
  } catch {
    return new NextResponse("Ruta inválida", { status: 400 });
  }
  if (!rel) return new NextResponse("Falta la carpeta", { status: 400 });

  try {
    const resumen = await resumenCarpeta(rel);
    return NextResponse.json(
      { ok: true, rel, ...resumen },
      // El material cambia por SMB sin avisar a nadie, pero recorrer la carpeta en cada
      // pintado sería absurdo: medio minuto de caché privada es el punto medio.
      { headers: { "Cache-Control": "private, max-age=30" } },
    );
  } catch {
    return new NextResponse("No se pudo leer esa carpeta", { status: 404 });
  }
}
