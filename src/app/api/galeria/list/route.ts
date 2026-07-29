import { NextResponse, type NextRequest } from "next/server";
import { galeriaSession } from "@/lib/galeria-access";
import { galeriaEnabled, galeriaReady, listGaleriaFolders, scanGaleria, normalizeGaleriaRel } from "@/lib/nas-galeria";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sin `rel` → las carpetas de entrega (una por cliente/proyecto).
// Con `rel` → la línea de tiempo de esa entrega, ya agrupada por mes y día.
//
// Nunca devuelve 500 por que el NAS no esté: si el montaje falta, contesta 200 con
// `ready:false` y un motivo legible, para que la pantalla lo explique en vez de romperse.
export async function GET(req: NextRequest) {
  const session = await galeriaSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });

  if (!galeriaEnabled()) {
    return NextResponse.json({
      ok: true,
      ready: false,
      motivo: "sin_configurar",
      mensaje: "La galería no está configurada en este servidor (falta la variable NAS_GALERIA_DIR).",
    });
  }
  if (!(await galeriaReady())) {
    return NextResponse.json({
      ok: true,
      ready: false,
      motivo: "sin_montar",
      mensaje: "La carpeta de LabTem no responde. Puede que el montaje se haya caído tras un reinicio del NAS.",
    });
  }

  const url = new URL(req.url);
  let rel: string;
  try {
    rel = normalizeGaleriaRel(url.searchParams.get("rel") || "");
  } catch {
    return new NextResponse("Ruta inválida", { status: 400 });
  }

  try {
    // `?solo=carpetas` devuelve las SUBCARPETAS de cualquier nivel, sin la línea de tiempo.
    // Lo pide el selector de destino al mover material: navegar el árbol no necesita
    // escanear las piezas de cada carpeta, que es lo caro.
    if (url.searchParams.get("solo") === "carpetas") {
      const folders = await listGaleriaFolders(rel);
      return NextResponse.json({ ok: true, ready: true, rel, folders });
    }
    if (!rel) {
      const folders = await listGaleriaFolders("");
      return NextResponse.json({ ok: true, ready: true, rel: "", folders });
    }
    const scan = await scanGaleria(rel);
    return NextResponse.json({ ok: true, ready: true, rel, scan });
  } catch {
    return new NextResponse("No se pudo leer esa carpeta", { status: 404 });
  }
}
