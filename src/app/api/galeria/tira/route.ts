import { NextResponse, type NextRequest } from "next/server";
import { galeriaSession } from "@/lib/galeria-access";
import { galeriaSprite } from "@/lib/nas-galeria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// La tira de barrido de un video: 20 fotogramas en una fila, hechos por LabTem. La cuadrícula
// la pide SOLO cuando el ratón entra en la miniatura — pedirla para las 300 piezas de una
// entrega al pintar sería mover megas que casi nadie va a mirar.
//
// 404 cuando el clip es demasiado corto para tener tira, o cuando LabTem aún no la ha hecho.
// La cuadrícula lo trata como «esta pieza no se barre» y sigue con su póster: no es un error.
export async function GET(req: NextRequest) {
  const session = await galeriaSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });

  const url = new URL(req.url);
  const rel = url.searchParams.get("rel") || "";
  try {
    const jpg = await galeriaSprite(rel);
    if (!jpg) return new NextResponse("Sin tira", { status: 404 });
    return new NextResponse(new Uint8Array(jpg), {
      headers: {
        "Content-Type": "image/jpeg",
        "X-Content-Type-Options": "nosniff",
        // Con ?v=<mtime> la URL cambia si el video cambia, así que se puede cachear un día.
        "Cache-Control": url.searchParams.get("v") ? "private, max-age=86400" : "private, no-store",
      },
    });
  } catch {
    return new NextResponse("Sin tira", { status: 404 });
  }
}
