import { NextResponse, type NextRequest } from "next/server";
import { galeriaSession } from "@/lib/galeria-access";
import { galeriaEnabled, galeriaReady, listGaleriaFolders, normalizeGaleriaRel } from "@/lib/nas-galeria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// UN nivel de subcarpetas, para expandir una rama del árbol lateral.
//
// El servidor ya manda desplegada la rama donde estás (ver espinaDelArbol); esto es solo para
// cuando alguien abre OTRA rama a mano. Devuelve nombres, nada de material: es una lectura de
// directorio, no un escaneo — abrir una rama no puede costar lo que abrir la carpeta.
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

  const folders = await listGaleriaFolders(rel).catch(() => null);
  if (!folders) return new NextResponse("No se pudo leer esa carpeta", { status: 404 });
  return NextResponse.json(
    { ok: true, rel, folders: folders.map((f) => ({ rel: f.rel, name: f.name, mtimeMs: f.mtimeMs })) },
    // Media hora de caché privada: la estructura de carpetas cambia mucho menos que su
    // contenido, y expandir el árbol dos veces seguidas no debería volver a tocar el NAS.
    { headers: { "Cache-Control": "private, max-age=1800" } },
  );
}
