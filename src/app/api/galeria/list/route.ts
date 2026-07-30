import { NextResponse, type NextRequest } from "next/server";
import { galeriaSession } from "@/lib/galeria-access";
import { galeriaEnabled, galeriaReady, listGaleriaFolders, listGaleriaNivel, needsProxy, proxyRelFor, scanGaleria, normalizeGaleriaRel } from "@/lib/nas-galeria";

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
    // `?vista=nivel` = el explorador: SOLO lo que hay en esta carpeta —sus subcarpetas y su
    // material suelto—, sin bajar a los hijos. Es lo que respeta cómo organizó el equipo el
    // disco; la línea de tiempo (abajo) aplana ocho niveles y esa forma se pierde.
    if (url.searchParams.get("vista") === "nivel") {
      const crudo = await listGaleriaNivel(rel);
      // Las piezas salen con la MISMA forma que las de la línea de tiempo (GaleriaItem), así
      // la cuadrícula, la selección y el visor se reutilizan tal cual. La fecha es la del
      // archivo (`exact:false`): aquí se ordena por carpeta y nombre, no por día de disparo,
      // y leer el EXIF de cada pieza costaría una apertura por archivo sin cambiar nada.
      const items = crudo.archivos
        .filter((a): a is typeof a & { kind: Exclude<typeof a.kind, "doc"> } => a.kind !== "doc")
        .map((a) => ({
          rel: a.rel,
          name: a.name,
          kind: a.kind,
          size: a.size,
          ext: (a.name.split(".").pop() || "").toLowerCase(),
          takenAt: new Date(a.mtimeMs).toISOString(),
          exact: false,
          needsProxy: needsProxy(a.name),
          proxyRel: proxyRelFor(a.rel, a.kind),
        }));
      return NextResponse.json({
        ok: true,
        ready: true,
        rel,
        nivel: {
          carpetas: crudo.carpetas,
          items,
          photos: items.filter((i) => i.kind === "photo").length,
          videos: items.filter((i) => i.kind === "video").length,
          bytes: items.reduce((n, i) => n + i.size, 0),
        },
      });
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
