import { NextResponse, type NextRequest } from "next/server";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { galeriaSession } from "@/lib/galeria-access";
import { galeriaAbs, galeriaKind, normalizeGaleriaRel } from "@/lib/nas-galeria";
import { carpetaComun } from "@/lib/galeria-seleccion";
import { tituloDe } from "@/lib/galeria-entrega";
import { pesoZip, zipStore, type ZipEntrada } from "@/lib/zip-store";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Descarga VARIAS piezas de la galería en un solo .zip (equipo, con sesión).
//
// Va por POST de formulario, no por fetch: la respuesta lleva Content-Disposition y el
// navegador la trata como descarga normal — con su barra de progreso REAL, porque el zip es
// STORE y su tamaño exacto se calcula antes del primer byte (ver lib/zip-store.ts).
//
// El límite es el mismo de los lotes de la barra (200): esto empaqueta selecciones, no
// respalda discos enteros.
const MAX_PIEZAS = 200;

export async function POST(req: NextRequest) {
  const session = await galeriaSession();
  if (!session) return new NextResponse("No autorizado", { status: 401 });

  // Cinturón anti-CSRF: la descarga viaja con la cookie de sesión, así que solo se acepta el
  // formulario de NUESTRO origen. Los navegadores mandan Origin en todo POST de formulario;
  // sin cabecera o con otro host, fuera.
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.nextUrl.host) {
    return new NextResponse("Origen no permitido", { status: 403 });
  }

  let rels: string[];
  try {
    const form = await req.formData();
    const crudo = JSON.parse(String(form.get("rels") ?? "[]")) as unknown;
    if (!Array.isArray(crudo) || crudo.length === 0) return new NextResponse("No llegó la lista", { status: 400 });
    if (crudo.length > MAX_PIEZAS) return new NextResponse(`Máximo ${MAX_PIEZAS} piezas por zip`, { status: 400 });
    rels = [...new Set(crudo.filter((r): r is string => typeof r === "string").map((r) => normalizeGaleriaRel(r)))].filter(Boolean);
  } catch {
    return new NextResponse("Lista inválida", { status: 400 });
  }

  // Solo piezas que la galería reconoce y que EXISTEN ahora mismo. Una que desapareció entre
  // marcar y descargar simplemente no va — cortar todo el zip por ella no ayuda a nadie.
  const base = carpetaComun(rels);
  const entradas: ZipEntrada[] = [];
  for (const rel of rels) {
    if (!galeriaKind(rel.split("/").pop() || "")) continue;
    try {
      const abs = await galeriaAbs(rel);
      const st = await fs.stat(abs);
      if (!st.isFile()) continue;
      entradas.push({
        // Dentro del zip, la ruta RELATIVA a la carpeta común: se conserva la estructura de
        // subcarpetas sin regalar la ruta completa del NAS.
        nombre: base ? rel.slice(base.length + 1) : rel,
        size: st.size,
        mtime: st.mtime,
        datos: () => createReadStream(abs),
      });
    } catch {
      /* desapareció o no se deja leer: no va */
    }
  }
  if (entradas.length === 0) return new NextResponse("No hay nada que descargar", { status: 404 });

  const total = pesoZip(entradas);
  const nombreZip = `${(base ? tituloDe(base) : "seleccion").replace(/[^\p{L}\p{N} _.-]/gu, "").trim() || "seleccion"}.zip`;

  logActivity({
    action: "galeria.zip",
    summary: `descargó ${entradas.length} ${entradas.length === 1 ? "pieza" : "piezas"} de la galería en un zip`,
    entityType: "galeria",
    entityId: base || entradas[0]!.nombre,
    userId: session.id,
    silent: true,
  }).catch(() => {});

  const stream = Readable.toWeb(Readable.from(zipStore(entradas))) as unknown as ReadableStream;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(total),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombreZip)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
